import { askQuestion, expect, healthy, isAsk, serveHealth, test } from "./fixtures";

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

test("an unavailable API (503) goes offline", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await page.route(isAsk, (route) => route.fulfill({ status: 503, json: { error: { code: "unavailable" } } }));
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#q")).toBeDisabled();
});
