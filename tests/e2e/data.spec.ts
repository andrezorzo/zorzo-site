import { askQuestion, corpus, examples, expect, manifest, test } from "./fixtures";

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
    const textsIn = (lang: string) => examples.filter((e) => e.lang === lang).map((e) => e.text);
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    expect(textsIn("pt")).toContain(await page.locator("#q").getAttribute("placeholder"));

    await page.getByRole("button", { name: "EN", exact: true }).click();
    expect(textsIn("en")).toContain(await page.locator("#q").getAttribute("placeholder"));

    await askQuestion(page, "zyxwvut qqqq");
    await expect(page.locator(".ans-examples button")).toHaveText(textsIn("en"));
  });
});
