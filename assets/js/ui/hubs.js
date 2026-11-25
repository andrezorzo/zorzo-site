// Hub labels next to their brain points, and the card a hub opens (hover or tap) with its leader line.
// Only with the 3D brain: without it, the plain links of the hub list show instead.

import { onLang, t } from "../i18n.js";
import { $ } from "../util.js";

export function startHubs(scene, stage) {
  const labels = scene.hubIds.map(() => {
    const el = document.createElement("div"); el.className = "label";
    $("labels").append(el); return el;
  });
  const card = $("card"), leader = $("leader"), leaderLine = $("leaderLine"), leaderDot = $("leaderDot");
  let cardHub = -1, hideTimer = 0, cardSide = null, labelW = [];

  function fillCard(j) {
    const h = t().hubs[scene.hubIds[j]];
    card.replaceChildren();
    const ttl = document.createElement("h3"); ttl.textContent = h.title;
    const p = document.createElement("p"); p.textContent = h.body;
    card.append(ttl, p);
    if (h.link) { const a = document.createElement("a"); a.textContent = h.link[0]; a.href = h.link[1]; if (h.link[1].endsWith(".pdf")) a.download = ""; card.append(a); }
    if (h.soon) { const s2 = document.createElement("p"); s2.className = "soon"; s2.textContent = h.soon; card.append(s2); }
  }

  function place() {
    const { W, H, s } = scene.size();
    scene.hubIds.forEach((_, j) => {
      const [x, y, z] = scene.screenOf(scene.hubPoint(j));
      const lw = labelW[j], flip = x + 10 + lw > W - 6;   // near the right edge: label goes to the left of its point
      labels[j].classList.toggle("flip", flip);
      labels[j].style.transform = `translate(${flip ? x - 10 - lw : x + 10 * Math.max(s, 0.6)}px, ${y - 8}px)`;
      labels[j].classList.toggle("back", z < -0.2);
      labels[j].classList.toggle("on", j === cardHub);
    });
    if (cardHub < 0) return;
    const [x, y] = scene.screenOf(scene.hubPoint(cardHub)), w = card.offsetWidth, hh = card.offsetHeight;
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

  function showCard(j) {
    clearTimeout(hideTimer); hideTimer = 0;
    if (j === cardHub) return;
    if (j < 0) {
      hideTimer = setTimeout(() => {
        hideTimer = 0; cardHub = -1; card.classList.remove("is-on"); leader.classList.remove("is-on");
        setTimeout(() => { if (cardHub < 0) card.hidden = true; }, 160);
      }, 450);
      return;
    }
    cardHub = j; cardSide = null; fillCard(j); card.hidden = false;
    requestAnimationFrame(() => { card.classList.add("is-on"); leader.classList.add("is-on"); });
  }

  // the card stays open while the pointer is on it (to click the link), and the idle sway does not start under it
  card.addEventListener("pointerenter", () => { clearTimeout(hideTimer); hideTimer = 0; });
  card.addEventListener("pointermove", () => scene.poke());
  card.addEventListener("pointerleave", () => showCard(-1));

  // an open card stays open while the pointer travels from its point to it (the box spanning both)
  function inCorridor(px, py) {
    const [x, y] = scene.screenOf(scene.hubPoint(cardHub)), c = card.getBoundingClientRect(), o = stage.getBoundingClientRect(), pad = 24;
    const l = Math.min(x, c.left - o.left) - pad, r = Math.max(x, c.right - o.left) + pad;
    const tp = Math.min(y, c.top - o.top) - pad, b = Math.max(y, c.bottom - o.top) + pad;
    return px >= l && px <= r && py >= tp && py <= b;
  }
  scene.onHover((hit, px, py) => {
    if (hit?.kind === "hub") { showCard(hit.index); return; }
    if (cardHub < 0) return;
    if (inCorridor(px, py)) { clearTimeout(hideTimer); hideTimer = 0; }
    else if (!hideTimer) showCard(-1);
  });
  scene.onTap((hit) => { if (hit?.kind === "hub") showCard(hit.index); });
  scene.onFrame(place);
  scene.onFail(() => { cardHub = -1; card.hidden = true; card.classList.remove("is-on"); leader.classList.remove("is-on"); });

  onLang(() => {
    scene.hubIds.forEach((id, j) => { labels[j].textContent = t().hubs[id].title; });
    labelW = labels.map((el) => el.offsetWidth);   // measured once per language, not every frame
    if (cardHub >= 0) fillCard(cardHub);
  });
}
