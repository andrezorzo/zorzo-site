import { test as base, expect, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// The published data of the fixture corpus, produced by the real ingest of zorzo-api's tests/fixtures/corpus
// with the fake embedder. Requests to data/ are answered from it, as the bucket would.
const DATA = path.join(__dirname, "..", "fixtures", "data");
export const manifest = JSON.parse(readFileSync(path.join(DATA, "manifest.json"), "utf8"));
const folder = path.join(DATA, manifest.path.replace(/^data\//, ""));
export const corpus = JSON.parse(readFileSync(path.join(folder, "corpus.json"), "utf8"));
export const examples: { id: string; lang: string; text: string }[] = JSON.parse(readFileSync(path.join(folder, "examples.json"), "utf8"));

// The API's streams recorded over the same fixture database (tools/record_streams.py), validated against the
// SSE schema by streams.spec.ts. The page only ever gets one of these files, or a part of one.
const STREAMS = path.join(__dirname, "..", "fixtures", "streams");
export const stream = (name: "passages" | "no-passages" | "error") => readFileSync(path.join(STREAMS, `${name}.sse`), "utf8");
export const isAsk = (url: URL) => url.pathname === "/api/v1/ask";
export const isAskRequest = (r: Request) => isAsk(new URL(r.url()));
export const isHealth = (url: URL) => url.pathname === "/api/healthz";
export const healthy = { status: "ok", mode: "normal", db: "ok" };

/** POST /api/v1/ask answers with this stream body. */
export async function serveStream(page: Page, body: string) {
  await page.route(isAsk, (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body }));
}

/** POST /api/v1/ask answers with a gate refusal: the catalog body, and these headers. */
export async function serveError(page: Page, status: number, code: string, headers: Record<string, string> = {}) {
  await page.route(isAsk, (route) => route.fulfill({
    status, headers, json: { error: { code, message: code, trace_id: "5d1c2b9a-8d4e-4f6a-b2c1-9e7d5a3b1c0f" } },
  }));
}

// Cloudflare's Turnstile script, replaced by a stub: the tests never reach Cloudflare. Like the real widget, a
// challenge after a reset hands out a new token (`stub-token-1`, `stub-token-2`…), and one without a reset
// hands out the same token again. With `window.__turnstile = "error"` set before the page loads, every
// challenge fails instead.
const TURNSTILE_STUB = `
window.turnstile = (() => {
  let n = 0, opts = null, fresh = true;
  return {
    render(el, o) { opts = o; return "widget"; },
    execute() {
      setTimeout(() => {
        if (window.__turnstile === "error") return opts["error-callback"]();
        if (fresh) { n++; fresh = false; }
        opts.callback("stub-token-" + n);
      });
    },
    reset() { fresh = true; },
  };
})();`;
export const isTurnstile = (url: URL) => url.hostname === "challenges.cloudflare.com";
export async function serveTurnstile(page: Page) {
  await page.route(isTurnstile, (route) => route.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB }));
}

/** GET /api/healthz answers with this status and body. */
export async function serveHealth(page: Page, status: number, body: object) {
  await page.route(isHealth, (route) => route.fulfill({ status, json: body }));
}

export async function serveFixture(page: Page) {
  await page.route((url) => url.pathname.startsWith("/data/"), (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/data\//, "");
    return route.fulfill({ path: path.join(DATA, rel) });
  });
}

/** A browser without WebGL: every canvas refuses a WebGL context. */
export async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return /webgl/.test(kind) ? null : (original as any).call(this, kind, ...rest);
    } as typeof original;
  });
}

export async function askQuestion(page: Page, question: string) {
  await page.locator("#q").fill(question);
  await page.locator("#q").press("Enter");
}

// Every test starts with the published fixture data, a healthy API, the Turnstile stub and the stream with
// passages; a test
// overrides a route by adding its own (the last route added answers first).
export const test = base.extend<{ fixtureData: void }>({
  fixtureData: [async ({ page }, use) => {
    await serveFixture(page);
    await serveHealth(page, 200, healthy);
    await serveTurnstile(page);
    await serveStream(page, stream("passages"));
    await use();
  }, { auto: true }],
});
export { expect };
