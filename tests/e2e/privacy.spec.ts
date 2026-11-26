import { expect, test } from "./fixtures";

// The free-tier notice: visible under the box before a question is sent, with the providers named in the footer.

test("the free-tier notice shows under the box and names the providers in the footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#askPrivacy")).toBeVisible();
  await expect(page.locator("#askPrivacy")).toContainText(/train models|treinar modelos/);
  await expect(page.locator("#footPrivacy")).toContainText(/OpenRouter, Groq, NVIDIA (and|e) Google/);
  await page.getByRole("button", { name: "PT", exact: true }).click();
  await expect(page.locator("#askPrivacy")).toHaveText(/^\s*Respostas via free tiers de IA/, { useInnerText: true });
});
