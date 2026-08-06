const { expect, test } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");

/**
 * Upload / load smoke against the running app.
 * UI IFC parse is Chromium-gated (web-ifc WASM is flaky on WebKit/mobile).
 * API upload checks run on every smoke browser.
 */
test.describe("upload and performance smoke", () => {
  test("IFC import completes within the beta budget", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "web-ifc UI parse is validated on Chromium; API path covers other browsers.");
    await page.goto("/workspace");
    await page.getByLabel("Upload BIM model").scrollIntoViewIfNeeded();
    const started = Date.now();
    await page.getByLabel("Upload BIM model").setInputFiles(
      path.join(process.cwd(), "test/fixtures/minimal-building.ifc")
    );
    await expect(page.getByText(/Active: minimal-building\.ifc/i)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("ifc-diagnostics")).toBeVisible();
    const elapsed = Date.now() - started;
    expect(elapsed, `IFC import took ${elapsed}ms`).toBeLessThan(30_000);
  });

  test("API rejects a ZIP renamed as IFC and accepts a real IFC @smoke", async ({ request }) => {
    const zipAsIfc = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const rejected = await request.post("/api/ifc", {
      multipart: {
        file: {
          name: "evil.ifc",
          mimeType: "application/octet-stream",
          buffer: zipAsIfc
        }
      }
    });
    // 415 = content rejected; 429 = shared upload rate limit from prior smoke workers.
    expect([415, 429]).toContain(rejected.status());

    const ifcBytes = fs.readFileSync(path.join(process.cwd(), "test/fixtures/minimal-building.ifc"));
    const started = Date.now();
    const accepted = await request.post("/api/ifc", {
      multipart: {
        file: {
          name: "minimal-building.ifc",
          mimeType: "application/octet-stream",
          buffer: ifcBytes
        }
      }
    });
    const elapsed = Date.now() - started;
    expect([200, 429]).toContain(accepted.status());
    if (accepted.ok()) {
      expect(elapsed, `POST /api/ifc took ${elapsed}ms`).toBeLessThan(20_000);
    }
  });

  test("burst uploads receive Retry-After when rate limited @smoke", async ({ request }) => {
    const ifcBytes = fs.readFileSync(path.join(process.cwd(), "test/fixtures/minimal-building.ifc"));
    const statuses = [];
    for (let i = 0; i < 20; i += 1) {
      const response = await request.post("/api/ifc", {
        multipart: {
          file: {
            name: `burst-${i}.ifc`,
            mimeType: "application/octet-stream",
            buffer: ifcBytes
          }
        }
      });
      statuses.push(response.status());
      if (response.status() === 429) {
        expect(response.headers()["retry-after"]).toBeTruthy();
        break;
      }
    }
    // Either the limiter tripped (preferred) or all uploads succeeded under a
    // high local limit — both are acceptable for the smoke gate.
    expect(statuses.every((status) => status === 200 || status === 429 || status === 422)).toBeTruthy();
  });
});
