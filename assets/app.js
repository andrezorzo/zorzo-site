// Brain experiment — phase 1: brain point cloud from a real MRI mesh, corpus chunks as glowing points,
// hub points with static cards, neural-impulse preview along the semantic edges.
// Budget (iPhone-safe): no postprocessing, DPR clamp, 5 draw calls, attributes updated on events only.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const params = new URLSearchParams(location.search);
// fps line only exists with ?debug in the URL
const DBG = params.has("debug") ? Object.assign(document.createElement("p"), { className: "dbg" }) : null;
if (DBG) document.getElementById("stage").append(DBG);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COARSE = matchMedia("(pointer: coarse)").matches;
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// stage = video frame (1280×716); brain origin and scale measured on the reference frame
const REF_W = 1280, REF_H = 716, ORIGIN = [640, 287], UNIT = 305;

const T = {
  pt: {
    typed: "construindo sistemas inteligentes", role: "Senior backend engineer · IA aplicada",
    examples: ["Quantos anos de AWS ele tem?", "O que é o Prosa?", "Como este site funciona?", "O que ele fez na Alert Logic?", "Ele já usou MCP em produção?"],
    send: "Perguntar", close: "Fechar", tele: "telemetria", askLabel: "Pergunte sobre o trabalho do André",
    hubs: {
      resume:   { title: "Currículo", body: "20+ anos de backend, remoto para os EUA desde 2006. Python, AWS, IA aplicada.", link: ["Baixar PDF", "andre-zorzo-resume.pdf"] },
      projects: { title: "Projetos", body: "Prosa (busca semântica em PDFs técnicos) · Battle of the Bits (jogo de robôs no navegador).", link: ["Ver projetos", "#projects"] },
      how:      { title: "Como este site funciona", body: "RAG + agente com limites de passo e custo. Spec e traces públicos quando o backend entrar no ar.", soon: "em breve" },
      blog:     { title: "Blog", body: "Notas de construção: o que eu medi, o que errei, o que mudou.", soon: "em breve" },
      contact:  { title: "Contato", body: "Vagas remotas e contratos.", link: ["Falar comigo", "#contact"] },
    },
    query: (n, c) => `query · ${n} termos · ${c} chars`, guardOk: "guard · ok", guardBlocked: "guard · bloqueado (L2)",
    retrieve: (h, c) => `retrieve · bm25 · ${h} de ${c} trechos`,
    relevance: (top, cut) => `relevância · bm25 ${top} no topo · corte em ${cut}`,
    coverage: (c, n) => `cobertura · ${c}/${n} termos`, noHits: "nenhum trecho → abster",
    latency: (ms) => `latência · ${ms} ms (navegador)`, cost: "custo · US$0 · busca local, sem modelo",
    answerLine: (n) => `answer · ${n} ${n === 1 ? "afirmação" : "afirmações"} · extrativa (mock)`, verifyLine: () => `verify · não se aplica no mock (cada afirmação é o próprio trecho)`,
    blocked: "Bloqueado na camada L2: parece uma tentativa de mudar as regras do agente. Essa camada existe de propósito, e o painel de defesas mostra quantas tentativas foram barradas.",
    abstain: "Não encontrei isso nas fontes. Sem fonte, sem resposta: o agente responde assim também.",
    abstainHint: "Tente o currículo, os projetos ou como este site funciona.",
    note: "mock · resposta extrativa: frases dos próprios trechos, sem modelo. O backend real gera o texto e verifica cada afirmação contra a fonte.",
    sources: (n) => `Fontes · ${n}`, verified: () => `verify · não se aplica: resposta extrativa`, trace: "ver rastreio completo",
  },
  en: {
    typed: "building intelligent systems", role: "Senior backend engineer · Applied AI",
    examples: ["How many years of AWS does he have?", "What is Prosa?", "How does this site work?", "What did he do at Alert Logic?", "Has he used MCP in production?"],
    send: "Ask", close: "Close", tele: "telemetry", askLabel: "Ask about André's work",
    hubs: {
      resume:   { title: "Résumé", body: "20+ years of backend, remote for US companies since 2006. Python, AWS, applied AI.", link: ["Download PDF", "andre-zorzo-resume.pdf"] },
      projects: { title: "Projects", body: "Prosa (semantic search over technical PDFs) · Battle of the Bits (robot combat in the browser).", link: ["See projects", "#projects"] },
      how:      { title: "How this site works", body: "RAG + an agent with step and cost limits. Spec and traces go public with the backend.", soon: "coming soon" },
      blog:     { title: "Blog", body: "Build notes: what I measured, what I got wrong, what changed.", soon: "coming soon" },
      contact:  { title: "Contact", body: "Remote roles and contracts.", link: ["Get in touch", "#contact"] },
    },
    query: (n, c) => `query · ${n} terms · ${c} chars`, guardOk: "guard · ok", guardBlocked: "guard · blocked (L2)",
    retrieve: (h, c) => `retrieve · bm25 · ${h} of ${c} chunks`,
    relevance: (top, cut) => `relevance · bm25 ${top} at top · cut at ${cut}`,
    coverage: (c, n) => `coverage · ${c}/${n} terms`, noHits: "no chunks → abstain",
    latency: (ms) => `latency · ${ms} ms (browser)`, cost: "cost · US$0 · local search, no model",
    answerLine: (n) => `answer · ${n} ${n === 1 ? "claim" : "claims"} · extractive (mock)`, verifyLine: () => `verify · n/a in the mock (each claim is its own chunk)`,
    blocked: "Blocked at layer L2: this looks like an attempt to change the agent's rules. That layer is there on purpose, and the defenses page shows how many attempts were stopped.",
    abstain: "Nothing about that in my sources. No source, no answer: the agent answers the same way.",
    abstainHint: "Try the résumé, the projects, or how this site works.",
    note: "mock · extractive answer: sentences taken from the chunks, no model. The real backend writes the text and checks every claim against its source.",
    sources: (n) => `Sources · ${n}`, verified: () => `verify · n/a: extractive answer`, trace: "see the full trace",
  },
};
let lang = "pt";
lang = document.documentElement.dataset.lang || "pt";   // set in <head> before first paint (storage, ?lang=, browser)
const t = () => T[lang];

