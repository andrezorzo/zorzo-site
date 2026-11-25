import { askQuestion, expect, isAsk, isAskRequest, isTurnstile, serveError, stream, test } from "./fixtures";

// The page against the gate's refusals and the bot check (zorzo-api LLD "Front against the API").

test("says what to fix on 422", async ({ page }) => {
  await serveError(page, 422, "invalid_input");
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  const message = page.locator("#askError");
  await expect(message).toHaveText("This question can't be sent. Write it as plain text, within the length limit.");
  await expect(page.locator("#answer")).toBeHidden();
  await page.locator("#q").pressSequentially("x");
  await expect(message).toBeHidden();   // typing clears it
});

test("retries the bot check once on 403", async ({ page }) => {
  const tokens: string[] = [];
  await page.route(isAsk, (route) => {
    tokens.push(route.request().postDataJSON().turnstile);
    return tokens.length === 1
      ? route.fulfill({ status: 403, json: { error: { code: "bot_check_failed", message: "", trace_id: "x" } } })
      : route.fulfill({ status: 200, contentType: "text/event-stream", body: stream("passages") });
  });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansSources .src")).toHaveCount(6);
  expect(tokens).toHaveLength(2);
  expect(tokens[1]).not.toBe(tokens[0]);   // a new token for the second try
});

test("gives up after a second 403", async ({ page }) => {
  let requests = 0;
  page.on("request", (r) => { if (isAskRequest(r)) requests++; });
  await serveError(page, 403, "bot_check_failed");
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansText")).toHaveText("The bot check failed. Reload the page and try again.");
  expect(requests).toBe(2);
});

test("says when to try again on 429", async ({ page }) => {
  await serveError(page, 429, "rate_limited", { "Retry-After": "300" });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansText")).toHaveText("Too many questions in a row. You can ask again in 5 minutes.");
});

test("says the bot check failed without a token", async ({ page }) => {
  let requests = 0;
  page.on("request", (r) => { if (isAskRequest(r)) requests++; });
  await page.addInitScript(() => { (window as any).__turnstile = "error"; });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansText")).toHaveText("The bot check failed. Reload the page and try again.");
  expect(requests).toBe(0);
});

test("says the bot check failed when the script can't load", async ({ page }) => {
  await page.route(isTurnstile, (route) => route.abort());   // blocked by an extension or the network
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansText")).toHaveText("The bot check failed. Reload the page and try again.");
});

test("sends a fresh token with each question", async ({ page }) => {
  const tokens: string[] = [];
  page.on("request", (r) => { if (isAskRequest(r)) tokens.push(r.postDataJSON().turnstile); });
  let scriptLoads = 0;
  page.on("request", (r) => { if (isTurnstile(new URL(r.url()))) scriptLoads++; });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  expect(scriptLoads).toBe(0);   // nothing from Cloudflare until the visitor touches the box
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansSources .src")).toHaveCount(6);
  await askQuestion(page, "Has he led a migration?");
  await expect.poll(() => tokens.length).toBe(2);
  expect(new Set(tokens).size).toBe(2);
  expect(scriptLoads).toBe(1);
});

test("a second question while the first waits for its token gets the token", async ({ page }) => {
  // challenges answer only when the test releases them, after both questions are asked
  await page.addInitScript(() => { (window as any).__turnstile = "held"; });
  const sent: string[] = [];
  page.on("request", (r) => { if (isAskRequest(r)) sent.push(r.postDataJSON().q); });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  await askQuestion(page, "Has he led a migration?");
  await page.evaluate(() => (window as any).__releaseTurnstile());
  await expect(page.locator("#ansQ")).toHaveText("Has he led a migration?");
  await expect(page.locator("#ansSources .src")).toHaveCount(6);
  expect(sent).toEqual(["Has he led a migration?"]);   // the replaced question never went out
});
