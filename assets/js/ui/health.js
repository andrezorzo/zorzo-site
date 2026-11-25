// The API's health drives the page's state (zorzo-api LLD "Front against the API", "Health"): checked on load;
// while offline, again every HEALTH_POLL_INTERVAL and when the tab regains focus, back to online by itself.
// No polling while online: a question that finds the API unreachable reports it through `offline()`.

import { health } from "../data/api.js";

const HEALTH_POLL_INTERVAL = 30_000;   // zorzo-api LLD "Values and configuration"

/** Starts checking now; `state` is "online" until the first check answers. */
export function startHealth() {
  let state = "online", timer = 0, checking = false, reported = 0;
  const subscribers = [];
  function set(next) {
    state = next;
    subscribers.forEach((fn) => fn(next));
    clearTimeout(timer);
    if (next === "offline") timer = setTimeout(check, HEALTH_POLL_INTERVAL);
  }
  async function check() {
    if (checking) return;
    checking = true;
    const since = reported;
    try {
      const next = await health();
      if (since === reported) set(next);   // a failed question reported offline meanwhile: that wins
    } finally { checking = false; }
  }
  const recheck = () => { if (state === "offline" && document.visibilityState === "visible") check(); };
  addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", recheck);
  check();
  return {
    get state() { return state; },
    /** Calls fn with every new state ("online", "degraded" or "offline"). */
    subscribe(fn) { subscribers.push(fn); },
    offline: () => { reported++; set("offline"); },
  };
}
