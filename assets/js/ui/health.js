// The API's health drives the page's state (zorzo-api LLD "Front against the API", "Health"): checked on load;
// while offline, again every HEALTH_POLL_INTERVAL and when the tab regains focus, back to online by itself.
// No polling while online: a failed question reports offline through `offline()`.

import { health } from "../data/api.js";

const HEALTH_POLL_INTERVAL = 30_000;   // zorzo-api LLD "Values and configuration"

/** @param onState called with "online", "degraded" or "offline" on every check */
export function startHealth(onState) {
  let state = null, timer = 0, checking = false;
  function set(next) {
    state = next; onState(next);
    clearTimeout(timer);
    if (next === "offline") timer = setTimeout(check, HEALTH_POLL_INTERVAL);
  }
  async function check() {
    if (checking) return;
    checking = true;
    try { set(await health()); } finally { checking = false; }
  }
  const recheck = () => { if (state === "offline" && document.visibilityState === "visible") check(); };
  addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", recheck);
  check();
  return { offline: () => set("offline") };
}
