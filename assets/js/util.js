// Small helpers shared by the scene, the interface and the data modules.

export const $ = (id) => document.getElementById(id);

/** Lowercase without accents, for matching words in Portuguese and English alike. */
export const norm = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Seeded random numbers in [0, 1): the brain looks the same on every load. */
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** The visitor asked the system for less motion: no brain, no typing, no rotating placeholder. */
export const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True when this browser can draw the brain. */
export function webglAvailable() {
  try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

/** GET a JSON file; a non-2xx response is an error that names the file and the status. */
export async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw Object.assign(new Error(`${url}: ${r.status}`), { status: r.status });
  return r.json();
}
