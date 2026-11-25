// The 3D brain (zorzo-site LLD, "Modules"): a point cloud from a real MRI mesh, corpus chunks as glowing
// points, hubs, entities, axons with travelling impulses. It knows nothing about questions or the interface:
// the interface drives it through the object createScene returns.
// Budget (iPhone-safe): no postprocessing, DPR clamp, 3 draw calls, attributes updated on events only.

import * as THREE from "../../vendor/three/three.module.min.js";
import { mulberry32 } from "../util.js";
import { axonCurves, nearestEdges, placeChunks, placeEntities, SEG } from "./layout.js";
import { AXON_FRAG, AXON_VERT, FRAG, LINE_FRAG, LINE_VERT, VERT } from "./shaders.js";

const params = new URLSearchParams(location.search);
const COARSE = matchMedia("(pointer: coarse)").matches;
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// stage = video frame (1280×716); brain origin and scale measured on the reference frame
const REF_W = 1280, REF_H = 716, ORIGIN = [640, 287], UNIT = 305;
const TIERS = [{ name: "low", pr: 1, keep: 0.4 }, { name: "mid", pr: 1.25, keep: 0.7 }, { name: "high", pr: 1.5, keep: 1 }];
const IDLE_DX = 0.09;
const D = 7;

/**
 * Draws the brain on `canvas`. `chunks` are the published corpus chunks; `entities` carry the indices of the
 * chunks that name them. Returns the controls the interface uses.
 */
