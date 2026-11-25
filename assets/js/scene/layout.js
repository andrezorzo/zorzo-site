// Where each published chunk sits in the brain (zorzo-site LLD, "Brain data"). brain.json holds what comes
// from the mesh; the corpus is placed here, in the browser, so a new corpus version needs no front build.

import { mulberry32 } from "../util.js";

// A chunk's region comes from its document kind (zorzo-api LLD "4. Data", documents.kind).
export const REGION = {
  resume: "frontal", narrative: "frontal", faq: "frontal",
  project_doc: "temporal", repo: "temporal", site_doc: "parietal", post: "occipital",
};
export const SEG = 10; // segments per axon curve
const NEIGHBOURS = 2;  // axons per chunk, to its nearest neighbours in embedding space

/** brain.json keeps its big arrays as flat integers (tools/pack_brain.py) → [x, y, z] points. */
export function unpackBrain(d) {
  const pts = (flat) => Array.from({ length: flat.length / 3 }, (_, i) => [flat[3 * i] / d.q, flat[3 * i + 1] / d.q, flat[3 * i + 2] / d.q]);
  return {
    dust: pts(d.dust), bright: d.bright.map((b) => b / 100), hubs: d.hubs,
    pools: Object.fromEntries(Object.entries(d.pools).map(([r, flat]) => [r, pts(flat)])),
  };
}

const argsort = (values) => values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);

/**
 * One surface point per chunk. A region's k chunks take its first k pool points (evenly spread, since the pool
 * is in farthest-point order); chunks and points are matched in angular order, so chunks that are close in
 * embedding space sit close on the surface.
 */
export function placeChunks(chunks, pools) {
  const anchors = new Array(chunks.length);
  const byRegion = new Map();
  chunks.forEach((c, k) => {
    const r = REGION[c.kind] || "parietal";
    (byRegion.get(r) || byRegion.set(r, []).get(r)).push(k);
  });
  byRegion.forEach((ids, r) => {
    const pool = pools[r];
    if (!pool?.length) throw new Error(`brain.json has no pool for region ${r}`);
    // more chunks than pool points: reuse the pool, nudged outward, rather than drop a chunk
    const slots = ids.map((_, n) => {
      const p = pool[n % pool.length], lap = Math.floor(n / pool.length);
      return lap ? p.map((x) => x * (1 + 0.02 * lap)) : p;
    });
    const mean = [0, 1, 2].map((d) => slots.reduce((a, p) => a + p[d], 0) / slots.length);
    const orderC = argsort(ids.map((k) => Math.atan2(chunks[k].p[1], chunks[k].p[0])));
    const orderS = argsort(slots.map((p) => Math.atan2(p[1] - mean[1], p[0] - mean[0] + p[2] - mean[2])));
    orderC.forEach((a, n) => { anchors[ids[a]] = slots[orderS[n]]; });
  });
  return anchors;
}

/** Each chunk to its nearest neighbours by `p` (the embedding's 3D projection), without duplicates. */
export function nearestEdges(chunks) {
  const seen = new Set(), edges = [];
  chunks.forEach((a, i) => {
    const near = chunks.map((b, j) => [j === i ? Infinity : (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2, j])
      .sort((x, y) => x[0] - y[0]).slice(0, NEIGHBOURS);
    for (const [d, j] of near) {
      if (!Number.isFinite(d)) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    }
  });
  return edges;
}

/** The edges as gentle curves bending toward the centre, SEG segments each. */
export function axonCurves(edges, anchors) {
  const rnd = mulberry32(11);
  return edges.map(([a, b]) => {
    const pa = anchors[a], pb = anchors[b], k = 0.55 + 0.25 * rnd();
    const bend = [0, 1, 2].map((d) => (pa[d] + pb[d]) / 2 * k);
    return Array.from({ length: SEG + 1 }, (_, s) => {
      const t = s / SEG;
      return [0, 1, 2].map((d) => (1 - t) ** 2 * pa[d] + 2 * (1 - t) * t * bend[d] + t ** 2 * pb[d]);
    });
  });
}

/** Entities sit inside the brain, near the chunks that name them; one named nowhere floats near the centre. */
export function placeEntities(entities, anchors) {
  const rnd = mulberry32(13), jitter = (s) => (rnd() - 0.5) * 2 * s;
  return entities.map((e) => {
    if (!e.chunks.length) return [jitter(0.3), jitter(0.3), jitter(0.3)];
    return [0, 1, 2].map((d) => e.chunks.reduce((a, k) => a + anchors[k][d], 0) / e.chunks.length * 0.55 + jitter(0.07));
  });
}

