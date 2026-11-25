// The question box, the steps panel (telemetry), the token flight into the brain and the answer panel.
// Answers come only from `ask(question, {signal})`, which yields the stream events of the API (zorzo-api LLD
// "Stream events"); the brain, when there is one, only reacts to them. Without the brain everything here works
// the same, minus the effects (F01 PRD, story S11).

import { currentLang, onLang, t } from "../i18n.js";
import { namedIn, term, words } from "../text.js";
import { $, REDUCED } from "../util.js";

/**
 * @param scene the brain's controls, or null without 3D
 * @param ask (question, {signal}) → async iterator of stream events
 * @param published { corpus, examples, entities }
 */
export function startAsk({ scene, stage, ask, published }) {
  const chunks = published.corpus.chunks;
  const byId = new Map(chunks.map((c, k) => [c.id, k]));
  const tele = $("telemetry"), teleList = tele.querySelector("ol");
  const ans = $("answer"), ansText = $("ansText"), ansSrc = $("ansSources");
  const citeLine = $("citeLine"), citeDot = $("citeDot"), citeSvg = $("cite");
  let current = null;            // AbortController of the question in flight
  let teleOn = false, teleAnchor = [], citeFrom = null, citeK = -1;
  const flights = [];

  /* ---- steps panel, next to the region the answer comes from */
  function teleLine(txt, cls) { const li = document.createElement("li"); li.textContent = txt; if (cls) li.className = cls; teleList.append(li); }
  function placeTele() {
    if (!scene || !teleOn || !teleAnchor.length) return;
    // the scene lost its WebGL context: the panel takes the fixed corner of the page without 3D
    if (stage.classList.contains("no-gl")) { tele.style.transform = ""; return; }
    const { W, H, s, portrait } = scene.size();
    let sx = 0, sy = 0; teleAnchor.forEach((i) => { const [x, y] = scene.screenOf(i); sx += x; sy += y; });
    sx /= teleAnchor.length; sy /= teleAnchor.length;
    const w = tele.offsetWidth, h = tele.offsetHeight;
    if (portrait) { tele.style.transform = `translate(10px, ${H - h - 96}px)`; return; }
    const openA = !ans.hidden, minLeft = openA ? ans.getBoundingClientRect().right + 24 : 8;
    let left = sx + 120 * s, top = sy - h / 2;
    left = Math.max(minLeft, left);
    if (left + w > W - 8) left = W - w - 8;
    if (openA) top = Math.max(8, H * 0.08);   // with the answer open: top-right corner, out of the way
    top = Math.max(8, Math.min(H - h - 90 * s, top));
    tele.style.transform = `translate(${left}px, ${top}px)`;
  }

  /* ---- tokens fly from the box into the brain: to a chunk that has the word, an entity named by it, or nowhere */
  function flyTokens(question, hits, entities, blocked, landed) {
    // the answer never waits on frames: a hidden tab or a stalled scene still gets it after the longest flight
    let fired = false;
    const onDone = () => { if (!fired) { fired = true; landed(); } };
    setTimeout(onDone, 950 + 7 * 180 + 300);
    if (!scene) { onDone(); return; }
    const box = $("q").getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const ws = words(question).slice(0, 7);
    if (!ws.length) { onDone(); return; }
    const hitWords = hits.map((k) => new Set(words(`${chunks[k].heading} ${chunks[k].text}`).map(term)));
    let left = ws.length;
    ws.forEach((w, n) => {
      const h = hits.findIndex((_, j) => hitWords[j].has(term(w)));
      const e = entities.find((j) => words(published.entities[j].name).includes(w));
      const target = blocked ? -1 : h >= 0 ? hits[h] : e !== undefined ? scene.entityPoint(e) : -1;
      const el = document.createElement("span");
      el.className = "tok" + (blocked ? " blocked" : target < 0 ? " miss" : "");
      el.textContent = w; stage.append(el);
      const x0 = box.left - sr.left + 18 + (box.width - 36) * (ws.length > 1 ? n / (ws.length - 1) : 0.5), y0 = box.top - sr.top;
      flights.push({ el, x0, y0, target, t0: performance.now() + n * 140, dur: 950 + n * 40, done: false,
        land() {
          if (this.target >= 0) { scene.fire(this.target); if (this.target < scene.chunkCount) scene.impulse(this.target, 1, true); }
          if (--left === 0) onDone();
        } });
    });
  }
  function stepFlights(now) {
    const { W, H, s } = scene.size();
    for (let k = flights.length - 1; k >= 0; k--) {
      const f = flights[k], u = (now - f.t0) / f.dur;
      if (u < 0) { f.el.style.opacity = 0; continue; }
      let tx, ty;
      if (f.target >= 0) [tx, ty] = scene.screenOf(f.target);
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
  function clearFlights() { flights.forEach((f) => f.el.remove()); flights.length = 0; }

  /* ---- answer panel; a passage's citation line points at its chunk in the brain */
  function openAnswer(on) {
    ans.hidden = !on; stage.classList.toggle("has-answer", on);
    if (!scene) return;
    scene.setAnswering(on);
    if (on) requestAnimationFrame(() => scene.setAnswering(true, ans.getBoundingClientRect().right - stage.getBoundingClientRect().left));
  }
  function hoverChunk(el, k) {
    citeFrom = el; citeK = scene ? k : -1;
    if (citeK >= 0) scene.fire(k);
    citeSvg.classList.toggle("is-on", citeK >= 0);
  }
  function placeCite() {
    if (citeK < 0 || !citeFrom) return;
    const r = citeFrom.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const x0 = r.right - sr.left + 4, y0 = r.top - sr.top + r.height / 2;
    const [x, y] = scene.screenOf(citeK);
    citeLine.setAttribute("points", `${x0},${y0} ${x0 + (x - x0) * 0.35},${y0} ${x},${y}`);
    citeDot.setAttribute("cx", x); citeDot.setAttribute("cy", y);
  }
  function startPanel(question) {
    $("ansQ").textContent = question;
    ansText.replaceChildren(); ansSrc.replaceChildren();
    ansText.className = "ans-text";
    openAnswer(true);
  }
  function showBlocked() { ansText.textContent = t().blocked; ansText.className = "ans-text warn"; }
  function showError() { ansText.textContent = t().error; ansText.className = "ans-text warn"; }
  function showNoSources() {
    ansText.textContent = t().noSources;
    const hint = document.createElement("p"); hint.className = "ans-note"; hint.textContent = t().tryExamples;
    const list = document.createElement("ul"); list.className = "ans-examples";
    examplesInLang().forEach((ex) => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = ex.text; b.addEventListener("click", () => submit(ex.text));
      li.append(b); list.append(li);
    });
    ansText.after(hint, list);
  }
  function showPassages(hits, signal) {
    ansText.textContent = t().searchOnlyNotice;
    const head = document.createElement("h4"); head.textContent = t().sources(hits.length);
    ansSrc.append(head);
    const top = hits[0]?.score || 1;
    // passages appear one by one, each lighting its chunk, as the claims of an answer will
    hits.forEach((hit, n) => setTimeout(() => {
      if (signal.aborted) return;
      const k = byId.get(hit.id); if (k === undefined) return;
      const ch = chunks[k], li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = "src";
      const row = document.createElement("span"); row.className = "src-top";
      const a = document.createElement("span"); a.textContent = `[${n + 1}] ${ch.title} › ${ch.heading.split(/ [›>] /).pop()}`;
      const rel = document.createElement("span"); rel.className = "rel"; rel.style.setProperty("--rel", (hit.score / top).toFixed(2)); rel.textContent = (hit.score / top).toFixed(2);
      row.append(a, rel);
      const sn = document.createElement("span"); sn.className = "src-text"; sn.textContent = ch.text;
      b.append(row, sn);
      b.addEventListener("mouseenter", () => hoverChunk(b, k));
      b.addEventListener("mouseleave", () => hoverChunk(null, -1));
      b.addEventListener("click", () => scene?.impulse(k, 2, true));
      li.append(b); ansSrc.append(li);
      if (/^https?:\/\//i.test(ch.source_url || "")) {   // only web links: never a javascript: URL from the data
        const link = document.createElement("a"); link.className = "src-link"; link.href = ch.source_url; link.textContent = ch.source_url;
        link.target = "_blank"; link.rel = "noopener"; li.append(link);
      }
      scene?.fire(k);
    }, n * 120));
  }

  /* ---- one question: the events drive the steps, the brain and the panel */
  async function run(question) {
    reset();
    const controller = new AbortController(), { signal } = controller;
    current = controller;
    const t0 = performance.now();
    const named = namedIn(published.entities, question);
    teleList.replaceChildren(); tele.hidden = false; teleOn = true;
    teleAnchor = scene ? [scene.hubPoint(1)] : [];
    teleLine(t().query(words(question).length, question.length));
    let hits = [], blocked = null, failed = false, retrieveMs = null;
    try {
      for await (const ev of ask(question, { signal })) {
        if (signal.aborted) return;
        if (ev.kind === "stage" && ev.status === "end") {
          if (ev.name === "retrieve") { retrieveMs = ev.ms; continue; }   // shown with the hits
          teleLine(ev.name === "guard" ? t().guardOk : t().stage(ev.name, ev.ms));
          if (ev.name === "guard" && named.length) teleLine(`graph · ${named.map((j) => published.entities[j].name).join(", ")}`);
        } else if (ev.kind === "blocked") {
          blocked = ev; teleLine(t().guardBlocked(ev.layer), "warn");
        } else if (ev.kind === "degraded") {
          teleLine(t().searchOnly, "dim");
        } else if (ev.kind === "retrieval") {
          hits = ev.hits.filter((h) => byId.has(h.id));
          teleLine(t().retrieve(hits.length, chunks.length, retrieveMs));
          if (hits.length) teleLine(t().relevance(hits[0].score.toFixed(1), (hits.at(-1).score / hits[0].score).toFixed(2)));
          else teleLine(t().noHits, "warn");
          if (scene && hits.length) teleAnchor = hits.map((h) => byId.get(h.id));
        } else if (ev.kind === "error") {
          failed = true;
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      failed = true;
      console.error(err);
    }
    teleLine(t().latency((performance.now() - t0).toFixed(0)));
    teleLine(t().cost, "dim");
    const ks = hits.map((h) => byId.get(h.id));
    // the answer opens once the tokens land, so the brain lights up first
    flyTokens(question, ks, named, Boolean(blocked), () => {
      if (signal.aborted) return;
      if (scene && ks.length) { scene.hold(ks); scene.impulse(ks[0], 2, true); }
      startPanel(question);
      if (failed) showError();
      else if (blocked) showBlocked();
      else if (!hits.length) showNoSources();
      else showPassages(hits, signal);
    });
  }
  function submit(question) { $("q").value = question; run(question); }

  $("ask").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) run(q); });
  // the question in flight stops, and its effects with it
  function reset() { current?.abort(); current = null; clearFlights(); hoverChunk(null, -1); scene?.clearHeld(); }
  function stop() { reset(); teleOn = false; tele.hidden = true; }
  $("teleClose").addEventListener("click", stop);
  $("ansClose").addEventListener("click", () => { stop(); openAnswer(false); });

  /* ---- example questions of the interface language: the box's rotating placeholder */
  const examplesInLang = () => published.examples.filter((e) => e.lang === currentLang());
  let phTimer = 0, phIndex = 0;
  function rotatePlaceholder() {
    clearInterval(phTimer); phIndex = 0;
    const q = $("q"), list = examplesInLang();
    if (!list.length) { q.placeholder = ""; return; }
    const set = () => { q.placeholder = list[phIndex++ % list.length].text; };
    set();
    if (!REDUCED) phTimer = setInterval(() => { if (document.activeElement !== q) set(); }, 3800);
  }
  onLang(() => {
    $("qLabel").textContent = t().askLabel;
    $("askGo").title = t().send; $("ansClose").title = t().close; $("teleClose").title = t().close;
    $("teleTitle").textContent = t().tele;
    rotatePlaceholder();
  });

  if (scene) scene.onFrame((now) => { stepFlights(now); placeTele(); placeCite(); });
}
