// Boot (zorzo-site LLD, "Modules"): language and intro first, then the published data, then the brain when
// this browser can draw it and the visitor has not asked for reduced motion. The question box works either way.
// Three.js is imported only on that path, so a visitor without 3D never downloads it.

import { ask } from "./data/api.js";
import { loadPublished } from "./data/published.js";
import { startAsk } from "./ui/ask.js";
import { startHealth } from "./ui/health.js";
import { startHubs } from "./ui/hubs.js";
import { startIntro } from "./ui/intro.js";
import { $, fetchJson, REDUCED, webglAvailable } from "./util.js";

const stage = $("stage");
startIntro();

// the brain's files load while the published data does
const brainFiles = !REDUCED && webglAvailable()
  ? Promise.all([import("./scene/scene.js"), import("./scene/layout.js"), fetchJson("assets/data/brain.json")])
  : null;
brainFiles?.catch(() => {});   // a failure here only means no brain; it is handled below

const published = await loadPublished();   // never fails: without data, an empty corpus

let scene = null;
if (brainFiles) {
  try {
    const [{ createScene }, { unpackBrain }, brain] = await brainFiles;
    scene = createScene({ canvas: $("scene"), stage, brain: unpackBrain(brain), chunks: published.corpus.chunks, entities: published.entities });
    startHubs(scene, stage);
  } catch (err) {
    console.error(err);   // the still image stays; asking still works
    scene?.fail();        // a scene already running stops through its own failure path
    scene = null;
  }
}
stage.classList.toggle("no-gl", !scene);
stage.classList.remove("no-js");   // in case the fallback timer in index.html fired on a slow load
const box = startAsk({ scene, stage, ask, published, onOffline: () => apiHealth.offline() });
const apiHealth = startHealth(box.setHealth);
stage.classList.add("ready");
