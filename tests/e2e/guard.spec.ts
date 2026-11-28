import { askQuestion, examples, expect, healthy, isAskRequest, serveHealth, serveStream, stream, test, type Page } from "./fixtures";

// F01-T08 AC5: the block with its layer and reason, the suggestion, and the contact links after every reply
// (zorzo-api LLD "Front against the API").

const CONTACT = [
  { label: "LinkedIn", href: "https://www.linkedin.com/in/andrezorzo" },
  { label: "GitHub", href: "https://github.com/andrezorzo" },
  { label: "Email", href: "mailto:andre_zorzo@yahoo.com" },
];

async function ask(page: Page, name: Parameters<typeof stream>[0]) {
  await serveStream(page, stream(name));
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which AWS services has he used?");
}

async function expectContactLinks(page: Page) {
  const links = page.locator("#answer .ans-contact a");
  await expect(links).toHaveText(CONTACT.map((c) => c.label));
  for (const [i, c] of CONTACT.entries()) await expect(links.nth(i)).toHaveAttribute("href", c.href);
}

test("a block names its layer and reason", async ({ page }) => {
  await ask(page, "blocked");
  const text = page.locator("#ansText");
  await expect(text).toHaveText(/(layer|camada) L2/);
  await expect(text).toHaveText(/attempt to change the agent's rules|tentativa de mudar as regras/);
  await expect(text).toHaveClass(/warn/);
  await expect(page.locator("#answer a[href='/dash/defenses']")).toHaveCount(1);
  await expect(page.locator("#answer a[href='#contact']")).toHaveCount(1);   // "this was a mistake?"
  await expect(page.locator("#ansSources .src")).toHaveCount(0);
});

test("a block at the output removes the draft", async ({ page }) => {
  await ask(page, "blocked-output");
  const text = page.locator("#ansText");
  await expect(text).toHaveText(/(layer|camada) L5/);
  await expect(text).not.toHaveClass(/draft/);
  await expect(text).not.toContainText("serverless pipelines");   // what had been drawn is gone
  await expect(page.locator(".ans-checking")).toHaveCount(0);
});

test("a suggestion asks its question", async ({ page }) => {
  await ask(page, "abstained");
  const example = examples.find((e) => e.id === "en-site")!;
  const suggestion = page.locator("#answer .ans-suggest");
  await expect(suggestion).toHaveText(example.text);
  const request = page.waitForRequest((r) => r.url().endsWith("/api/v1/ask"));
  await suggestion.click();
  expect((await request).postDataJSON().q).toBe(example.text);
});

test("a decline suggests too, and an answer does not", async ({ page }) => {
  await ask(page, "declined");
  await expect(page.locator("#answer .ans-suggest")).toHaveText(examples.find((e) => e.id === "en-aws")!.text);
  await ask(page, "answer");
  await expect(page.locator("#ansText .claim").first()).toBeVisible();
  await expect(page.locator("#answer .ans-suggest")).toHaveCount(0);
});

for (const name of ["answer", "abstained", "declined", "passages"] as const) {
  test(`contact links follow every reply: ${name}`, async ({ page }) => {
    await ask(page, name);
    await expect(page.locator("#answer")).toBeVisible();
    await expectContactLinks(page);
  });
}

test("the contact intent shows the links", async ({ page }) => {
  await ask(page, "contact");
  await expect(page.locator("#ansText")).toHaveText(/To reach André|Para falar com o André/);
  await expect(page.locator("#ansText .claim")).toHaveCount(0);
  await expectContactLinks(page);
});

test("a done without contact options falls back to the contact section", async ({ page }) => {
  const body = stream("declined").replace(/,"contact":\[.*\]\}/, "}");
  await serveStream(page, body);
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which AWS services has he used?");
  await expect(page.locator("#answer .ans-contact a")).toHaveAttribute("href", "#contact");
});

test("a suggestion is hidden and inert once the API goes offline", async ({ page }) => {
  await serveHealth(page, 200, { ...healthy, mode: "degraded" });
  await ask(page, "abstained");
  const suggestion = page.locator("#answer .ans-suggest");
  await expect(suggestion).toBeVisible();
  // the stream reached the API while search-only, so health is checked again, and now says down
  await serveHealth(page, 503, { status: "down", mode: "unknown", db: "down" });
  await askQuestion(page, "Which AWS services has he used?");
  await expect(page.locator("#q")).toBeDisabled();
  await expect(page.locator("#answer .ans-suggest")).toBeHidden();
  const requests: string[] = [];
  page.on("request", (r) => { if (isAskRequest(r)) requests.push(r.url()); });
  await page.locator("#answer .ans-suggest").click({ force: true });
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
});

test("an answered outcome with no claims after a draft is not the contact reply", async ({ page }) => {
  const draft = [
    'event: token\ndata: {"text":"On AWS, he used Lambda."}\n\n',
    'event: usage\ndata: {"tokens_in":310,"tokens_out":40,"cost_usd":0.0,"latency_ms":520}\n\n',
    'event: done\ndata: {"trace_id":"0c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f","outcome":"answered","cached":false,"suggestion":null,"contact":[]}\n\n',
  ].join("");
  await serveStream(page, draft);
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which AWS services has he used?");
  await expect(page.locator("#ansSources")).toBeAttached();
  await expect(page.locator("#answer .ans-contact")).toHaveCount(1);
  await expect(page.locator("#ansText")).not.toContainText(/To reach André|Para falar com o André/);
});
