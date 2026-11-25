// The intro: the typed terminal line, the role, and the PT/EN switch.

import { onLang, setLang, t } from "../i18n.js";
import { $, REDUCED } from "../util.js";

export function startIntro() {
  let typeTimer = 0;
  function typeLine() {
    clearTimeout(typeTimer);
    const el = $("typed"), msg = t().typed;
    if (REDUCED) { el.textContent = msg; return; }
    let k = 0;
    (function step() { el.textContent = msg.slice(0, k++); if (k <= msg.length) typeTimer = setTimeout(step, 55); })();
  }
  const buttons = document.querySelectorAll(".lang [data-lang]");
  buttons.forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
  onLang((lang) => {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    $("role").textContent = t().role;
    document.querySelectorAll("#hubList [data-en]").forEach((el) => { el.textContent = el.getAttribute(`data-${lang}`); });
    typeLine();
  });
}
