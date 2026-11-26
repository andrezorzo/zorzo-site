import { expect, test } from "./fixtures";

// The free-tier notice: visible under the box before a question is sent, with the providers named in the footer.

const shown = { useInnerText: true };   // innerText skips the other language's hidden span

test.use({ locale: "en-US" });   // the page starts in the browser's language

test("the free-tier notice shows under the box and names the providers in the footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#askPrivacy")).toBeVisible();
  await expect(page.locator("#askPrivacy")).toHaveText(/^\s*Answers run mostly on free AI tiers: your questions may be used to train models/, shown);
  await expect(page.locator("#footPrivacy")).toContainText("OpenRouter, Groq, NVIDIA and Google", shown);
  await expect(page.locator("#q")).toHaveAttribute("aria-describedby", "askPrivacy");
  await page.getByRole("button", { name: "PT", exact: true }).click();
  await expect(page.locator("#askPrivacy")).toHaveText(/^\s*Respostas usam sobretudo free tiers de IA: suas perguntas podem ser usadas/, shown);
  await expect(page.locator("#footPrivacy")).toContainText("OpenRouter, Groq, NVIDIA e Google", shown);
});

// In portrait the intro is placed from the top and the box from the bottom, so a taller stack could push the box
// onto it; in landscape both move together with the stack's height.
for (const [name, viewport] of [["portrait phone", { width: 390, height: 844 }], ["landscape phone", { width: 844, height: 390 }]] as const) {
  test(`on a ${name} the notice fits: three examples, and in portrait the box clear of the intro`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/ready/);
    await expect(page.locator("#askExamples li").first()).toBeVisible();
    await expect(page.locator("#askExamples li:visible")).toHaveCount(3);
    await expect(page.locator("#askPrivacy")).toBeVisible();
    if (viewport.width > viewport.height) return;
    const role = await page.locator("#role").boundingBox();
    const ask = await page.locator("#ask").boundingBox();
    expect(ask!.y).toBeGreaterThanOrEqual(role!.y + role!.height);
  });
}
