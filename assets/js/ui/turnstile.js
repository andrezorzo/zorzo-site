// Cloudflare Turnstile, the bot check every question carries (zorzo-api LLD "Security" and "Front against the
// API"). The page's one load from another origin: Cloudflare forbids serving the script from anywhere else.
// It loads on the first interaction with the question box, so a visitor who only browses never contacts
// Cloudflare. The widget is invisible and runs on demand: one token per question, and the next one is fetched
// in the background as soon as a token is used, so a question rarely waits.

import { LOCAL } from "../util.js";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEST_SITE_KEY = "1x00000000000000000000BB";   // Cloudflare's invisible always-pass test key
// The production key comes from Cloudflare's dashboard with the deploy; until then the page has no token
// in production, and the gate refuses its questions (fail closed).
const SITE_KEY = "";

/**
 * @param container the element the widget renders into (it stays invisible)
 * @param triggers elements whose first focus, key or pointer press loads the script
 * @returns token(): Promise<string> (rejects when no token can be had), used(): the token went to a request
 */
export function startTurnstile({ container, triggers }) {
  let api = null, widget = null, loading = null;
  let ready = null;        // a token fetched ahead, not yet used
  let waiting = [];        // questions waiting for the next token
  let running = false;     // a challenge is in progress
  let failed = false;      // the last challenge errored: the widget needs a reset before the next

  function settle(token, error) {
    running = false;
    const now = waiting; waiting = [];
    if (token && !now.length) { ready = token; return; }   // fetched ahead
    now.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(error)));
  }
  function run() {
    if (running) return;
    running = true;
    if (failed) { failed = false; api.reset(widget); }
    api.execute(widget);
  }
  function load() {
    loading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT; script.async = true;
      script.onload = () => {
        api = window.turnstile;
        widget = api.render(container, {
          sitekey: LOCAL ? TEST_SITE_KEY : SITE_KEY,
          execution: "execute",
          callback: (token) => settle(token),
          "error-callback": () => { failed = true; settle(null, new Error("turnstile error")); return true; },
          "timeout-callback": () => { failed = true; settle(null, new Error("turnstile timeout")); },
          "expired-callback": () => { ready = null; },
        });
        resolve();
      };
      script.onerror = () => { loading = null; script.remove(); reject(new Error("turnstile script")); };
      document.head.append(script);
    });
    return loading;
  }
  // The first interaction loads the script and fetches a token ahead; a failure here surfaces on the question.
  const warm = () => { load().then(() => { if (!ready) run(); }).catch(() => {}); };
  triggers.forEach((el) => ["focusin", "keydown", "pointerdown"].forEach((type) => el.addEventListener(type, warm, { once: true })));

  return {
    async token() {
      await load();
      if (ready) { const token = ready; ready = null; return token; }
      const next = new Promise((resolve, reject) => waiting.push({ resolve, reject }));
      run();
      return next;
    },
    used() {   // a token is single-use: reset the widget and fetch the next one now
      if (!api) return;
      ready = null; running = false;
      api.reset(widget);
      run();
    },
  };
}
