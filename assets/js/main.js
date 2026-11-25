// Boot (zorzo-site LLD, "Modules"): language and intro first, then the published data, then the brain when
// this browser can draw it and the visitor has not asked for reduced motion. The question box works either way.

import { ask } from "./data/mock.js";
import { loadPublished } from "./data/published.js";
import { unpackBrain } from "./scene/layout.js";
import { createScene, webglAvailable } from "./scene/scene.js";
import { startAsk } from "./ui/ask.js";
import { startHubs } from "./ui/hubs.js";
import { startIntro } from "./ui/intro.js";
import { $ } from "./util.js";

const stage = $("stage");
startIntro();

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const published = await loadPublished();
let scene = null;
if (!REDUCED && webglAvailable()) {
  try {
    const brain = unpackBrain(await (await fetch("assets/data/brain.json")).json());
    scene = createScene({ canvas: $("scene"), stage, brain, chunks: published.corpus.chunks, entities: published.entities });
    startHubs(scene, stage);
  } catch (err) {
    console.error(err);   // the still image stays; asking still works
    scene = null;
  }
}
if (!scene) stage.classList.add("no-gl");
startAsk({ scene, stage, ask, published });
stage.classList.add("ready");
