import { defineConfig, devices } from "@playwright/test";

// The site is static files, served by tools/serve.py; the tests answer data/ requests with the fixture
// published by the real ingest (tests/fixtures/data) and /api/ requests with recorded streams, so no backend runs.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: { command: "python3 tools/serve.py 4173", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
  // software WebGL (SwiftShader), so the brain runs in headless CI too and the tests cover it
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } } }],
});
