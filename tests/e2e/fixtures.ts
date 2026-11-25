import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// The published data of the fixture corpus, produced by the real ingest of zorzo-api's tests/fixtures/corpus
// with the fake embedder. Requests to data/ are answered from it, as the bucket would.
const DATA = path.join(__dirname, "..", "fixtures", "data");
export const manifest = JSON.parse(readFileSync(path.join(DATA, "manifest.json"), "utf8"));
const folder = path.join(DATA, manifest.path.replace(/^data\//, ""));
export const corpus = JSON.parse(readFileSync(path.join(folder, "corpus.json"), "utf8"));
export const examples: { id: string; lang: string; text: string }[] = JSON.parse(readFileSync(path.join(folder, "examples.json"), "utf8"));

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

export const test = base.extend<{ fixtureData: void }>({
  fixtureData: [async ({ page }, use) => { await serveFixture(page); await use(); }, { auto: true }],
});
export { expect };
