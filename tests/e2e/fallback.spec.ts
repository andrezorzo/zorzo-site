import { askQuestion, expect, test, withoutWebGL } from "./fixtures";

// AC3: without 3D graphics (no WebGL, or reduced motion), asking and reading work the same and the brain is a
// still image (F01 PRD, story S11).

async function expectAskingWorks(page: import("@playwright/test").Page) {
  await expect(page.locator("#stage")).toHaveClass(/no-gl/);
  await expect(page.locator(".poster")).toBeVisible();
  await expect(page.locator("#q")).toBeVisible();
  await askQuestion(page, "Which cloud services does he use?");
  await expect(page.locator("#telemetry li").first()).toBeVisible();
  await expect(page.locator("#answer")).toBeVisible();
  await expect(page.locator("#ansSources .src").first()).toContainText("FAQ");
}

test("asks without WebGL", async ({ page }) => {
  await withoutWebGL(page);
  await page.goto("/");
  await expectAskingWorks(page);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("asks with reduced motion", async ({ page }) => {
    await page.goto("/");
    await expectAskingWorks(page);
    await expect(page.locator("#stage")).not.toHaveClass(/(^|\s)gl(\s|$)/);
  });
});

test.describe("when the GPU drops the brain", () => {
  test("falls back without 3D and keeps answering", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#stage")).toHaveClass(/(^|\s)gl(\s|$)/);
    await page.evaluate(() => {
      const canvas = document.getElementById("scene") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await expect(page.locator("#stage")).toHaveClass(/no-gl/);
    await expect(page.locator("#scene")).toBeHidden();
    await askQuestion(page, "Which cloud services does he use?");
    await expect(page.locator("#ansSources .src").first()).toContainText("FAQ");
    await expect(page.locator(".tok")).toHaveCount(0);
  });
});
