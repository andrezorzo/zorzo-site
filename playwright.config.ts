import { defineConfig, devices } from "@playwright/test";

// The site is static files: the tests serve the repository root and answer data/ requests with the fixture
// published by the real ingest (tests/fixtures/data), so no backend runs.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: { command: "python3 -m http.server 4173 --bind 127.0.0.1", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
