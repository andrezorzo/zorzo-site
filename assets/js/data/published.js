// The data the ingest publishes on activation (zorzo-api LLD "Published data"): the manifest names the folder
// of the active corpus version, which holds corpus.json and examples.json. Read once per page load.

import { fetchJson, norm } from "../util.js";

const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// Production serves data/ from the bucket. Locally, data/ is a copy of the API's DATA_DIR; without it, the demo
// copy of the prototype's corpus keeps the brain as it looks today (zorzo-site LLD, "Development data").
// Only a missing manifest falls back, so a broken one still shows as an error.
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
    const name = norm(e.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${name}($|[^a-z0-9])`);
    return { ...e, chunks: texts.flatMap((x, k) => (re.test(x) ? [k] : [])) };
  });
}

let loading = null;

/** { corpus, examples, entities }: entities come from the site (presentation), linked to this corpus. */
export function loadPublished() {
  loading ??= (async () => {
    const entitiesP = fetchJson("assets/data/entities.json");   // site data: no need to wait for the manifest
    entitiesP.catch(() => {});   // if the manifest fails first, that is the error reported
    const m = await manifest();
    const [corpus, examples, entities] = await Promise.all([fetchJson(`${m.path}corpus.json`), fetchJson(`${m.path}examples.json`), entitiesP]);
    return { corpus, examples, entities: linkEntities(entities, corpus.chunks) };
  })();
  return loading;
}
