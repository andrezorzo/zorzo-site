import { expect, test } from "./fixtures";

// The free-tier notice: visible under the box before a question is sent, with the providers named in the footer.

const shown = { useInnerText: true };   // innerText skips the other language's hidden span

test("the free-tier notice shows under the box and names the providers in the footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#askPrivacy")).toBeVisible();
  await expect(page.locator("#askPrivacy")).toHaveText(/^\s*Answers run on free AI tiers: your questions may be used to train models/, shown);
  await expect(page.locator("#footPrivacy")).toContainText("OpenRouter, Groq, NVIDIA and Google", shown);
  await expect(page.locator("#q")).toHaveAttribute("aria-describedby", "askPrivacy");
  await page.getByRole("button", { name: "PT", exact: true }).click();
  await expect(page.locator("#askPrivacy")).toHaveText(/^\s*Respostas via free tiers de IA: suas perguntas podem ser usadas/, shown);
  await expect(page.locator("#footPrivacy")).toContainText("OpenRouter, Groq, NVIDIA e Google", shown);
});

test("on a phone the notice takes the room of two example questions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#stage")).toHaveClass(/ready/);
  await expect(page.locator("#askExamples li").first()).toBeVisible();
  await expect(page.locator("#askExamples li:visible")).toHaveCount(3);
  await expect(page.locator("#askPrivacy")).toBeVisible();
});
