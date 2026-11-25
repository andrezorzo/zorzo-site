import { askQuestion, examples, expect, isAsk, isAskRequest, serveStream, stream, test } from "./fixtures";

// The question box against POST /api/v1/ask, read as a stream (zorzo-api LLD "Front against the API").

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("asks the API and reads the stream", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  const request = page.waitForRequest(isAskRequest);
  await askQuestion(page, "Which cloud services does he use?");
  const sent = await request;
  expect(sent.method()).toBe("POST");
  const body = sent.postDataJSON();
  expect(body.q).toBe("Which cloud services does he use?");
  expect(body.session).toMatch(UUID);
  expect(body.turnstile).toBe("stub-token-1");   // from the Turnstile stub (fixtures.ts)
  await expect(page.locator("#telemetry")).toContainText("rerank");
  await expect(page.locator("#ansSources .src")).toHaveCount(6);
});

test("a new question cancels the current one", async ({ page }) => {
  let first = true;
  await page.route(isAsk, (route) => {
    if (first) { first = false; return; }   // the first stream never answers: it stays open
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: stream("no-passages") });
  });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  const aborted = page.waitForEvent("requestfailed", isAskRequest);
  const sent = page.waitForRequest(isAskRequest);
  await askQuestion(page, "Which cloud services does he use?");
  await sent;
  await askQuestion(page, "zebra quantum lasagna");
  expect((await aborted).postDataJSON().q).toBe("Which cloud services does he use?");
  await expect(page.locator("#ansQ")).toHaveText("zebra quantum lasagna");
  await expect(page.locator("#ansText")).toContainText(/No matching sources|Nenhuma fonte/);
  await expect(page.locator("#ansSources .src")).toHaveCount(0);
});

test("keeps the conversation id across a reload", async ({ page }) => {
  const sessions: string[] = [];
  page.on("request", (r) => { if (isAskRequest(r)) sessions.push(r.postDataJSON().session); });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);   // none before the first question
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#ansSources .src")).toHaveCount(6);
  expect(sessions[0]).toMatch(UUID);
  expect(await page.evaluate(() => Object.values(sessionStorage))).toEqual([sessions[0]]);
  await page.reload();
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Has he led a migration?");
  await expect.poll(() => sessions.length).toBe(2);
  expect(sessions[1]).toBe(sessions[0]);
});

test("shows the passages of a search-only answer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "backend AWS remote business hours events queues hybrid search citation");
  await expect(page.locator("#ansText")).toHaveText("Search-only mode: these are the source passages that best match the question.");
  const passages = page.locator("#ansSources li");
  await expect(passages).toHaveCount(6);   // DEGRADED_MAX_PASSAGES, all the stream sent
  // the stream's order: chunks 1, 3, 2 (the FAQ, linked to its source), then 6, 5, 7 (no source link)
  await expect(passages.locator(".src-top > span:first-child")).toHaveText([
    /^\[1\] FAQ/, /^\[2\] FAQ/, /^\[3\] FAQ/, /^\[4\] How this site works/, /^\[5\] Narrativa de carreira/, /^\[6\] How this site works/,
  ]);
  await expect(passages.locator("a.src-link")).toHaveCount(3);
  await expect(passages.first().locator("a.src-link")).toHaveAttribute("href", "https://zorzo.dev.br/dash/sources#faq-en");
});

test("shows the examples when nothing matches", async ({ page }) => {
  await serveStream(page, stream("no-passages"));
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "zebra quantum lasagna");
  await expect(page.locator("#ansText")).toHaveText("No matching sources for this question.");
  await expect(page.locator("#answer .ans-examples button")).toHaveText(examples.filter((e) => e.lang === "en").map((e) => e.text));
  await expect(page.locator("#ansSources li")).toHaveCount(0);
});

test("clicking an example asks it", async ({ page }) => {
  const example = examples.find((e) => e.lang === "en")!;
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  const request = page.waitForRequest(isAskRequest);
  await page.locator("#askExamples button", { hasText: example.text }).click();
  expect((await request).postDataJSON().q).toBe(example.text);
  await expect(page.locator("#q")).toHaveValue(example.text);
  await expect(page.locator("#ansQ")).toHaveText(example.text);
});

test.describe("says when the stream fails", () => {
  test("an error event shows the generic message with the trace link", async ({ page }) => {
    await serveStream(page, stream("error"));
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    await askQuestion(page, "Which cloud services does he use?");
    await expect(page.locator("#ansText")).toHaveText("Something went wrong. Ask again.");
    await expect(page.getByRole("link", { name: "See the trace of this question" })).toHaveAttribute("href", "/dash/t/3f1c2b9a-8d4e-4f6a-b2c1-9e7d5a3b1c0f");
  });

  test("a stream cut before done says the connection dropped", async ({ page }) => {
    const full = stream("passages");
    await serveStream(page, full.slice(0, full.indexOf("event: done")));
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    await askQuestion(page, "Which cloud services does he use?");
    await expect(page.locator("#ansText")).toHaveText("The connection dropped before the end. Ask again.");
    await expect(page.locator("#q")).toBeEnabled();
  });
});
