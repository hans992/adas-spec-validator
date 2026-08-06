const { defineConfig, devices } = require("@playwright/test");

/**
 * Beta QA browser matrix:
 * - chromium: full E2E suite
 * - firefox / webkit: tagged smoke only
 * - mobile-chrome: responsive smoke
 */
module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      grep: /@smoke/
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grep: /@smoke/
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      grep: /@mobile|@smoke/
    }
  ],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