export function createScene({ canvas, stage, brain: DATA, chunks, entities }) {
  const DBG = params.has("debug") ? Object.assign(document.createElement("p"), { className: "dbg" }) : null;
  if (DBG) stage.append(DBG);

  const anchors = placeChunks(chunks, DATA.pools);
  const edges = nearestEdges(chunks);
  const curves = axonCurves(edges, anchors);
  const entityPoints = placeEntities(entities, anchors);

  let firstFrame = false;
  // the GPU can drop the context (iOS under memory pressure): the still image comes back
  canvas.addEventListener("webglcontextlost", () => { stage.classList.remove("gl"); stage.classList.add("no-gl"); });
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !COARSE, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  let tier = (IOS || COARSE || (navigator.hardwareConcurrency || 8) <= 4) ? 1 : 2;
  if (params.has("tier")) tier = Math.max(0, Math.min(2, +params.get("tier")));

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 50);
  camera.position.set(0, 0, D);
  const world = new THREE.Scene();
  const pivot = new THREE.Group(), brain = new THREE.Group();
  pivot.add(brain); world.add(pivot);

  // colour: video gradient (cyan front → violet → magenta back), pulled toward the brand mint/lilac
  const cFront = new THREE.Color("#6FE6DC"), cMid = new THREE.Color("#8FA2F2"), cBack = new THREE.Color("#D57FEE");
  const tmpC = new THREE.Color();
  const grad = (x) => { const k = (x + 1) / 2; return k < 0.5 ? tmpC.copy(cFront).lerp(cMid, k * 2) : tmpC.copy(cMid).lerp(cBack, (k - 0.5) * 2); };
  const rnd = mulberry32(5);

  /* ---- biology → circuit: the brain turns into a circuit board from front (-x) to back (+x) */
  const circ = (x) => { const k = Math.min(1, Math.max(0, (x + 0.15) / 0.7)); return k * k * (3 - 2 * k); };
  const GRID = 0.032;
  const snapRnd = mulberry32(9);
  const isCirc = DATA.dust.map((p) => snapRnd() < circ(p[0]) * 1.15 - 0.1);
  const dust = DATA.dust.map((p, k) => isCirc[k] ? [Math.round(p[0] / GRID) * GRID, Math.round(p[1] / GRID) * GRID, p[2]] : p);
  const nDustMax = dust.length;
  const C = anchors.length, HN = DATA.hubs.length, E = entityPoints.length;
  // order: [chunks][hubs][entities][dust] so the dust can be trimmed per tier with drawRange
  const N = C + HN + E + nDustMax;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N),
    glow = new Float32Array(N), fire = new Float32Array(N).fill(-99), seed = new Float32Array(N), shape = new Float32Array(N);
  const iHub = (h) => C + h, iEnt = (e) => C + HN + e, iDust = (k) => C + HN + E + k;
  anchors.forEach((p, i) => { pos.set(p, i * 3); grad(p[0]).toArray(col, i * 3); size[i] = 7.5; glow[i] = 0.55; seed[i] = rnd(); shape[i] = circ(p[0]) > 0.6 ? 1 : 0; });
  DATA.hubs.forEach((h, j) => { const i = iHub(j); pos.set(h.p, i * 3); grad(h.p[0]).lerp(new THREE.Color("#FFFFFF"), 0.35).toArray(col, i * 3); size[i] = 13; glow[i] = 1.0; seed[i] = rnd(); });
  entityPoints.forEach((p, j) => { const i = iEnt(j); pos.set(p, i * 3); new THREE.Color("#E9B86C").toArray(col, i * 3); size[i] = 6.5; glow[i] = 0.5; seed[i] = rnd(); });
  dust.forEach((p, k) => { const i = iDust(k), b = DATA.bright[k]; pos.set(p, i * 3); grad(p[0]).toArray(col, i * 3); size[i] = 1.7 + 1.9 * b; glow[i] = 0.18 + 0.55 * b; seed[i] = rnd(); shape[i] = 0; if (isCirc[k]) { size[i] *= 0.7; glow[i] *= 0.8; } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const glowAttr = new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage);
  const fireAttr = new THREE.BufferAttribute(fire, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aGlow", glowAttr); geo.setAttribute("aFire", fireAttr);
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.setAttribute("aShape", new THREE.BufferAttribute(shape, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
  const uniforms = { uScale: { value: 1 }, uTime: { value: 0 }, uD: { value: D } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.renderOrder = 2; brain.add(points);

  /* ---- mesh: 3 nearest neighbours among the visible dust (rebuilt per tier, uniform grid for speed) */
  const lgeo = new THREE.BufferGeometry(); lgeo.boundingSphere = geo.boundingSphere;
  function buildMesh(nDust) {
    const cell = 0.08, grid = new Map(), key = (x, y, z) => `${x},${y},${z}`;
    for (let k = 0; k < nDust; k++) {
      const p = dust[k], g = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell));
      (grid.get(g) || grid.set(g, []).get(g)).push(k);
    }
    const seen = new Set(), lp = [], lc = [];
    for (let a = 0; a < nDust; a++) {
      const p = dust[a], gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), gz = Math.floor(p[2] / cell);
      const best = [[9, -1], [9, -1], [9, -1]];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(key(gx + dx, gy + dy, gz + dz)); if (!list) continue;
        for (const b of list) {
          if (b === a) continue;
          const q = dust[b], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
          if (d < best[2][0]) { best[2] = [d, b]; best.sort((x, y) => x[0] - y[0]); }
        }
      }
      for (const [d, b] of best) {
        if (b < 0 || d > 0.006) continue;
        const kk = a < b ? a * 10000 + b : b * 10000 + a;
        if (seen.has(kk)) continue; seen.add(kk);
        if (isCirc[a] && isCirc[b]) continue;          // circuit points get traces below instead
        const q = dust[b];
        const ca = grad(p[0]).clone().multiplyScalar(0.45 + 0.75 * DATA.bright[a]);
        const cb = grad(q[0]).clone().multiplyScalar(0.45 + 0.75 * DATA.bright[b]);
        lp.push(...p, ...q);
        lc.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
      }
    }
    // circuit traces: snapped points that share a grid row (or column) are joined in straight runs, like PCB tracks
    const runs = (axis) => {
      const other = 1 - axis, lines = new Map();
      for (let k = 0; k < nDust; k++) {
        if (!isCirc[k]) continue;
        const p = dust[k], key2 = `${Math.round(p[other] / GRID)},${p[2] > 0 ? 1 : 0}`;
        (lines.get(key2) || lines.set(key2, []).get(key2)).push(k);
      }
      lines.forEach((ids) => {
        ids.sort((u, w) => dust[u][axis] - dust[w][axis]);
        for (let n = 1; n < ids.length; n++) {
          const u = dust[ids[n - 1]], w = dust[ids[n]];
          if (w[axis] - u[axis] > GRID * 5.5 || Math.abs(w[2] - u[2]) > 0.09) continue;
          const cu = grad(u[0]).clone().multiplyScalar(1.3 + 0.9 * DATA.bright[ids[n - 1]]);
          const cw = grad(w[0]).clone().multiplyScalar(1.3 + 0.9 * DATA.bright[ids[n]]);
          lp.push(...u, ...w); lc.push(cu.r, cu.g, cu.b, cw.r, cw.g, cw.b);
        }
      });
    };
    runs(0); runs(1);
    // a tier change rebuilds the mesh: free the old buffers on the GPU first
    if (lgeo.getAttribute("position")) lgeo.dispose();
    lgeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    lgeo.setAttribute("aColor", new THREE.Float32BufferAttribute(lc, 3));
  }
  const meshLines = new THREE.LineSegments(lgeo, new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uD: { value: D }, uAlpha: { value: 0.26 } } }));
  meshLines.renderOrder = 1; brain.add(meshLines);

  /* ---- axons: the edges as curves; the impulse runs in the shader */
  const AX = curves.length, SUB = SEG * 2;   // sub-segments per axon
  const apos = new Float32Array(AX * SUB * 6), at = new Float32Array(AX * SUB * 2), acolor = new Float32Array(AX * SUB * 6);
  const astart = new Float32Array(AX * SUB * 2).fill(-99), adir = new Float32Array(AX * SUB * 2).fill(1);
  curves.forEach((curve, e) => {
    for (let s = 0; s < SEG; s++) {
      const p = curve[s], q = curve[s + 1], mx = (p[0] + q[0]) / 2;
      const elbow = circ(mx) > 0.5 ? [q[0], p[1], (p[2] + q[2]) / 2] : [mx, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      [[p, elbow, s / SEG, (s + 0.5) / SEG], [elbow, q, (s + 0.5) / SEG, (s + 1) / SEG]].forEach(([u, w, tu, tw], h) => {
        const v = (e * SUB + s * 2 + h) * 2;
        apos.set(u, v * 3); apos.set(w, v * 3 + 3);
        at[v] = tu; at[v + 1] = tw;
        grad(u[0]).toArray(acolor, v * 3); grad(w[0]).toArray(acolor, v * 3 + 3);
      });
    }
  });
  const axGeo = new THREE.BufferGeometry();
  axGeo.setAttribute("position", new THREE.BufferAttribute(apos, 3));
  axGeo.setAttribute("aT", new THREE.BufferAttribute(at, 1));
  axGeo.setAttribute("aColor", new THREE.BufferAttribute(acolor, 3));
  const aStartAttr = new THREE.BufferAttribute(astart, 1).setUsage(THREE.DynamicDrawUsage);
  const aDirAttr = new THREE.BufferAttribute(adir, 1).setUsage(THREE.DynamicDrawUsage);
  axGeo.setAttribute("aStart", aStartAttr); axGeo.setAttribute("aDir", aDirAttr);
  axGeo.boundingSphere = geo.boundingSphere;
  const axonUniforms = { uD: { value: D }, uTime: uniforms.uTime, uDur: { value: 0.55 }, uBase: { value: 0.03 } };
  const axons = new THREE.LineSegments(axGeo, new THREE.ShaderMaterial({ vertexShader: AXON_VERT, fragmentShader: AXON_FRAG,
    uniforms: axonUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  axons.renderOrder = 1; brain.add(axons);
  const adj = Array.from({ length: C }, () => []);
  edges.forEach(([a, b], e) => { adj[a].push([b, e, 1]); adj[b].push([a, e, -1]); });

  /* ---- sizing: stage = the video frame, fitted to the window; the brain moves aside for the answer panel */
  let W = 1, H = 1, s = 1, pr = 1, sFit = 1, answering = false;
  const view = { tdx: IDLE_DX, tk: 1 };
  const g = { cx: 0, cy: 0, u: 1 };
  const portrait = () => W / H < 0.85;
  function targetGeo() {
    if (portrait()) return answering
      ? { cx: W / 2, cy: H * 0.13, u: Math.min(W * 0.21, H * 0.09) }       // answer: brain as a badge on top
      : { cx: W / 2, cy: H * 0.31, u: Math.min(W * 0.46, H * 0.27) };     // phone: brain fills the width, intro below
    return { cx: W / 2 + (ORIGIN[0] - REF_W / 2) * sFit + view.tdx * W, cy: H / 2 + (ORIGIN[1] - REF_H / 2) * sFit, u: UNIT * sFit * view.tk };
  }
  function applyView() {
    camera.fov = 2 * Math.atan(H / (2 * D * g.u)) * 180 / Math.PI;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, -(g.cx - W / 2), H / 2 - g.cy, W, H);
    camera.updateProjectionMatrix();
    s = g.u / UNIT;                       // overlay offsets and pick radii follow the brain's size
    uniforms.uScale.value = s * pr;
  }
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    sFit = Math.min(W / REF_W, H / REF_H);
    pr = Math.min(devicePixelRatio || 1, TIERS[tier].pr);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    Object.assign(g, targetGeo());
    applyView();
  }
  function applyTier() {
    const n = Math.round(nDustMax * TIERS[tier].keep);
    geo.setDrawRange(0, C + HN + E + n);
    buildMesh(n);
    resize();
  }
  applyTier();
  new ResizeObserver(resize).observe(canvas);

  const v = new THREE.Vector3();
  function screenOf(i) {
    v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(brain.matrixWorld);
    const z = v.z; v.project(camera);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, z];
  }

  /* ---- picking: hubs first, then chunks (front side only) */
  function pick(px, py) {
    brain.updateMatrixWorld();
    let best = -1, bd = COARSE ? Math.max(26 * s, 20) : 16 * s;
    for (let j = 0; j < HN; j++) { const [x, y] = screenOf(iHub(j)); const d = Math.hypot(x - px, y - py) - 6 * s; if (d < bd) { bd = d; best = iHub(j); } }
    if (best >= 0) return best;
    bd = COARSE ? 18 * s : 9 * s;
    for (let i = 0; i < C; i++) { const [x, y, z] = screenOf(i); if (z < -0.1) continue; const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  const target = (i) => (i < 0 ? null : i < C ? { kind: "chunk", index: i } : i < C + HN ? { kind: "hub", index: i - C } : null);

  /* ---- impulses: breadth-first along the edges from a start chunk */
  const held = new Set();
  function clearHeld() { held.forEach((i) => { glow[i] = i < C ? 0.55 : glow[i]; }); held.clear(); glowAttr.needsUpdate = true; }
  function fireAt(i) { fire[i] = uniforms.uTime.value; fireAttr.needsUpdate = true; }
  function impulse(start, depth = 3, keep = false) {
    const t0 = uniforms.uTime.value, dur = axonUniforms.uDur.value;
    if (!keep) clearHeld();
    const when = new Map([[start, t0]]);
    let frontier = [start];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const a of frontier) {
        for (const [b, e, dir] of adj[a].slice(0, 3)) {
          if (when.has(b)) continue;
          const tb = when.get(a) + dur * 0.95;
          when.set(b, tb); next.push(b);
          for (let sgm = 0; sgm < SUB; sgm++) { const vv = (e * SUB + sgm) * 2; astart[vv] = astart[vv + 1] = when.get(a); adir[vv] = adir[vv + 1] = dir; }
        }
      }
      frontier = next;
    }
    when.forEach((tb, i) => { fire[i] = tb; held.add(i); });
    aStartAttr.needsUpdate = aDirAttr.needsUpdate = fireAttr.needsUpdate = true;
    // the hits stay lit after the wave passes
    setTimeout(() => { held.forEach((i) => { glow[i] = 2; }); glowAttr.needsUpdate = true; }, (depth * dur + 0.3) * 1000);
  }
  function hold(ks) { ks.forEach((k) => { held.add(k); glow[k] = 2; }); glowAttr.needsUpdate = true; }
  function simulate() {
    if (!E) { impulse(Math.floor(Math.random() * C)); return; }
    const j = Math.floor(Math.random() * E);
    fireAt(iEnt(j));
    impulse(entities[j].chunks[0] ?? 0);
  }

  /* ---- rotation: tilt follows the pointer, drag rotates, slow sway when idle */
  const hoverFns = [], tapFns = [], frameFns = [];
  let drag = null, lastInput = performance.now(), hoverI = -1;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const bg = { x: 0, y: 0, r: 0 };
  const dragQ = new THREE.Quaternion(), restQ = new THREE.Quaternion();
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  canvas.addEventListener("pointercancel", () => { drag = null; });   // touch: a vertical swipe scrolls the page (touch-action: pan-y)
  addEventListener("pointerup", (e) => {
    if (drag && drag.moved < 5 && e.target === canvas) {
      const r = canvas.getBoundingClientRect(), i = pick(e.clientX - r.left, e.clientY - r.top);
      if (i >= 0 && i < C) impulse(i);
      tapFns.forEach((fn) => fn(target(i)));
    }
    drag = null;
  });
  canvas.addEventListener("pointermove", (e) => {
    lastInput = performance.now();
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved >= 5) { dragQ.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * 0.006, dx * 0.006, 0))); return; }
    }
    tilt.tx = (px / W - 0.5); tilt.ty = (py / H - 0.5);
    const i = pick(px, py);
    if (i !== hoverI) {
      if (hoverI >= 0 && hoverI < C) { glow[hoverI] = held.has(hoverI) ? 2 : 0.55; glowAttr.needsUpdate = true; }
      hoverI = i;
      if (i >= 0 && i < C) { glow[i] = 2; glowAttr.needsUpdate = true; }
      canvas.style.cursor = i >= 0 ? "pointer" : "grab";
    }
    hoverFns.forEach((fn) => fn(target(i), px, py));
  });
  // back to rest only when the pointer leaves the page: moving onto the card (or any overlay) keeps the tilt,
  // otherwise the brain swings back and the card slides away from under the pointer
  canvas.addEventListener("pointerleave", (e) => { if (!e.relatedTarget || !stage.contains(e.relatedTarget)) tilt.tx = tilt.ty = 0; });

  /* ---- idle sparks, like the video: a few chunks flare every ~2.5 s */
  let nextSpark = 0;
  function sparks(t) {
    if (t < nextSpark || held.size) return;
    nextSpark = t + 2.5;
    for (let k = 0; k < 5; k++) fire[Math.floor(Math.random() * C)] = t + Math.random() * 1.2;
    fire[iHub(Math.floor(Math.random() * HN))] = t + Math.random();
    fireAttr.needsUpdate = true;
  }

  /* ---- loop */
  const fps = { n: 0, since: performance.now(), v: 60, warm: performance.now() + 2500 };
  let last = performance.now();
  const swayQ = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  // the page scrolls: when the hero is out of view, the scene stops drawing
  let onScreen = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(stage);
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || !onScreen) { last = now; return; }
    fps.n++;
    if (now - fps.since > 2000) {
      fps.v = fps.n * 1000 / (now - fps.since); fps.n = 0; fps.since = now;
      if (now > fps.warm && fps.v < 45 && tier > 0) { tier--; applyTier(); fps.warm = now + 3000; }
    }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000; uniforms.uTime.value = t;
    // idle: sway ±22° around the profile view; returns to the profile when the visitor is active
    const idle = Math.min(1, Math.max(0, (now - lastInput - 2500) / 3000));
    swayQ.setFromAxisAngle(Y, Math.sin(t * 0.21) * 0.38 * idle);
    if (!drag) dragQ.slerp(restQ, 1 - Math.pow(0.35, dt * (idle > 0 ? 1 : 0.15)));   // drag springs back slowly
    tilt.x += (tilt.tx - tilt.x) * 0.06; tilt.y += (tilt.ty - tilt.y) * 0.06;
    pivot.rotation.set(tilt.y * 0.35, tilt.x * 0.6, 0);
    brain.quaternion.copy(dragQ).multiply(swayQ);
    sparks(t);
    renderer.render(world, camera);
    if (!firstFrame) { firstFrame = true; stage.classList.add("gl"); stage.classList.remove("no-gl"); }   // still image fades out
    {
      const tg = targetGeo(), e = 1 - Math.pow(0.02, dt);
      if (Math.abs(tg.cx - g.cx) + Math.abs(tg.cy - g.cy) + Math.abs(tg.u - g.u) > 0.3) {
        g.cx += (tg.cx - g.cx) * e; g.cy += (tg.cy - g.cy) * e; g.u += (tg.u - g.u) * e; applyView();
      }
    }
    frameFns.forEach((fn) => fn(now));
    // background glow sits behind the brain and drifts against the tilt (parallax), so it moves with the scene
    {
      const bx = g.cx - tilt.x * g.u * 0.35, by = g.cy - tilt.y * g.u * 0.25, br = g.u * 2.1;
      if (Math.abs(bx - bg.x) + Math.abs(by - bg.y) + Math.abs(br - bg.r) > 0.5) {
        bg.x = bx; bg.y = by; bg.r = br;
        stage.style.setProperty("--bgx", bx.toFixed(1) + "px"); stage.style.setProperty("--bgy", by.toFixed(1) + "px"); stage.style.setProperty("--bgr", br.toFixed(1) + "px");
      }
    }
    if (DBG) DBG.textContent = `fps ${fps.v.toFixed(0)} · tier ${TIERS[tier].name} · calls ${renderer.info.render.calls} · pts ${geo.drawRange.count}`;
  }
  requestAnimationFrame(loop);

  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "s" || e.key === "S") simulate();
  });
  if (params.has("sim")) setTimeout(simulate, 600);

  return {
    chunkCount: C,
    hubIds: DATA.hubs.map((h) => h.id),
    hubPoint: iHub,
    entityPoint: iEnt,
    screenOf,
    size: () => ({ W, H, s, portrait: portrait() }),
    onHover: (fn) => hoverFns.push(fn),
    onTap: (fn) => tapFns.push(fn),
    onFrame: (fn) => frameFns.push(fn),
    poke: () => { lastInput = performance.now(); },
    fire: fireAt,
    impulse,
    hold,
    clearHeld,
    simulate,
    /** The answer panel opened or closed; `panelRight` is its right edge in stage pixels. */
    setAnswering(on, panelRight = null) {
      answering = on;
      view.tk = on ? 0.9 : 1;
      view.tdx = on ? 0 : IDLE_DX;
      if (on && panelRight !== null && W > 900 && !portrait()) {
        // the frontal pole (x ≈ -1) lands ~28 px right of the panel, whatever the window size
        const baseCx = W / 2 + (ORIGIN[0] - REF_W / 2) * sFit;
        view.tdx = Math.max(0, (panelRight + 28 + 1.02 * UNIT * sFit * view.tk - baseCx) / W);
      }
    },
  };
}
