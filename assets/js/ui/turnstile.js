// Cloudflare Turnstile, the bot check every question carries (zorzo-api LLD "Security" and "Front against the
// API"). The page's one load from another origin: Cloudflare forbids serving the script from anywhere else.
// It loads on the first interaction with the question box, so a visitor who only browses never contacts
// Cloudflare. The widget is invisible and runs on demand: one token per question, and the next one is fetched
// in the background as soon as a token is used, so a question rarely waits.

import { LOCAL } from "../util.js";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TEST_SITE_KEY = "1x00000000000000000000BB";   // Cloudflare's invisible always-pass test key
// The production key comes from Cloudflare's dashboard with the deploy; until then production loads no script
// and has no token, so every question shows the bot-check message (fail closed).
const SITE_KEY = "";

/**
 * @param container the element the widget renders into (it stays invisible)
 * @param triggers elements whose first focus, key or pointer press loads the script
 * @returns token(signal): Promise<string>, a single-use token (rejects when none can be had, or on abort);
 *   handing one out resets the widget and fetches the next ahead
 */
export function startTurnstile({ container, triggers }) {
  const siteKey = LOCAL ? TEST_SITE_KEY : SITE_KEY;
  let api = null, widget = null, loading = null;
  // idle: nothing in hand; running: a challenge is out; ready: a token in hand. The widget is reset only when
  // no challenge is out, so a late callback can never land as the next question's token.
  let state = "idle", ready = null;
  let waiting = [];   // questions waiting for a token, oldest first; an aborted one leaves the line

  function settle(token, error) {
    state = token ? "ready" : "idle";
    ready = token;
    if (!token) { const now = waiting; waiting = []; now.forEach(({ reject }) => reject(error)); return; }
    // One token per question: the oldest gets this one, and taking it starts the challenge for the next.
    waiting.shift()?.resolve(take());
  }
  function run() {
    if (state !== "idle") return;
    state = "running";
    api.execute(widget);
  }
  function take() {   // hand out the token in hand, then fetch the next one (a token is single-use)
    const token = ready;
    ready = null; state = "idle";
    api.reset(widget);
    run();
    return token;
  }
  function load() {
    if (!siteKey) return Promise.reject(new Error("no Turnstile site key"));   // no script without a key
    loading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT; script.async = true;
      script.onload = () => {
        try {
          api = window.turnstile;
          widget = api.render(container, {
            sitekey: siteKey,
            execution: "execute",
            "refresh-expired": "manual",   // no challenge outside this state machine
            callback: (token) => settle(token),
            // after a failure the widget needs a reset before the next challenge
            "error-callback": () => { api.reset(widget); settle(null, new Error("turnstile error")); return true; },
            "timeout-callback": () => { api.reset(widget); settle(null, new Error("turnstile timeout")); },
            "expired-callback": () => {   // the token in hand lapsed: drop it, and fetch a new one if someone waits
              if (state !== "ready") return;
              ready = null; state = "idle"; api.reset(widget);
              if (waiting.length) run();
            },
          });
          resolve();
        } catch (err) {   // the script loaded but isn't Turnstile as expected: no token, not a hang
          loading = null; script.remove(); reject(err);
        }
      };
      script.onerror = () => { loading = null; script.remove(); reject(new Error("turnstile script")); };
      document.head.append(script);
    });
    return loading;
  }
  // The first interaction loads the script and fetches a token ahead; a failure here surfaces on the question.
  const warm = () => { load().then(run).catch(() => {}); };
  triggers.forEach((el) => ["focusin", "keydown", "pointerdown"].forEach((type) => el.addEventListener(type, warm, { once: true })));

  return {
    async token(signal) {
      await load();
      signal?.throwIfAborted();
      if (state === "ready") return take();
      const next = new Promise((resolve, reject) => {
        const leave = () => {   // a newer question replaced this one: leave the line
          waiting = waiting.filter((w) => w !== waiter);
          reject(signal.reason);
        };
        const done = () => signal?.removeEventListener("abort", leave);
        const waiter = {
          resolve: (token) => { done(); resolve(token); },
          reject: (err) => { done(); reject(err); },
        };
        waiting.push(waiter);
        signal?.addEventListener("abort", leave, { once: true });
      });
      run();
      return next;
    },
  };
}
