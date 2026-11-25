import { askQuestion, expect, healthy, isAsk, isHealth, serveHealth, test } from "./fixtures";

// AC4: GET /api/healthz drives the online, degraded and offline states (zorzo-api LLD "Front against the API",
// "Health"); offline disables the box and recovers by itself every HEALTH_POLL_INTERVAL (30 s).

const down = { status: "down", mode: "unknown", db: "down" };

test("goes offline and recovers by itself", async ({ page }) => {
  await page.clock.install();
  await serveHealth(page, 503, down);
  await page.goto("/");
  await expect(page.locator("#q")).toBeDisabled();
  await expect(page.locator("#askNote")).toHaveText("The backend is unreachable. The box comes back by itself when it returns.");
  await expect(page.locator("#askExamples")).toBeHidden();

  await serveHealth(page, 200, healthy);
  await page.clock.runFor(29_000);
  await expect(page.locator("#q")).toBeDisabled();   // not before the interval
  await page.clock.runFor(1_500);
  await expect(page.locator("#q")).toBeEnabled();
  await expect(page.locator("#askNote")).toBeHidden();
  await expect(page.locator("#askExamples")).toBeVisible();
});

test("shows the degraded notice from health", async ({ page }) => {
  await serveHealth(page, 200, { ...healthy, mode: "degraded" });
  await page.goto("/");
  await expect(page.locator("#askNote")).toHaveText("Search-only mode: answers show the source passages, with no AI-written text.");
  await expect(page.locator("#q")).toBeEnabled();
});

test("a failed request goes offline", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await expect(page.locator("#q")).toBeEnabled();
  await page.route(isAsk, (route) => route.abort("connectionrefused"));
  await serveHealth(page, 503, down);
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#q")).toBeDisabled();
  await expect(page.locator("#ansText")).toHaveText("The backend is unreachable. The box comes back by itself when it returns.");
});

for (const status of [502, 503, 504]) {   // 503 from the API; 502 and 504 from the edge when the API is down
  test(`an unavailable API (${status}) goes offline`, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    await page.route(isAsk, (route) => route.fulfill({ status, body: "" }));
    await askQuestion(page, "Which cloud services does he use?");
    await expect(page.locator("#q")).toBeDisabled();
  });
}

test("any other status shows the generic message and stays online", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await page.route(isAsk, (route) => route.fulfill({ status: 500, body: "" }));
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansText")).toHaveText("Something went wrong. Ask again.");
  await expect(page.locator("#q")).toBeEnabled();
});

// A question's outcome is fresher than a health check already in flight: the check after it decides.
test.describe("a question's outcome beats an older health check", () => {
  /** Holds the first /api/healthz until `release` is called with its answer; later checks get `after`. */
  async function holdFirstHealth(page: import("@playwright/test").Page, after: { status: number; body: object }) {
    let release!: (answer: { status: number; body: object }) => void;
    const first = new Promise<{ status: number; body: object }>((resolve) => { release = resolve; });
    let calls = 0;
    await page.route(isHealth, async (route) => {
      const answer = calls++ === 0 ? await first : after;
      await route.fulfill({ status: answer.status, json: answer.body });
    });
    return release;
  }

  test("a stream keeps the page online after an old check says offline", async ({ page }) => {
    const release = await holdFirstHealth(page, { status: 200, body: { ...healthy, mode: "degraded" } });
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    await askQuestion(page, "Which cloud services does he use?");
    await expect(page.locator("#ansSources .src")).toHaveCount(6);
    release({ status: 503, body: down });
    // the check after the stream says degraded: the box stays usable, with the search-only notice
    await expect(page.locator("#askNote")).toHaveText(/Search-only mode/);
    await expect(page.locator("#q")).toBeEnabled();
  });

  test("a failed question keeps the page offline after an old check says online", async ({ page }) => {
    const release = await holdFirstHealth(page, { status: 503, body: down });
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    await page.route(isAsk, (route) => route.abort("connectionrefused"));
    await askQuestion(page, "Which cloud services does he use?");
    await expect(page.locator("#q")).toBeDisabled();
    // from now on, record whether the box ever comes back: the old check's "online" must never reach the page
    await page.evaluate(() => {
      const q = document.getElementById("q") as HTMLInputElement;
      new MutationObserver(() => { if (!q.disabled) document.body.dataset.reopened = "yes"; }).observe(q, { attributes: true });
    });
    const recheck = page.waitForResponse((r) => isHealth(new URL(r.url())) && r.status() === 503);
    release({ status: 200, body: healthy });
    await recheck;   // the old check said online; the one after the failure says offline, and decides
    await expect(page.locator("#q")).toBeDisabled();
    expect(await page.evaluate(() => document.body.dataset.reopened)).toBeUndefined();
    await expect(page.locator("#askNote")).toHaveText(/unreachable/);
  });
});
