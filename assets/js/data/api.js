// The API client (zorzo-api LLD "Front against the API"): health, the conversation id and its idle reset, and
// the question as a stream. Same origin as the page (ADR 0003, CloudFront in production, tools/serve.py locally), so the paths
// are relative. Each stream event becomes {kind, ...data}, the shape the interface reads.

const SESSION_KEY = "conversation";
const ASKED_KEY = "conversation-asked";   // when the conversation's last question was sent (ms since the epoch)
const SESSION_TTL = 30 * 60 * 1000;       // SESSION_TTL (LLD "Values and configuration"): idle this long, it starts over
// 503 from the API; 502 and 504 from CloudFront or Caddy when the API doesn't answer (LLD "Front against the API")
const OFFLINE_STATUS = new Set([502, 503, 504]);
const HEALTH_TIMEOUT = 10_000;   // a check that hangs counts as offline, so the next one can run

/**
 * Why a question got no answer: the gate refused it (invalid: 422; bot: 403, or no bot-check token; limited: 429,
 * with `retryAfter` in seconds), offline (502, 503, 504 or no network), dropped (the stream ended before `done`),
 * failed (any other status, a frame that isn't JSON, or an `error` event, whose `done` gives the trace id).
 */
export class AskError extends Error {
  constructor(kind, { traceId = null, retryAfter = null } = {}) {
    super(`ask ${kind}`); this.kind = kind; this.traceId = traceId; this.retryAfter = retryAfter;
  }
}
const GATE_STATUS = { 422: "invalid", 403: "bot", 429: "limited" };   // the gate's refusals (LLD "Errors")

// When session storage is blocked or full: the conversation lives for this page view.
const memory = new Map();
function load(key) {
  if (memory.has(key)) return memory.get(key);
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { sessionStorage.setItem(key, value); } catch { memory.set(key, value); }
}

/** The conversation id: a UUID created on the first question, kept in the tab's session storage. */
export function sessionId() {
  let id = load(SESSION_KEY);
  if (!id) { id = crypto.randomUUID(); store(SESSION_KEY, id); }
  return id;
}

/** A new conversation: a new id, and no question asked in it yet. */
export function newConversation() {
  store(SESSION_KEY, crypto.randomUUID());
  store(ASKED_KEY, "");
}

/**
 * Marks a question as sent in the conversation. After `SESSION_TTL` with no question, the conversation starts
 * over first (a new id); returns whether it did, so the page can say so.
 */
export function questionSent() {
  const now = Date.now(), last = Number(load(ASKED_KEY) || Number.NaN);
  const idle = Number.isFinite(last) && now - last > SESSION_TTL;
  if (idle) newConversation();
  store(ASKED_KEY, String(now));
  return idle;
}

/** "online", "degraded" (search-only mode) or "offline". Never throws. */
export async function health() {
  const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), HEALTH_TIMEOUT);
  try {
    const res = await fetch("/api/healthz", { cache: "no-store", signal: timeout.signal });
    if (!res.ok) return "offline";
    const body = await res.json();
    if (body.status !== "ok") return "offline";
    return body.mode === "degraded" ? "degraded" : "online";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

/** The events of an SSE body: `event:` and `data:` lines up to a blank line; `: ping` comments are skipped. */
async function* read(body, signal) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", event = "", data = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += value;
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        const line = buf.slice(0, nl).replace(/\r$/, "");   // a frame may end in \r\n, split across chunks
        buf = buf.slice(nl + 1);
        if (!line) {
          if (data.length) {
            let payload;
            try { payload = JSON.parse(data.join("\n")); } catch { throw new AskError("failed"); }
            yield { kind: event, ...payload };
          }
          event = ""; data = [];
        } else if (!line.startsWith(":")) {
          const colon = line.indexOf(":"), field = colon < 0 ? line : line.slice(0, colon);
          const val = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "event") event = val;
          else if (field === "data") data.push(val);
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});   // stopped early or ended: release the connection (a no-op after an abort)
  }
}

/** Seconds from a `Retry-After` header in seconds (the form the API sends), or null. */
function retryAfter(res) {
  const value = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Asks the API: POST /api/v1/ask with the question's bot-check token, read as a stream of events ending with
 * `done`. Throws AskError when there is no stream or it ends early; an abort through `signal` throws the
 * browser's AbortError.
 */
export async function* ask(question, { signal, token }) {
  let failed = false;
  let res;
  try {
    res = await fetch("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ q: question, session: sessionId(), turnstile: token }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new AskError("offline");
  }
  if (OFFLINE_STATUS.has(res.status)) throw new AskError("offline");
  if (GATE_STATUS[res.status]) throw new AskError(GATE_STATUS[res.status], { retryAfter: retryAfter(res) });
  if (!res.ok || !res.body) throw new AskError("failed");
  try {
    for await (const ev of read(res.body, signal)) {
      if (ev.kind === "error") { failed = true; continue; }   // only `done` follows, with the trace id
      if (ev.kind === "done" && failed) throw new AskError("failed", { traceId: ev.trace_id });
      yield ev;
      if (ev.kind === "done") return;
    }
  } catch (err) {
    if (signal.aborted || err instanceof AskError) throw err;
  }
  throw new AskError(failed ? "failed" : "dropped");   // cut or closed before `done`; after `error`, still a failure
}
