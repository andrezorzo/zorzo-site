import { askQuestion, expect, serveStream, stream, test, type Page } from "./fixtures";

// F01-T06 AC7: the draft, marked as being checked, replaced by the checked claims with their citations
// (zorzo-api LLD "Front against the API").

async function ask(page: Page, name: "answer" | "abstained" | "declined") {
  await serveStream(page, stream(name));
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await askQuestion(page, "Which AWS services has he used?");
}

test("the draft shows marked as being checked", async ({ page }) => {
  await serveStream(page, stream("answer"));
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  // the whole stream arrives at once, so the draft is caught as it is drawn, before the claims replace it
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as any).__drafts = seen;
    const text = document.getElementById("ansText")!;
    new MutationObserver(() => {
      const mark = document.querySelector(".ans-checking");
      if (text.classList.contains("draft") && mark) seen.push(`${mark.textContent}|${text.textContent}`);
    }).observe(text, { childList: true, characterData: true, subtree: true, attributes: true });
  });
  await askQuestion(page, "Which AWS services has he used?");
  await expect(page.locator("#ansText .claim")).toHaveCount(4);
  const drafts: string[] = await page.evaluate(() => (window as any).__drafts);
  expect(drafts.length).toBeGreaterThan(0);
  expect(drafts.at(-1)).toMatch(/^(checking against sources…|conferindo nas fontes…)\|On AWS, André has used Lambda.* He holds every AWS certification\.$/);
});

test("the draft is replaced by checked claims", async ({ page }) => {
  await ask(page, "answer");
  const text = page.locator("#ansText");
  await expect(text.locator(".claim")).toHaveCount(4);
  await expect(text).not.toHaveClass(/draft/);
  await expect(page.locator(".ans-checking")).toHaveCount(0);
  await expect(text.locator(".claim.supported")).toContainText("On AWS, André has used Lambda");
  await expect(text.locator(".claim.partial")).toContainText("He built pipelines that process millions");
  await expect(text.locator(".cite")).toHaveText(["[1]", "[1]", "[2]"]);   // numbered by first use
  await expect(text.locator(".claim.gap")).toHaveText("His certifications are not in my sources.");
  await expect(text.locator(".claim.gap .cite")).toHaveCount(0);
});

test("an unsupported claim is struck through", async ({ page }) => {
  await ask(page, "answer");
  const removed = page.locator("#ansText .claim.unsupported");
  await expect(removed.locator("s")).toHaveText("He holds every AWS certification.");
  await expect(removed).toContainText(/removed: not supported by the sources|removido: as fontes não sustentam/);
  await expect(removed.locator(".cite")).toHaveCount(0);
});

test("a citation opens its passage", async ({ page }) => {
  await ask(page, "answer");
  await expect(page.locator("#ansSources li")).toHaveCount(2);   // the cited sources only
  await page.locator("#ansText .cite").nth(2).click();   // [2]: the Experience passage
  const open = page.locator("#ansSources li.is-open");
  await expect(open).toHaveCount(1);
  await expect(open).toContainText("[2] FAQ › Experience");
  await expect(open.locator(".src-text")).toContainText("André has more than twenty years of backend experience");
  await expect(open.locator(".src-link")).toHaveAttribute("href", "https://zorzo.dev.br/dash/sources#faq-en");
});

test("an abstention replaces the draft", async ({ page }) => {
  await ask(page, "abstained");
  const text = page.locator("#ansText");
  await expect(text).toHaveText(/Not in my sources|Não está nas minhas fontes/);
  await expect(text).not.toHaveClass(/draft/);
  await expect(page.locator("#ansSources .src")).toHaveCount(4);   // the passages found
  await expect(page.locator("#answer a[href='#contact']")).toHaveCount(1);
});

test("a decline shows its message", async ({ page }) => {
  await ask(page, "declined");
  await expect(page.locator("#ansText")).toHaveText(/outside what this site answers|fora do que este site responde/);
  await expect(page.locator("#answer a[href='#contact']")).toHaveCount(1);
  await expect(page.locator("#ansSources .src")).toHaveCount(0);
});
