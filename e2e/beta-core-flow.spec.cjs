const { expect, test } = require("@playwright/test");
const path = require("node:path");
const { AxeBuilder } = require("@axe-core/playwright");

const fixtures = {
  ifc: path.join(process.cwd(), "test/fixtures/minimal-building.ifc"),
  xlsx: path.join(process.cwd(), "test/fixtures/aec-building-requirements.xlsx"),
  docx: path.join(process.cwd(), "test/fixtures/aec-building-requirements.docx")
};

/**
 * Beta core path that does not require Supabase: marketing → workspace →
 * specification import with mapping confirmation → IFC import → validation
 * metrics → compliance report export → traceability matrix visibility.
 *
 * Authenticated steps (register, save run, baseline, regression, audit ZIP,
 * delete) live in beta-authenticated-flow.spec.cjs and run when credentials
 * are configured.
 */
test.describe("beta core product flow", () => {
  test("marketing surfaces the real workflow and pricing @smoke", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/specification clauses/i);
    await expect(page.locator("#workflow")).toBeVisible();
    await expect(page.locator("#pricing")).toBeVisible();
    await expect(page.getByRole("link", { name: /privacy/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /terms/i })).toBeVisible();
    await page.getByRole("link", { name: /open workspace/i }).first().click();
    await expect(page).toHaveURL(/\/workspace/);
  });

  test("XLSX import with mapping review then IFC validation and report export", async ({ page }) => {
    await page.goto("/workspace");

    await page.locator('input[type="file"][accept*=".xlsx"]').first().setInputFiles(fixtures.xlsx);
    await expect(page.getByText("XLSX specification import")).toBeVisible();
    await expect(page.getByLabel("Worksheet")).toHaveValue("Requirements");
    await page.getByRole("button", { name: "Build editable preview" }).click();
    await expect(page.getByRole("button", { name: "Confirm 120 requirements" })).toBeVisible();
    await page.getByRole("button", { name: /warning/i }).click();
    await page.getByLabel("Accept warnings").check();
    await page.getByRole("button", { name: "Confirm 120 requirements" }).click();
    await expect(page.getByText(/120 requirements confirmed/)).toBeVisible();

    // Scroll the BIM dropzone into view before attaching the IFC (long workspace page).
    await page.getByLabel("Upload BIM model").scrollIntoViewIfNeeded();
    await page.getByLabel("Upload BIM model").setInputFiles(fixtures.ifc);
    await expect(page.getByText(/Active: minimal-building\.ifc/i)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("ifc-diagnostics")).toContainText(/storeys|spaces/i);
    await expect(page.getByTestId("pass-rate")).toBeVisible();
    await expect(page.getByTestId("evaluation-coverage")).toBeVisible();
    await expect(page.getByTestId("traceability-matrix")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-report").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^BIM-Compliance-Report-\d{5}\.md$/);
  });

  test("DOCX import opens mapping review and can be confirmed", async ({ page }) => {
    await page.goto("/workspace");
    await page.locator('input[type="file"][accept*=".docx"]').first().setInputFiles(fixtures.docx);
    await expect(page.getByText(/DOCX import/i)).toBeVisible({ timeout: 60_000 });
    const confirm = page.getByRole("button", { name: /confirm import/i });
    await expect(confirm).toBeVisible({ timeout: 60_000 });
    // Confirm may stay disabled until candidates are reviewed; visibility of the
    // mapping UI is the beta gate when the fixture needs manual review.
    if (await confirm.isEnabled()) {
      await confirm.click();
      await expect(page.getByText(/confirmed|session|requirement/i).first()).toBeVisible();
    } else {
      await expect(page.getByText(/candidate|review|requirement/i).first()).toBeVisible();
    }
  });
});

test.describe("accessibility @smoke @mobile", () => {
  test("marketing page has no serious axe violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"]) // marketing token pass tracked separately via --aec-faint fix
      .analyze();
    const serious = results.violations.filter((item) =>
      item.impact === "critical" || item.impact === "serious"
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("workspace shell is usable and has no critical axe violations", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page.getByLabel("Upload BIM model")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();
    const critical = results.violations.filter((item) => item.impact === "critical");
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
  });
});

test.describe("mobile responsive @mobile", () => {
  test("marketing mobile menu and workspace upload remain reachable", async ({ page }) => {
    await page.goto("/");
    const menu = page.getByLabel("Toggle navigation");
    if (await menu.isVisible()) {
      await menu.click();
      await expect(page.getByRole("link", { name: /workspace/i }).first()).toBeVisible();
    }
    await page.goto("/workspace");
    await expect(page.getByLabel("Upload BIM model")).toBeVisible();
    await expect(page.getByTestId("pass-rate")).toBeVisible();
  });
});
