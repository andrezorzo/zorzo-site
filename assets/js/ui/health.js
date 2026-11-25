// The API's health drives the page's state (zorzo-api LLD "Front against the API", "Health"): checked on load;
// while offline, again every HEALTH_POLL_INTERVAL and when the tab regains focus, back to online by itself.
// No polling while online. A question's outcome is fresher than a check already in flight: a question that finds
// the API unreachable sets offline at once, and one that gets a stream while offline or degraded asks for a check.
// A check in flight then has its result dropped and one more runs, so the state never goes back to an older one.

import { health } from "../data/api.js";

const HEALTH_POLL_INTERVAL = 30_000;   // zorzo-api LLD "Values and configuration"

/** Starts checking now; `state` is "online" until the first check answers. */
export function startHealth() {
  let state = "online", timer = 0, checking = false, again = false;
  const subscribers = [];
  function set(next) {
    state = next;
    subscribers.forEach((fn) => fn(next));
    clearTimeout(timer);
    if (next === "offline") timer = setTimeout(check, HEALTH_POLL_INTERVAL);
  }
  async function check() {
    if (checking) { again = true; return; }
    checking = true;
    try {
      const next = await health();
      if (!again) set(next);   // a question's outcome came meanwhile: the check queued after it decides
    } finally {
      checking = false;
      if (again) { again = false; check(); }
    }
  }
  const recheck = () => { if (state === "offline" && document.visibilityState === "visible") check(); };
  addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", recheck);
  check();
  return {
    get state() { return state; },
    /** Calls fn with every new state ("online", "degraded" or "offline"). */
    subscribe(fn) { subscribers.push(fn); },
    /** A question found the API unreachable. */
    offline() { set("offline"); if (checking) again = true; },
    /** A question got a stream: the API answers, and may have left (or entered) search-only mode. */
    reached() { if (state !== "online" || checking) check(); },
  };
}
