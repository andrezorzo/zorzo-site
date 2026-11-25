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