const VERT = /* glsl */`
uniform float uScale; uniform float uTime; uniform float uD;
attribute vec3 aColor; attribute float aSize; attribute float aGlow; attribute float aFire; attribute float aSeed; attribute float aShape;
varying vec3 vColor; varying float vAlpha; varying float vHot; varying float vShape;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float front = 0.5 + 0.5 * clamp((mv.z + uD) * 1.4, -1.0, 1.0);
  // fire: a flash that decays over ~1.2 s (aFire = time it fired); aGlow = base glow 0..1, >1 held lit
  float since = uTime - aFire;
  float flash = since >= 0.0 ? exp(-since * 1.6) : 0.0;
  float hot = clamp(max(flash, aGlow - 1.0), 0.0, 1.0);
  float twinkle = 0.82 + 0.18 * sin(uTime * 1.1 + aSeed * 40.0);
  gl_PointSize = aSize * (1.0 + hot * 1.3) * uScale * (uD / -mv.z) * 2.6;
  vColor = mix(aColor, vec3(1.0), hot * 0.55);
  vAlpha = mix(0.18, 1.0, front) * twinkle * (min(aGlow, 1.0) + hot * 1.4);
  vHot = hot; vShape = aShape;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha; varying float vHot; varying float vShape;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.4, 0.15, d);
  if (vShape > 0.5) {                       // solder pad: a small square ring
    float sq = max(q.x, q.y);
    core = smoothstep(0.42, 0.34, sq) * (0.55 + 0.45 * smoothstep(0.12, 0.2, sq));
  }
  float halo = pow(1.0 - d, 2.6) * (0.5 + 0.7 * vHot) * (vShape > 0.5 ? 0.6 : 1.0);
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.5), (core + halo) * vAlpha);
}`;
// mesh lines: colour per vertex, fade at the back
const LINE_VERT = /* glsl */`
uniform float uD; attribute vec3 aColor; varying vec3 vColor; varying float vFront;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vFront = 0.5 + 0.5 * clamp((mv.z + uD) * 1.4, -1.0, 1.0); vColor = aColor; gl_Position = projectionMatrix * mv; }`;
const LINE_FRAG = /* glsl */`
uniform float uAlpha; varying vec3 vColor; varying float vFront;
void main() { gl_FragColor = vec4(vColor, uAlpha * mix(0.1, 1.0, vFront * vFront)); }`;
// axons: a light pulse travels along each curve (aT = 0..1 along it); aStart = when it fired, aDir = direction
const AXON_VERT = /* glsl */`
uniform float uD; attribute float aT; attribute float aStart; attribute float aDir; attribute vec3 aColor;
varying float vT; varying float vStart; varying float vFront; varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFront = 0.5 + 0.5 * clamp((mv.z + uD) * 1.4, -1.0, 1.0);
  vT = aDir > 0.0 ? aT : 1.0 - aT; vStart = aStart; vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;
const AXON_FRAG = /* glsl */`
uniform float uTime; uniform float uDur; uniform float uBase;
varying float vT; varying float vStart; varying float vFront; varying vec3 vColor;
void main() {
  float head = (uTime - vStart) / uDur;                     // 0 → 1 while the pulse travels
  float pulse = (head > -0.05 && head < 1.15) ? exp(-pow((vT - head) * 4.5, 2.0)) : 0.0;
  float trail = (head > vT) ? exp(-(uTime - vStart - vT * uDur) * 0.7) * 0.35 : 0.0;   // the path stays lit, then fades
  float a = uBase + pulse * 2.4 + trail * 1.4;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), pulse * 0.6), a * mix(0.15, 1.0, vFront));
}`;

const TIERS = [{ name: "low", pr: 1, keep: 0.4 }, { name: "mid", pr: 1.25, keep: 0.7 }, { name: "high", pr: 1.5, keep: 1 }];

const [DATA, CORPUS] = await Promise.all([
  fetch("assets/data/brain.json").then((r) => r.json()).then(unpackBrain),
  fetch("assets/data/corpus.json").then((r) => r.json()),
]);

/* brain.json keeps dust/axons/bright as flat integers (see tools/pack_brain.py) → back to [x, y, z] points */
function unpackBrain(d) {
  if (d.axons.length !== d.edges.length * (d.seg + 1) * 3) throw new Error("brain.json: axons do not match edges");
  const pts = (flat) => Array.from({ length: flat.length / 3 }, (_, i) => [flat[3 * i] / d.q, flat[3 * i + 1] / d.q, flat[3 * i + 2] / d.q]);
  const ax = pts(d.axons), n = d.seg + 1;
  return { ...d, dust: pts(d.dust), axons: d.edges.map((_, e) => ax.slice(e * n, e * n + n)), bright: d.bright.map((b) => b / 100) };
}

const canvas = $("scene");
let firstFrame = false;
// the GPU can drop the context (iOS under memory pressure): show the static poster and links again
canvas.addEventListener("webglcontextlost", () => { stage.classList.remove("gl"); stage.classList.add("no-gl"); });
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !COARSE, powerPreference: "high-performance" });
renderer.setClearColor(0x000000, 0);
let tier = (IOS || COARSE || (navigator.hardwareConcurrency || 8) <= 4) ? 1 : 2;
if (params.has("tier")) tier = Math.max(0, Math.min(2, +params.get("tier")));

const D = 7;
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 50);
camera.position.set(0, 0, D);
const world = new THREE.Scene();
const pivot = new THREE.Group(), brain = new THREE.Group();
pivot.add(brain); world.add(pivot);

// colour: video gradient (cyan front → violet → magenta back), pulled toward the brand mint/lilac
const cFront = new THREE.Color("#6FE6DC"), cMid = new THREE.Color("#8FA2F2"), cBack = new THREE.Color("#D57FEE");
const tmpC = new THREE.Color();
function grad(x) {        // x in -1..1
  const k = (x + 1) / 2;
  return k < 0.5 ? tmpC.copy(cFront).lerp(cMid, k * 2) : tmpC.copy(cMid).lerp(cBack, (k - 0.5) * 2);
}
const rnd = mulberry32(5);

/* ---- biology → circuit: the brain turns into a circuit board from front (-x) to back (+x) */
const circ = (x) => { const k = Math.min(1, Math.max(0, (x + 0.15) / 0.7)); return k * k * (3 - 2 * k); };
const GRID = 0.032;
const snapRnd = mulberry32(9);
const isCirc = DATA.dust.map((p) => snapRnd() < circ(p[0]) * 1.15 - 0.1);
const dust = DATA.dust.map((p, k) => isCirc[k] ? [Math.round(p[0] / GRID) * GRID, Math.round(p[1] / GRID) * GRID, p[2]] : p);
const nDustMax = dust.length;
const C = DATA.anchors.length, HN = DATA.hubs.length, E = DATA.entities.length;
// order: [chunks][hubs][entities][dust] so the dust can be trimmed per tier with drawRange
const N = C + HN + E + nDustMax;
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N),
  glow = new Float32Array(N), fire = new Float32Array(N).fill(-99), seed = new Float32Array(N), shape = new Float32Array(N);
const iHub = (h) => C + h, iEnt = (e) => C + HN + e, iDust = (k) => C + HN + E + k;
DATA.anchors.forEach((p, i) => { pos.set(p, i * 3); grad(p[0]).toArray(col, i * 3); size[i] = 7.5; glow[i] = 0.55; seed[i] = rnd(); shape[i] = circ(p[0]) > 0.6 ? 1 : 0; });
DATA.hubs.forEach((h, j) => { const i = iHub(j); pos.set(h.p, i * 3); grad(h.p[0]).lerp(new THREE.Color("#FFFFFF"), 0.35).toArray(col, i * 3); size[i] = 13; glow[i] = 1.0; seed[i] = rnd(); });
DATA.entities.forEach((p, j) => { const i = iEnt(j); pos.set(p, i * 3); new THREE.Color("#E9B86C").toArray(col, i * 3); size[i] = 6.5; glow[i] = 0.5; seed[i] = rnd(); });
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
      const q = dust[b];
      const ca = grad(p[0]).clone(), cb = grad(q[0]).clone();
      const ba = DATA.bright[a], bb = DATA.bright[b];
      ca.multiplyScalar(0.45 + 0.75 * ba); cb.multiplyScalar(0.45 + 0.75 * bb);
      if (isCirc[a] && isCirc[b]) continue;          // circuit points get traces below instead
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
  lgeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  lgeo.setAttribute("aColor", new THREE.Float32BufferAttribute(lc, 3));
}
const meshLines = new THREE.LineSegments(lgeo, new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uD: { value: D }, uAlpha: { value: 0.26 } } }));
meshLines.renderOrder = 1; brain.add(meshLines);

/* ---- axons: semantic edges as curves; the impulse runs in the shader */
const SEG = DATA.seg, AX = DATA.axons.length;
const SUB = SEG * 2;   // sub-segments per axon
const apos = new Float32Array(AX * SUB * 6), at = new Float32Array(AX * SUB * 2), acolor = new Float32Array(AX * SUB * 6);
const astart = new Float32Array(AX * SUB * 2).fill(-99), adir = new Float32Array(AX * SUB * 2).fill(1);
DATA.axons.forEach((curve, e) => {
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
DATA.edges.forEach(([a, b], e) => { adj[a].push([b, e, 1]); adj[b].push([a, e, -1]); });

/* ---- sizing: stage = the video frame, fitted to the window */
let W = 1, H = 1, s = 1, pr = 1;
function resize() {
  W = canvas.clientWidth; H = canvas.clientHeight;
  sFit = Math.min(W / REF_W, H / REF_H);
  pr = Math.min(devicePixelRatio || 1, TIERS[tier].pr);
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
  const t = targetGeo();
  if (!gInit) { Object.assign(g, t); gInit = true; } else Object.assign(g, t);
  applyView();
}
// brain geometry on screen: centre (cx, cy) and px per unit (u); eased between layout states
let sFit = 1, gInit = false;
const IDLE_DX = 0.09;
const view = { tdx: IDLE_DX, tk: 1 };
const g = { cx: 0, cy: 0, u: 1 };
const portrait = () => W / H < 0.85;
function targetGeo() {
  const answering = !document.getElementById("answer").hidden;
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
function applyTier() {
  const n = Math.round(nDustMax * TIERS[tier].keep);
  geo.setDrawRange(0, C + HN + E + n);
  buildMesh(n);
  resize();
}
applyTier();
new ResizeObserver(resize).observe(canvas);

/* ---- hub labels + card */
const labels = DATA.hubs.map((h) => {
  const el = document.createElement("div"); el.className = "label"; el.textContent = t().hubs[h.id].title;
  $("labels").append(el); return el;
});
const card = $("card"), leader = $("leader"), leaderLine = $("leaderLine"), leaderDot = $("leaderDot");
let cardHub = -1;
function fillCard(j) {
  const h = t().hubs[DATA.hubs[j].id];
  card.replaceChildren();
  const ttl = document.createElement("h3"); ttl.textContent = h.title;
  const p = document.createElement("p"); p.textContent = h.body;
  card.append(ttl, p);
  if (h.link) { const a = document.createElement("a"); a.textContent = h.link[0]; a.href = h.link[1]; if (h.link[1].endsWith(".pdf")) a.download = ""; card.append(a); }
  if (h.soon) { const s2 = document.createElement("p"); s2.className = "soon"; s2.textContent = h.soon; card.append(s2); }
}
const v = new THREE.Vector3();
function screenOf(i) {
  v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(brain.matrixWorld);
  const z = v.z; v.project(camera);
  return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, z];
}
function placeOverlay() {
  DATA.hubs.forEach((h, j) => {
    const [x, y, z] = screenOf(iHub(j));
    const lw = labels[j].offsetWidth, flip = x + 10 + lw > W - 6;   // near the right edge: label goes to the left of its point
    labels[j].classList.toggle("flip", flip);
    labels[j].style.transform = `translate(${flip ? x - 10 - lw : x + 10 * Math.max(s, 0.6)}px, ${y - 8}px)`;
    labels[j].classList.toggle("back", z < -0.2);
    labels[j].classList.toggle("on", j === cardHub);
  });
  if (cardHub < 0) return;
  const [x, y] = screenOf(iHub(cardHub)), w = card.offsetWidth, hh = card.offsetHeight;
  // which side (left/right, above/below) is chosen once, when the card opens: recomputing it every frame made
  // the card jump while the brain tilted under the moving pointer, so its link could not be reached
  if (!cardSide) cardSide = { h: x + 90 * s + w > W - 8 ? -1 : 1, v: y - 70 * s - hh < 8 ? 1 : -1 };
  const side = cardSide.h;
  let left = side > 0 ? x + 90 * s : x - 90 * s - w, top = cardSide.v < 0 ? y - 70 * s - hh : y + 60 * s;
  left = Math.max(8, Math.min(W - w - 8, left)); top = Math.max(8, Math.min(H - hh - 8, top));
  card.style.transform = `translate(${left}px, ${top}px)`;
  const cx = side > 0 ? left : left + w, cy = top + (top > y ? 0 : hh);
  leaderLine.setAttribute("points", `${x},${y} ${x + (cx - x) * 0.45},${cy} ${cx},${cy}`);
  leaderDot.setAttribute("cx", x); leaderDot.setAttribute("cy", y);
}
let hideTimer = 0, cardSide = null;
function showCard(j) {
  clearTimeout(hideTimer); hideTimer = 0;
  if (j === cardHub) return;
  if (j < 0) { hideTimer = setTimeout(() => { hideTimer = 0; cardHub = -1; card.classList.remove("is-on"); leader.classList.remove("is-on"); setTimeout(() => { if (cardHub < 0) card.hidden = true; }, 160); }, 450); return; }
  cardHub = j; cardSide = null; fillCard(j); card.hidden = false;
  requestAnimationFrame(() => { card.classList.add("is-on"); leader.classList.add("is-on"); });
}
card.addEventListener("pointerenter", () => { clearTimeout(hideTimer); hideTimer = 0; });   // the card stays open while the pointer is on it (to click the link)
card.addEventListener("pointermove", () => { lastInput = performance.now(); });   // and the idle sway does not start under it
card.addEventListener("pointerleave", () => showCard(-1));

function inCorridor(px, py) {
  const [x, y] = screenOf(iHub(cardHub)), c = card.getBoundingClientRect(), o = stage.getBoundingClientRect(), pad = 24;
  const l = Math.min(x, c.left - o.left) - pad, r = Math.max(x, c.right - o.left) + pad;
  const t = Math.min(y, c.top - o.top) - pad, b = Math.max(y, c.bottom - o.top) + pad;
  return px >= l && px <= r && py >= t && py <= b;
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

/* ---- rotation: tilt follows the pointer, drag rotates, slow sway when idle */
let drag = null, lastInput = performance.now(), hoverI = -1;
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
const bg = { x: 0, y: 0, r: 0 };
const dragQ = new THREE.Quaternion(), restQ = new THREE.Quaternion();
canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
canvas.addEventListener("pointercancel", () => { drag = null; });   // touch: a vertical swipe scrolls the page (touch-action: pan-y)
addEventListener("pointerup", (e) => {
  if (drag && drag.moved < 5 && e.target === canvas) {
    const r = canvas.getBoundingClientRect(), i = pick(e.clientX - r.left, e.clientY - r.top);
    if (i >= C && i < C + HN) showCard(i - C);
    else if (i >= 0) impulse(i);
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
    if (i >= C && i < C + HN) showCard(i - C);
    canvas.style.cursor = i >= 0 ? "pointer" : "grab";
  }
  // an open card stays open while the pointer travels from its point to it (the box spanning both);
  // elsewhere it closes after a short grace
  if (cardHub >= 0 && !(i >= C && i < C + HN)) {
    if (inCorridor(px, py)) { clearTimeout(hideTimer); hideTimer = 0; }
    else if (!hideTimer) showCard(-1);
  }
});
// back to rest only when the pointer leaves the page: moving onto the card (or any overlay) keeps the tilt,
// otherwise the brain swings back and the card slides away from under the pointer
canvas.addEventListener("pointerleave", (e) => { if (!e.relatedTarget || !stage.contains(e.relatedTarget)) tilt.tx = tilt.ty = 0; });

/* ---- impulses: breadth-first along the semantic edges from a start chunk */
const held = new Set();
function clearHeld() { held.forEach((i) => { glow[i] = i < C ? 0.55 : glow[i]; }); held.clear(); glowAttr.needsUpdate = true; }
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
function simulate() {
  const ents = CORPUS.entities;
  const e = ents[Math.floor(Math.random() * ents.length)];
  fire[iEnt(ents.indexOf(e))] = uniforms.uTime.value; fireAttr.needsUpdate = true;
  impulse(e.chunks[0] ?? 0);
}

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
  // idle: sway ±22° around the profile view; returns to the profile when the user is active
  const idle = REDUCED ? 0 : Math.min(1, Math.max(0, (now - lastInput - 2500) / 3000));
  swayQ.setFromAxisAngle(Y, Math.sin(t * 0.21) * 0.38 * idle);
  if (!drag) dragQ.slerp(restQ, 1 - Math.pow(0.35, dt * (idle > 0 ? 1 : 0.15)));   // drag springs back slowly
  tilt.x += (tilt.tx - tilt.x) * 0.06; tilt.y += (tilt.ty - tilt.y) * 0.06;
  pivot.rotation.set(tilt.y * 0.35, tilt.x * 0.6, 0);
  brain.quaternion.copy(dragQ).multiply(swayQ);
  if (!REDUCED) sparks(t);
  renderer.render(world, camera);
  if (!firstFrame) { firstFrame = true; stage.classList.add("gl"); stage.classList.remove("no-gl"); }   // poster fades out
  placeOverlay();
  stepFlights(now);
  placeTele();
  {
    const t = targetGeo(), e = 1 - Math.pow(0.02, dt);
    if (Math.abs(t.cx - g.cx) + Math.abs(t.cy - g.cy) + Math.abs(t.u - g.u) > 0.3) {
      g.cx += (t.cx - g.cx) * e; g.cy += (t.cy - g.cy) * e; g.u += (t.u - g.u) * e; applyView();
    }
  }
  placeCite();
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

/* ---- (2) tokens fly from the prompt into the brain · (3) live telemetry next to the active region */
const STOP = new Set(("a an the of to in on for and or is are was were be been do does did he his him what which who how " +
  "this that with as at by from it its about me tell has have had o a os as um uma de do da dos das em no na nos nas " +
  "para por que qual quais quem como e é ele dele foi ser sobre me fale tem já ja").split(" "));
const SYN = { anos: "years", ano: "years", experiencia: "experience", projeto: "project", projetos: "project",
  banco: "database", vetorial: "vector", seguranca: "security", custo: "cost", custos: "cost", avaliacao: "evals",
  agente: "agent", agentes: "agents", busca: "search", pesquisa: "search", trabalhou: "worked", empresa: "company",
  nuvem: "cloud", fez: "built", funciona: "works", producao: "production", defesas: "defenses",
  grafo: "graph", carreira: "career", observabilidade: "observability", jogo: "game" };
const norm = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const toks = (x) => norm(x).split(/[^a-z0-9.+#]+/).map((w) => w.replace(/\.$/, "")).filter((w) => w.length > 1 && !STOP.has(w));
const docs = CORPUS.chunks.map((c) => toks(`${c.heading} ${c.heading} ${c.text}`).map((w) => SYN[w] || w));
const df = new Map(); docs.forEach((d) => new Set(d).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
function search(q) {
  const nq = norm(q);
  if (/(ignore|ignora|disregard|system prompt|prompt do sistema|jailbreak|suas instru|your instruc|pretend|finja)/.test(nq)) return { blocked: true, words: toks(q), hits: [], ents: [] };
  const words = toks(q), qt = words.map((w) => SYN[w] || w);
  const scored = docs.map((d) => {
    let sc = 0; const matched = [];
    for (const w of new Set(qt)) {
      const f = d.filter((x) => x === w || (w.length > 4 && x.startsWith(w))).length; if (!f) continue;
      const idf = Math.log(1 + (docs.length - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5));
      sc += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.length / avg)); matched.push(w);
    }
    return { sc, matched };
  });
  const ents = CORPUS.entities.map((e, i) => ({ e, i })).filter(({ e }) => nq.includes(norm(e.name)));
  ents.forEach(({ e }) => e.chunks.forEach((k) => { scored[k].sc = scored[k].sc * 1.5 + 0.6; }));
  const ranked = scored.map((r, k) => ({ ...r, k })).filter((r) => r.sc > 0).sort((a, b) => b.sc - a.sc);
  const top = ranked[0]?.sc || 0;
  const hits = ranked.filter((r) => r.sc >= top * 0.35).slice(0, 6);
  return { blocked: false, words, qt, hits, ents, top };
}

const tele = $("telemetry");
let teleOn = false, teleAnchor = [];
function teleLine(txt, cls) { const li = document.createElement("li"); li.textContent = txt; if (cls) li.className = cls; tele.querySelector("ol").append(li); }
function placeTele() {
  if (!teleOn || !teleAnchor.length) return;
  let sx = 0, sy = 0; teleAnchor.forEach((i) => { const [x, y] = screenOf(i); sx += x; sy += y; });
  sx /= teleAnchor.length; sy /= teleAnchor.length;
  const w = tele.offsetWidth, h = tele.offsetHeight;
  if (portrait()) { tele.style.transform = `translate(10px, ${H - h - 96}px)`; return; }
  const openA = !ans.hidden, minLeft = openA ? ans.getBoundingClientRect().right + 24 : 8;
  let left = sx + 120 * s, top = sy - h / 2;
  if (left < minLeft) left = Math.max(minLeft, sx + 120 * s);
  if (left + w > W - 8) left = W - w - 8;
  if (openA) top = Math.max(8, H * 0.08);   // with the answer open: top-right corner, out of the way
  top = Math.max(8, Math.min(H - h - 90 * s, top));
  tele.style.transform = `translate(${left}px, ${top}px)`;
}

const flights = [];
function flyTokens(r, onDone) {
  const box = $("q").getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const words = r.words.slice(0, 7);
  if (!words.length) { onDone(); return; }
  let left = words.length;
  words.forEach((w, n) => {
    const qt = SYN[w] || w;
    const hit = r.hits.find((h) => h.matched.includes(qt));
    const ent = r.ents.find(({ e }) => norm(e.name).includes(w));
    const target = r.blocked ? -1 : hit ? hit.k : ent ? iEnt(ent.i) : -1;
    const el = document.createElement("span");
    el.className = "tok" + (r.blocked ? " blocked" : target < 0 ? " miss" : "");
    el.textContent = w; stage.append(el);
    const x0 = box.left - sr.left + 18 + (box.width - 36) * (words.length > 1 ? n / (words.length - 1) : 0.5), y0 = box.top - sr.top;
    flights.push({ el, x0, y0, target, t0: performance.now() + n * 140, dur: 950 + n * 40, done: false,
      land() {
        if (this.target >= 0) { fire[this.target] = uniforms.uTime.value; fireAttr.needsUpdate = true; if (this.target < C) impulse(this.target, 1, true); }
        if (--left === 0) onDone();
      } });
  });
}
function stepFlights(now) {
  for (let k = flights.length - 1; k >= 0; k--) {
    const f = flights[k], u = (now - f.t0) / f.dur;
    if (u < 0) { f.el.style.opacity = 0; continue; }
    let tx, ty;
    if (f.target >= 0) [tx, ty] = screenOf(f.target);
    else { tx = f.x0 + (W * 0.5 - f.x0) * 0.55; ty = H * 0.55; }   // no match / blocked: dies on the way
    const e = Math.min(1, u), ease = 1 - Math.pow(1 - e, 3);
    const cx = (f.x0 + tx) / 2, cy = Math.min(f.y0, ty) - 160 * s;
    const x = (1 - ease) ** 2 * f.x0 + 2 * (1 - ease) * ease * cx + ease ** 2 * tx;
    const y = (1 - ease) ** 2 * f.y0 + 2 * (1 - ease) * ease * cy + ease ** 2 * ty;
    const fade = f.target >= 0 ? 1 - Math.max(0, (u - 0.85) / 0.15) : 1 - Math.max(0, (u - 0.5) / 0.5);
    f.el.style.opacity = Math.max(0, fade);
    f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - 0.6 * ease})`;
    if (u >= 1 && !f.done) { f.done = true; f.land(); }
    if (u >= 1.05) { f.el.remove(); flights.splice(k, 1); }
  }
}

