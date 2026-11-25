// The data the ingest publishes on activation (zorzo-api LLD "Published data"): the manifest names the folder
// of the active corpus version, which holds corpus.json and examples.json. Read once per page load.

import { wholeWord } from "../text.js";
import { fetchJson, norm } from "../util.js";

const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// Production serves data/ from the bucket. Locally, data/ is a copy of the API's DATA_DIR; without it, the demo
// copy of the prototype's corpus keeps the brain as it looks today (zorzo-site LLD, "Development data").
// Only a missing manifest falls back to the demo; any other failure leaves an empty corpus (loadPublished).
async function manifest() {
  try {
    return await fetchJson("data/manifest.json");
  } catch (err) {
    if (!LOCAL || err.status !== 404) throw err;
    return fetchJson("demo-data/manifest.json");
  }
}

/** Links each entity to the chunks that name it: whole words, ignoring case and accents. */
export function linkEntities(entities, chunks) {
  const texts = chunks.map((c) => norm(`${c.heading} ${c.text}`));
  return entities.map((e) => {
    const pattern = wholeWord(e.name);
    return { ...e, pattern, chunks: texts.flatMap((x, k) => (pattern.test(x) ? [k] : [])) };
  });
}

let loading = null;

/**
 * { corpus, examples, entities }: entities come from the site (presentation), linked to this corpus. Without
 * published data (before the first ingest publishes, or a failed request) the corpus is empty: the brain shows
 * no chunk points and every question finds no sources, but the page works.
 */
export function loadPublished() {
  loading ??= (async () => {
    // site data, so no need to wait for the manifest; without it the brain only loses its entity points
    const entitiesP = fetchJson("assets/data/entities.json").catch((err) => { console.error(err); return []; });
    const m = await manifest();
    const [corpus, examples, entities] = await Promise.all([fetchJson(`${m.path}corpus.json`), fetchJson(`${m.path}examples.json`), entitiesP]);
    return { corpus, examples, entities: linkEntities(entities, corpus.chunks) };
  })().catch((err) => {
    console.error(err);
    return { corpus: { corpus_version: 0, chunks: [] }, examples: [], entities: [] };
  });
  return loading;
}
