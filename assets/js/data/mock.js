// The local stand-in for `POST /api/v1/ask` until F01-T03: a BM25 search over the published corpus that
// emits the same stream events as the API in search-only mode (zorzo-api `contracts/sse-v1.schema.json`).
// F01-T03 replaces this module with the API client; the interface only sees the events.

import { namedIn, term, words } from "../text.js";
import { norm } from "../util.js";
import { loadPublished } from "./published.js";

const MAX_PASSAGES = 6;   // zorzo-api LLD, DEGRADED_MAX_PASSAGES
// The prototype's guard, kept as it was: broad on purpose, and gone with the mock (the real gate is F01-T04).
const OVERRIDE = /(ignore|ignora|disregard|system prompt|prompt do sistema|jailbreak|suas instru|your instruc|pretend|finja)/;

let index = null;
function buildIndex(chunks) {
  const docs = chunks.map((c) => words(`${c.heading} ${c.heading} ${c.text}`).map(term));
  const df = new Map();
  docs.forEach((d) => new Set(d).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  return { docs, df, avg: docs.reduce((a, d) => a + d.length, 0) / docs.length };
}

function search(q, chunks, entities) {
  if (!chunks.length) return [];
  index ??= buildIndex(chunks);
  const { docs, df, avg } = index, qt = words(q).map(term);
  const scored = docs.map((d) => {
    let sc = 0;
    for (const w of new Set(qt)) {
      const f = d.filter((x) => x === w || (w.length > 4 && x.startsWith(w))).length; if (!f) continue;
      const idf = Math.log(1 + (docs.length - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5));
      sc += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.length / avg));
    }
    return sc;
  });
  namedIn(entities, q).forEach((j) => entities[j].chunks.forEach((k) => { scored[k] = scored[k] * 1.5 + 0.6; }));
  const ranked = scored.map((sc, k) => ({ sc, k })).filter((r) => r.sc > 0).sort((a, b) => b.sc - a.sc);
  const top = ranked[0]?.sc || 0;
  return ranked.filter((r) => r.sc >= top * 0.35).slice(0, MAX_PASSAGES);
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const id = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(id); reject(signal.reason); }, { once: true });
});

/** Async iterator of stream events for one question; aborting `signal` stops it. */
export async function* ask(question, { signal } = {}) {
  const { corpus, entities } = await loadPublished();
  const trace_id = crypto.randomUUID();
  const done = { kind: "done", trace_id, cached: false, abstained: false, suggestion: null };
  yield { kind: "stage", name: "guard", status: "start", ms: null };
  await wait(200, signal);
  if (OVERRIDE.test(norm(question))) {
    yield { kind: "blocked", layer: "L2", category: "instruction_override", message: "" };
    yield done;
    return;
  }
  yield { kind: "stage", name: "guard", status: "end", ms: 200 };
  yield { kind: "stage", name: "retrieve", status: "start", ms: null };
  const t0 = performance.now(), hits = search(question, corpus.chunks, entities);
  await wait(450, signal);
  yield { kind: "stage", name: "retrieve", status: "end", ms: Math.round(performance.now() - t0) };
  const chunks = corpus.chunks;
  yield { kind: "degraded", mode: "search_only", reason: "models_unavailable" };
  yield {
    kind: "retrieval", corpus_version: corpus.corpus_version,
    hits: hits.map((h) => ({ id: chunks[h.k].id, title: chunks[h.k].title, score: Math.round(h.sc * 1000) / 1000 })),
  };
  yield done;
}