let runId = 0;
function ask(q) {
  const id = ++runId, t0 = performance.now();
  const r = search(q), ms = performance.now() - t0;
  clearHeld();
  flights.forEach((f) => f.el.remove()); flights.length = 0;
  tele.querySelector("ol").replaceChildren(); tele.hidden = false; teleOn = true;
  teleAnchor = r.hits.length ? r.hits.map((h) => h.k) : [iHub(1)];
  const say = (txt, delay, cls) => setTimeout(() => { if (id === runId) teleLine(txt, cls); }, delay);
  say(t().query(r.words.length, q.length), 0);
  if (r.blocked) { say(t().guardBlocked, 400, "warn"); flyTokens(r, () => {}); setTimeout(() => { if (id === runId) showAnswer(r, q, id); }, 1200); return; }
  say(t().guardOk, 200);
  if (r.ents.length) say(`graph · ${r.ents.map(({ e }) => e.name).join(", ")}`, 420);
  flyTokens(r, () => {
    if (id !== runId) return;
    r.hits.forEach((h) => { held.add(h.k); glow[h.k] = 2; }); glowAttr.needsUpdate = true;
    if (r.hits.length) impulse(r.hits[0].k, 2, true);
  });
  say(t().retrieve(r.hits.length, C), 700);
  if (r.hits.length) {
    const cov = r.qt.filter((w) => r.hits.some((h) => h.matched.includes(w))).length;
    say(t().relevance(r.top.toFixed(1), (r.hits.at(-1).sc / r.top).toFixed(2)), 1000);
    say(t().coverage(cov, r.qt.length), 1250);
  } else say(t().noHits, 1000, "warn");
  say(t().latency(ms.toFixed(1)), 1500);
  say(t().cost, 1700, "dim");
  setTimeout(() => { if (id === runId) showAnswer(r, q, id); }, 1900);
}
$("ask").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) ask(q); });
$("teleClose").addEventListener("click", () => { teleOn = false; tele.hidden = true; clearHeld(); runId++; });


