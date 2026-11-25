// The API client (zorzo-api LLD "Front against the API"): health, the conversation id, and the question as a
// stream. Same origin as the page (ADR 0003, CloudFront in production, tools/serve.py locally), so the paths
// are relative. Each stream event becomes {kind, ...data}, the shape the interface reads.

const SESSION_KEY = "conversation";
const TURNSTILE = "unverified";   // the API only checks it is non-empty until F01-T04 adds the widget

/** Why a question got no stream: offline (503 or no network), dropped (cut before `done`), failed (anything else). */
export class AskError extends Error {
  constructor(kind, status) { super(`ask ${kind}${status ? ` (${status})` : ""}`); this.kind = kind; this.status = status; }
}

let memoryId = null;   // when session storage is blocked: one id for this page view
/** The conversation id: a UUID created on the first question, kept in the tab's session storage. */
export function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID());
  }
}

/** "online", "degraded" (search-only mode) or "offline". Never throws. */
export async function health() {
  try {
    const res = await fetch("/api/healthz", { cache: "no-store" });
    if (!res.ok) return "offline";
    const body = await res.json();
    if (body.status !== "ok") return "offline";
    return body.mode === "degraded" ? "degraded" : "online";
  } catch {
    return "offline";
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
    if (!signal.aborted) reader.cancel().catch(() => {});   // the reader stopped early: release the connection
  }
}

/**
 * Asks the API: POST /api/v1/ask, read as a stream of events ending with `done`. Throws AskError when there is
 * no stream or it ends early; an abort through `signal` throws the browser's AbortError.
 */
export async function* ask(question, { signal }) {
  let res;
  try {
    res = await fetch("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ q: question, session: sessionId(), turnstile: TURNSTILE }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new AskError("offline");
  }
  if (res.status === 503) throw new AskError("offline", 503);
  if (!res.ok || !res.body) throw new AskError("failed", res.status);
  try {
    for await (const ev of read(res.body, signal)) {
      yield ev;
      if (ev.kind === "done") return;
    }
  } catch (err) {
    if (signal.aborted || err instanceof AskError) throw err;
    throw new AskError("dropped");
  }
  throw new AskError("dropped");
}
