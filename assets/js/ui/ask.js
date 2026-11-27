// The question box, the steps panel (telemetry), the token flight into the brain and the answer panel.
// Answers come only from `ask(question, {signal, token})` (the token from the bot check, see `gated`), which yields the stream events of the API (zorzo-api LLD
// "Stream events"); the brain, when there is one, only reacts to them. Without the brain everything here works
// the same, minus the effects (F01 PRD, story S11).

import { AskError } from "../data/api.js";
import { currentLang, onLang, t } from "../i18n.js";
import { namedIn, term, words } from "../text.js";
import { $, REDUCED } from "../util.js";

const MAX_TOKENS = 7;                       // words that fly from the box
const flightStart = (n) => n * 140;          // ms after the question, per word
const flightDur = (n) => 950 + n * 40;

/**
 * @param scene the brain's controls, or null without 3D
 * @param ask (question, {signal, token}) → async iterator of stream events
 * @param published { corpus, examples, entities }
 * @param health the API's health (ui/health.js): its state drives the box, and a question that finds the API
 *   unreachable reports it
 * @param bot the bot check (ui/turnstile.js): `token()` hands out a fresh, single-use token
 */
export function startAsk({ scene: brain, stage, ask, published, health, bot }) {
  let scene = brain;   // becomes null if the brain fails: from then on, the path without 3D
  const chunks = published.corpus.chunks;
  const byId = new Map(chunks.map((c, k) => [c.id, k]));
  const tele = $("telemetry"), teleList = tele.querySelector("ol");
  const ans = $("answer"), ansText = $("ansText"), ansSrc = $("ansSources");
  const citeLine = $("citeLine"), citeDot = $("citeDot"), citeSvg = $("cite");
  const below = $("askBelow"), note = $("askNote"), exList = $("askExamples");   // under the box
  const inputError = $("askError");   // what to fix in the question (422), right under the box
  let current = null;            // AbortController of the question in flight
  let teleOn = false, teleAnchor = [], citeFrom = null, citeK = -1;
  const flights = [];

  /* ---- steps panel, next to the region the answer comes from */
  function teleLine(txt, cls) { const li = document.createElement("li"); li.textContent = txt; if (cls) li.className = cls; teleList.append(li); }
  function placeTele() {
    if (!scene || !teleOn || !teleAnchor.length) return;
    const { W, H, s, portrait } = scene.size();
    let sx = 0, sy = 0; teleAnchor.forEach((i) => { const [x, y] = scene.screenOf(i); sx += x; sy += y; });
    sx /= teleAnchor.length; sy /= teleAnchor.length;
    const w = tele.offsetWidth, h = tele.offsetHeight;
    const ex = below.offsetHeight;   // the box sits above the notice and the examples
    // 96: the portrait box's bottom and height in styles.css (14px + 50px) plus a 32px gap
    if (portrait) { tele.style.transform = `translate(10px, ${Math.max(8, H - h - 96 - ex)}px)`; return; }
    const openA = !ans.hidden, minLeft = openA ? ans.getBoundingClientRect().right + 24 : 8;
    let left = sx + 120 * s, top = sy - h / 2;
    left = Math.max(minLeft, left);
    if (left + w > W - 8) left = W - w - 8;
    if (openA) top = Math.max(8, H * 0.08);   // with the answer open: top-right corner, out of the way
    top = Math.max(8, Math.min(H - h - 90 * s - ex, top));
    tele.style.transform = `translate(${left}px, ${top}px)`;
  }

  /* ---- tokens fly from the box into the brain: to a chunk that has the word, an entity named by it, or nowhere */
  function flyTokens(question, hits, entities, blocked, landed) {
    // the answer never waits on frames: a hidden tab or a stalled scene still gets it after the longest flight
    let fired = false;
    // outside the frame: a bug in the panel must not end the brain, nor the brain's end the answer
    const onDone = () => { if (!fired) { fired = true; setTimeout(landed); } };
    setTimeout(onDone, flightStart(MAX_TOKENS - 1) + flightDur(MAX_TOKENS - 1) + 300);
    if (!scene) { onDone(); return; }
    const box = $("q").getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const ws = words(question).slice(0, MAX_TOKENS);
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
      flights.push({ el, x0, y0, target, t0: performance.now() + flightStart(n), dur: flightDur(n), done: false,
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
    if (on) requestAnimationFrame(() => !ans.hidden && scene?.setAnswering(true, ans.getBoundingClientRect().right - stage.getBoundingClientRect().left));
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
    ans.querySelectorAll(".ans-note, .ans-examples").forEach((el) => el.remove());   // left by a previous answer
    $("ansQ").textContent = question;
    ansText.replaceChildren(); ansSrc.replaceChildren();
    ansText.className = "ans-text";
    openAnswer(true);
  }
  function showBlocked() { ansText.textContent = t().blocked; ansText.className = "ans-text warn"; }
  /** A question that got no answer: the reason, and the public trace when the API sent one. */
  function showFailure({ kind, traceId, retryAfter }) {
    const reason = { offline: t().offline, dropped: t().connectionLost, bot: t().botCheck, limited: t().tryAgainIn(retryAfter) };
    ansText.textContent = reason[kind] ?? t().error;
    ansText.className = "ans-text warn";
    if (!traceId) return;
    const note = document.createElement("p"), link = document.createElement("a");
    note.className = "ans-note"; link.href = `/dash/t/${encodeURIComponent(traceId)}`; link.textContent = t().trace;
    note.append(link); ansText.after(note);
  }
  function showNoSources() {
    ansText.textContent = t().noSources;
    if (!examplesInLang().length) return;
    const hint = document.createElement("p"); hint.className = "ans-note"; hint.textContent = t().tryExamples;
    const list = document.createElement("ul"); list.className = "ans-examples";
    fillExamples(list);
    ansText.after(hint, list);
  }
  /**
   * One source in the panel's list: its number, title and heading, its text and link from corpus.json. A
   * chunk this page's corpus doesn't have (a version activated after the page loaded) shows by the title the
   * stream sends, with no text, link or brain point.
   */
  function sourceItem(id, title, n, rel) {
    const k = byId.get(id), ch = k === undefined ? null : chunks[k];
    const li = document.createElement("li"), b = document.createElement("button");
    li.dataset.id = id; b.type = "button"; b.className = "src";
    const row = document.createElement("span"); row.className = "src-top";
    const a = document.createElement("span");
    a.textContent = ch ? `[${n}] ${ch.title} › ${ch.heading.split(/ [›>] /).pop()}` : `[${n}] ${title}`;
    row.append(a);
    if (rel !== undefined) {
      const r = document.createElement("span"); r.className = "rel"; r.style.setProperty("--rel", rel.toFixed(2)); r.textContent = rel.toFixed(2);
      row.append(r);
    }
    b.append(row);
    li.append(b); ansSrc.append(li);
    if (!ch) return li;
    const sn = document.createElement("span"); sn.className = "src-text"; sn.textContent = ch.text;
    b.append(sn);
    b.addEventListener("mouseenter", () => hoverChunk(b, k));
    b.addEventListener("mouseleave", () => hoverChunk(null, -1));
    b.addEventListener("click", () => { li.classList.toggle("is-open"); scene?.impulse(k, 2, true); });
    if (/^https?:\/\//i.test(ch.source_url || "")) {   // only web links: never a javascript: URL from the data
      const link = document.createElement("a"); link.className = "src-link"; link.href = ch.source_url; link.textContent = ch.source_url;
      link.target = "_blank"; link.rel = "noopener"; li.append(link);
    }
    scene?.fire(k);
    return li;
  }
  function sourcesHeading(text) {
    const head = document.createElement("h4"); head.textContent = text;
    ansSrc.append(head);
  }
  function sourceList(hits, signal, heading = t().sources(hits.length)) {
    sourcesHeading(heading);
    const top = hits[0]?.score || 1;
    // passages appear one by one, each lighting its chunk
    hits.forEach((hit, n) => setTimeout(() => { if (!signal.aborted) sourceItem(hit.id, hit.title, n + 1, hit.score / top); }, n * 120));
  }
  function showPassages(hits, signal) {
    ansText.textContent = t().searchOnlyNotice;
    sourceList(hits, signal);
  }
  function contactNote() {
    const p = document.createElement("p"), a = document.createElement("a");
    p.className = "ans-note"; a.href = "#contact"; a.textContent = t().contactLink;
    p.append(a); return p;
  }
  /** Opens the draft, marked as being checked; checked claims replace it. */
  function startDraft() {
    ansText.className = "ans-text draft";
    const mark = document.createElement("p"); mark.className = "ans-note ans-checking"; mark.textContent = t().checking;
    ansText.after(mark);
  }
  function clearDraft() {
    ans.querySelectorAll(".ans-checking").forEach((el) => el.remove());
    ansText.className = "ans-text"; ansText.replaceChildren();
  }
  /**
   * The checked claims: each with numbered citations (numbered in order of first use), an unsupported one
   * struck through as removed, the gap sentence as a plain note; the cited sources listed below, a citation
   * opening its passage.
   */
  function showClaims(claims, hits) {
    clearDraft();
    const order = [];   // chunk ids in citation order; a removed claim shows no citation, so it adds none
    for (const c of claims) if (c.verdict !== "unsupported") for (const id of c.sources) if (!order.includes(id)) order.push(id);
    const items = new Map();
    for (const c of claims) {
      const span = document.createElement("span"); span.className = `claim ${c.verdict}`;
      if (c.verdict === "unsupported") {
        const s = document.createElement("s"); s.textContent = c.text;
        const why = document.createElement("span"); why.className = "claim-why"; why.textContent = ` (${t().removed})`;
        span.append(s, why);
      } else {
        span.append(c.text);
        for (const id of c.sources) {
          const n = order.indexOf(id) + 1, b = document.createElement("button");
          b.type = "button"; b.className = "cite"; b.textContent = `[${n}]`; b.setAttribute("aria-label", t().cite(n));
          b.addEventListener("click", () => openSource(items.get(id)));
          span.append(" ", b);
        }
      }
      ansText.append(span, " ");
    }
    if (!order.length) return;
    sourcesHeading(t().sources(order.length));
    const titles = new Map(hits.map((h) => [h.id, h.title]));
    order.forEach((id, i) => items.set(id, sourceItem(id, titles.get(id) ?? "", i + 1)));
  }
  function openSource(li) {
    if (!li) return;
    ansSrc.querySelectorAll("li.is-open").forEach((el) => el !== li && el.classList.remove("is-open"));
    li.classList.add("is-open");
    li.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
    const k = byId.get(Number(li.dataset.id));
    if (k !== undefined) scene?.impulse(k, 2, true);
  }
  /** "Not in my sources", with the passages that came closest and the contact link. */
  function showAbstention(hits, signal) {
    clearDraft();
    ansText.textContent = t().notInSources;
    ansText.after(contactNote());
    if (hits.length) sourceList(hits, signal, t().related);
  }
  function showDecline() {
    clearDraft();
    ansText.textContent = t().declined;
    ansText.after(contactNote());
  }

  /**
   * The question's stream, behind the bot check: a fresh token per request. A 403 gets one more try with a new
   * token; without a token nothing is sent (zorzo-api LLD "Front against the API").
   */
  async function* gated(question, signal) {
    for (let retried = false; ; retried = true) {
      let token;
      try { token = await bot.token(signal); } catch (err) {
        if (signal.aborted) throw err;   // a newer question took over: not a bot-check failure
        console.error(err); throw new AskError("bot");
      }
      try { yield* ask(question, { signal, token }); return; } catch (err) {
        if (retried || !(err instanceof AskError) || err.kind !== "bot") throw err;
      }
    }
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
    let hits = [], ks = [], blocked = null, failure = null, retrieveMs = null;
    let drafting = false, outcome = null, usage = null;
    const claims = [];
    try {
      let first = true;
      for await (const ev of gated(question, signal)) {
        if (signal.aborted) return;
        if (first) { first = false; health.reached(); }   // a stream: the API answers
        if (ev.kind === "stage" && ev.status === "end") {
          if (ev.name === "retrieve") { retrieveMs = ev.ms; continue; }   // shown with the hits
          teleLine(ev.name === "guard" ? t().guardOk : t().stage(ev.name, ev.ms));
          if (ev.name === "guard" && named.length) teleLine(`graph · ${named.map((j) => published.entities[j].name).join(", ")}`);
        } else if (ev.kind === "blocked") {
          blocked = ev; teleLine(t().guardBlocked(ev.layer), "warn");
        } else if (ev.kind === "degraded") {
          teleLine(t().searchOnly, "dim");
        } else if (ev.kind === "retrieval") {
          hits = ev.hits;
          teleLine(t().retrieve(hits.length, chunks.length, retrieveMs));
          if (hits.length) teleLine(t().relevance(hits[0].score.toFixed(3), (hits.at(-1).score / hits[0].score).toFixed(2)));
          else teleLine(t().noHits, "warn");
          ks = hits.map((h) => byId.get(h.id)).filter((k) => k !== undefined);   // the hits with a brain point
          if (scene && ks.length) teleAnchor = ks;
        } else if (ev.kind === "token") {
          // the draft opens the panel at once, marked as being checked (zorzo-api LLD "Front against the API")
          if (!drafting) { drafting = true; clearFlights(); startPanel(question); startDraft(); }
          ansText.append(ev.text);
        } else if (ev.kind === "claim") {
          claims.push(ev);
        } else if (ev.kind === "usage") {
          usage = ev;
        } else if (ev.kind === "done") {
          outcome = ev.outcome;
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      failure = err instanceof AskError ? err : new AskError("failed");
      if (failure.kind === "offline") health.offline();
      console.error(err);
    }
    if (failure?.kind === "invalid") {   // nothing to show in the panel: the question itself needs fixing
      hideTele();
      inputError.textContent = t().invalidInput; inputError.hidden = false;
      return;
    }
    teleLine(t().latency((performance.now() - t0).toFixed(0)));
    teleLine(usage ? t().costOf(usage.cost_usd) : t().cost, "dim");
    const render = () => {
      clearDraft();   // a draft left by a stream that broke is never shown as an answer
      if (failure) showFailure(failure);
      else if (blocked) showBlocked();
      else if (claims.length) showClaims(claims, hits);
      else if (outcome === "abstained") showAbstention(hits, signal);
      else if (outcome === "declined") showDecline();
      else if (!hits.length) showNoSources();
      else showPassages(hits, signal);
    };
    // the answer is on screen first; a brain effect that throws then ends the brain, not the answer
    const holdBrain = (impulse) => {
      if (!scene || !ks.length) return;
      try { scene.hold(ks); if (impulse) scene.impulse(ks[0], 2, true); } catch (err) { console.error(err); scene.fail(); }
    };
    if (drafting) { render(); holdBrain(false); return; }   // the panel is open: the answer replaces the draft
    // the answer opens once the tokens land, so the brain lights up first
    flyTokens(question, ks, named, Boolean(blocked), () => {
      if (signal.aborted) return;
      startPanel(question);
      render();
      holdBrain(true);
    });
  }
  function submit(question) { $("q").value = question; run(question); }

  $("ask").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) run(q); });
  $("q").addEventListener("input", () => { inputError.hidden = true; });
  // the question in flight stops, and its effects with it
  function reset() { current?.abort(); current = null; clearFlights(); hoverChunk(null, -1); scene?.clearHeld(); inputError.hidden = true; }
  function hideTele() { teleOn = false; tele.hidden = true; }
  function stop() { reset(); hideTele(); }
  $("teleClose").addEventListener("click", stop);
  $("ansClose").addEventListener("click", () => { stop(); openAnswer(false); });

  /* ---- example questions of the interface language: the list under the box and the rotating placeholder */
  const examplesInLang = () => published.examples.filter((e) => e.lang === currentLang());
  function fillExamples(list) {
    list.replaceChildren(...examplesInLang().map((ex) => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = ex.text; b.addEventListener("click", () => submit(ex.text));
      li.append(b); return li;
    }));
  }
  // the box, the intro and the hub links sit above the notice and the examples, by their height
  new ResizeObserver(([entry]) => stage.style.setProperty("--ex", `${entry.borderBoxSize[0].blockSize}px`)).observe(below);

  /* ---- API health: offline disables the box; search-only mode shows a notice before any question */
  function setHealth(state) {
    const off = state === "offline";
    $("q").disabled = off; $("askGo").disabled = off;
    stage.classList.toggle("offline", off);   // hides every example list, the answer panel's too
    note.hidden = state === "online";
    note.textContent = off ? t().offline : state === "degraded" ? t().degradedNotice : "";
  }
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
    fillExamples(exList);
    setHealth(health.state);
  });
  health.subscribe(setHealth);

  if (scene) {
    scene.onFrame((now) => { stepFlights(now); placeTele(); placeCite(); });
    scene.onFail(() => { scene = null; clearFlights(); hoverChunk(null, -1); tele.style.transform = ""; });
  }
}