/* ---- final result: answer panel with cited claims, sources, verify line (mock: extractive, no model) */
const ans = $("answer"), ansText = $("ansText"), ansSrc = $("ansSources"), ansFoot = $("ansFoot");
const citeLine = $("citeLine"), citeDot = $("citeDot"), citeSvg = $("cite");
let citeFrom = null, citeK = -1, streamTimer = 0;
function openAnswer(on) {
  ans.hidden = !on; stage.classList.toggle("has-answer", on);
  view.tk = on ? 0.9 : 1;
  view.tdx = on ? 0 : IDLE_DX;
  if (on && W > 900 && !portrait()) requestAnimationFrame(() => {
    // the frontal pole (x ≈ -1) lands ~28 px right of the panel, whatever the window size
    const baseCx = W / 2 + (ORIGIN[0] - REF_W / 2) * sFit, panelR = ans.getBoundingClientRect().right - stage.getBoundingClientRect().left;
    const want = panelR + 28 + 1.02 * UNIT * sFit * view.tk;
    view.tdx = Math.max(0, (want - baseCx) / W);
  });
}
// pick the most prose-like sentence of a chunk that mentions the query (README tables and env lists lose)
function bestSentence(t, qt) {
  const sents = t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map((x) => x.trim()).filter((x) => x.length >= 40 && x.length <= 240);
  let best = null, bs = -9;
  for (const x of sents) {
    const words = x.split(" "), prose = words.filter((w) => /^[a-zà-ú,;:()'’—-]{2,}$/.test(w)).length / words.length;
    const caps = words.filter((w) => /^[A-Z_]{3,}$/.test(w)).length;
    const hitsQ = toks(x).map((w) => SYN[w] || w).filter((w) => qt.includes(w)).length;
    const sc = prose * 2 + hitsQ * 0.6 - caps * 0.5 - (/[=|_{}]|\s-\s/.test(x) ? 1.5 : 0) + (/[.!?]$/.test(x) ? 0.3 : 0);
    if (sc > bs) { bs = sc; best = x; }
  }
  return bs > 1.1 ? best : null;
}
function hoverChunk(el, k) {
  citeFrom = el; citeK = k;
  if (k >= 0) { fire[k] = uniforms.uTime.value; fireAttr.needsUpdate = true; }
  citeSvg.classList.toggle("is-on", k >= 0);
}
function placeCite() {
  if (citeK < 0 || !citeFrom) return;
  const r = citeFrom.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const x0 = r.right - sr.left + 4, y0 = r.top - sr.top + r.height / 2;
  const [x, y] = screenOf(citeK);
  citeLine.setAttribute("points", `${x0},${y0} ${x0 + (x - x0) * 0.35},${y0} ${x},${y}`);
  citeDot.setAttribute("cx", x); citeDot.setAttribute("cy", y);
}
function citeButton(n, k) {
  const b = document.createElement("button"); b.type = "button"; b.className = "cite"; b.textContent = n;
  b.addEventListener("mouseenter", () => hoverChunk(b, k));
  b.addEventListener("mouseleave", () => hoverChunk(null, -1));
  b.addEventListener("click", () => impulse(k, 2, true));
  return b;
}
function showAnswer(r, q, id) {
  clearInterval(streamTimer);
  $("ansQ").textContent = q;
  ansText.replaceChildren(); ansSrc.replaceChildren(); ansFoot.replaceChildren();
  openAnswer(true);
  const note = document.createElement("p"); note.className = "ans-note";
  if (r.blocked) {
    ansText.textContent = t().blocked;
    ansText.className = "ans-text warn"; return;
  }
  ansText.className = "ans-text";
  if (!r.hits.length) {
    ansText.textContent = t().abstain;
    const hint = document.createElement("p"); hint.className = "ans-note"; hint.textContent = t().abstainHint;
    ansText.after(hint); return;
  }
  const claims = [], seenTxt = new Set();
  r.hits.forEach((h, n) => {
    if (claims.length >= 3) return;
    const x = bestSentence(CORPUS.chunks[h.k].text, r.qt);
    if (x && !seenTxt.has(x)) { seenTxt.add(x); claims.push({ n: n + 1, k: h.k, text: x }); }
  });
  if (!claims.length) claims.push({ n: 1, k: r.hits[0].k, text: CORPUS.chunks[r.hits[0].k].text.slice(0, 180) + "…" });
  // stream: characters appear in order; each claim gets its citation when it ends
  let ci = 0, pos2 = 0, span = null;
  streamTimer = setInterval(() => {
    if (id !== runId) { clearInterval(streamTimer); return; }
    const c = claims[ci];
    if (!span) { span = document.createElement("span"); ansText.append(span); }
    pos2 = Math.min(c.text.length, pos2 + 3);
    span.textContent = c.text.slice(0, pos2);
    if (pos2 >= c.text.length) {
      ansText.append(citeButton(c.n, c.k), document.createTextNode(" "));
      fire[c.k] = uniforms.uTime.value; fireAttr.needsUpdate = true;
      ci++; pos2 = 0; span = null;
      if (ci >= claims.length) { clearInterval(streamTimer); finish(); }
    }
  }, 16);
  function finish() {
    note.textContent = t().note;
    ansText.after(note);
    const h = document.createElement("h4"); h.textContent = t().sources(r.hits.length);
    ansSrc.append(h);
    r.hits.forEach((hit, n) => {
      const ch = CORPUS.chunks[hit.k], li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = "src";
      const top = document.createElement("span"); top.className = "src-top";
      const a = document.createElement("span"); a.textContent = `[${n + 1}] ${ch.title} › ${ch.heading.split(" › ").pop()}`;
      const rel = document.createElement("span"); rel.className = "rel"; rel.style.setProperty("--rel", (hit.sc / r.top).toFixed(2)); rel.textContent = (hit.sc / r.top).toFixed(2);
      top.append(a, rel);
      const sn = document.createElement("span"); sn.className = "src-text"; sn.textContent = ch.text;
      b.append(top, sn);
      b.addEventListener("mouseenter", () => hoverChunk(b, hit.k));
      b.addEventListener("mouseleave", () => hoverChunk(null, -1));
      b.addEventListener("click", () => impulse(hit.k, 2, true));
      li.append(b); ansSrc.append(li);
    });
    const ok = document.createElement("span"); ok.className = "ok"; ok.textContent = t().verified(claims.length);
    const tr = document.createElement("a"); tr.href = "#trace"; tr.textContent = t().trace;
    ansFoot.append(ok, tr);
    teleLine(t().answerLine(claims.length));
    teleLine(t().verifyLine(claims.length));
  }
}
$("ansClose").addEventListener("click", () => { runId++; clearInterval(streamTimer); openAnswer(false); hoverChunk(null, -1); teleOn = false; tele.hidden = true; clearHeld(); });


/* ---- intro: typed terminal line, rotating examples, PT/EN */
let typeTimer, phTimer, phIndex = 0;
function typeLine() {
  clearTimeout(typeTimer);
  const el = $("typed"), msg = t().typed;
  if (REDUCED) { el.textContent = msg; return; }
  let k = 0;
  (function step() { el.textContent = msg.slice(0, k++); if (k <= msg.length) typeTimer = setTimeout(step, 55); })();
}
function rotatePlaceholder() {
  clearInterval(phTimer); phIndex = 0;
  const q = $("q"), set = () => { q.placeholder = t().examples[phIndex++ % t().examples.length]; };
  set();
  if (!REDUCED) phTimer = setInterval(() => { if (document.activeElement !== q) set(); }, 3800);
}
function applyLang(next) {
  lang = next;
  try { localStorage.setItem("lang", lang); } catch { /* storage blocked */ }
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  document.documentElement.dataset.lang = lang;   // the content below the hero shows .pt or .en from this
  document.querySelectorAll(".lang [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  $("role").textContent = t().role;
  $("qLabel").textContent = t().askLabel;
  $("askGo").title = t().send; $("ansClose").title = t().close; $("teleClose").title = t().close;
  $("teleTitle").textContent = t().tele;
  DATA.hubs.forEach((h, j) => { labels[j].textContent = t().hubs[h.id].title; });
  if (cardHub >= 0) fillCard(cardHub);
  typeLine(); rotatePlaceholder();
}
document.querySelectorAll(".lang [data-lang]").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang)));
applyLang(lang);

window.__brain = { simulate, impulse, showCard, ask };

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
