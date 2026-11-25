import { askQuestion, corpus, examples, expect, manifest, serveStream, stream, test } from "./fixtures";

// AC4: the page reads the data the ingest publishes, through the manifest, and shows the example questions of
// the interface language.

test("reads the published data through the manifest", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  const order = (p: string) => requested.indexOf(p);
  expect(order("/data/manifest.json")).toBeGreaterThanOrEqual(0);
  expect(order(`/${manifest.path}corpus.json`)).toBeGreaterThan(order("/data/manifest.json"));
  expect(order(`/${manifest.path}examples.json`)).toBeGreaterThan(order("/data/manifest.json"));
  expect(requested.some((p) => p.startsWith("/demo-data/"))).toBe(false);

  const verification = corpus.chunks.find((c: { heading: string }) => c.heading.endsWith("Verification"));
  await askQuestion(page, "How does the site check its answers against sources?");
  await expect(page.locator("#ansSources")).toContainText(verification.title);
});

test.describe("in Portuguese", () => {
  test.use({ locale: "pt-BR" });
  test("shows the example questions of the interface language", async ({ page }) => {
    await serveStream(page, stream("no-passages"));
    const textsIn = (lang: string) => examples.filter((e) => e.lang === lang).map((e) => e.text);
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    await expect(page.locator("#askExamples button")).toHaveText(textsIn("pt"));
    expect(textsIn("pt")).toContain(await page.locator("#q").getAttribute("placeholder"));

    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("#askExamples button")).toHaveText(textsIn("en"));
    expect(textsIn("en")).toContain(await page.locator("#q").getAttribute("placeholder"));

    await askQuestion(page, "zyxwvut qqqq");
    await expect(page.locator("#answer .ans-examples button")).toHaveText(textsIn("en"));
    await expect(page.locator("#askExamples")).toBeHidden();   // the list under the box makes way for the answer
  });
});

test("keeps the question box when the published data fails", async ({ page }) => {
  await page.route((url) => url.pathname === "/data/manifest.json", (route) => route.fulfill({ status: 500 }));
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which cloud services does he use?");
  // the page has no corpus, so the passages show by the titles the stream sends, with no text or link
  await expect(page.locator("#ansSources li")).toHaveCount(6);
  await expect(page.locator("#ansSources li").first()).toContainText("FAQ");
  await expect(page.locator("#ansSources a.src-link")).toHaveCount(0);
});
