const { expect, test } = require("@playwright/test");
const path = require("node:path");

test("uploads IFC, validates it, scores it and exports evidence", async ({ page }) => {
  await page.goto("/workspace");

  await page.getByLabel("Upload BIM model").setInputFiles(
    path.join(process.cwd(), "test/fixtures/minimal-building.ifc")
  );

  await expect(page.getByText("Active: minimal-building.ifc")).toBeVisible();
  await expect(page.getByTestId("ifc-diagnostics")).toContainText(
    "1 storeys · 1 spaces · 1 doors · 1 resolved boundaries"
  );
  await expect(page.getByTestId("pass-rate")).toHaveText("67%");
  await expect(page.getByTestId("evaluation-coverage")).toContainText("100%");
  await expect(page.getByText("4 specs checked")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-report").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const report = Buffer.concat(chunks).toString("utf8");

  expect(download.suggestedFilename()).toMatch(/^BIM-Compliance-Report-\d{5}\.md$/);
  expect(report).toContain("Requirement Pass Rate: 67% (2 Compliant / 1 Violated among determined requirements)");
  expect(report).toContain("Evaluation Coverage: 100% (3 Determined / 3 Applicable)");
  expect(report).toContain("Total Rooms Inspected: 1");
  expect(report).toContain("Total Access Doors Inspected: 1");
  expect(report).toContain("Affected Elements: ifc:space:3O2Fr$t4X7Zf8NOew3FLOH");
});

test("reviews and confirms a 100+ row XLSX as a session draft", async ({ page }) => {
  await page.goto("/workspace");
  await page.locator('input[type="file"][accept*=".xlsx"]').first().setInputFiles(
    path.join(process.cwd(), "test/fixtures/aec-building-requirements.xlsx")
  );

  await expect(page.getByText("XLSX specification import")).toBeVisible();
  await expect(page.getByLabel("Worksheet")).toHaveValue("Requirements");
  await expect(page.getByLabel("Header row")).toHaveValue("3");
  await page.getByRole("button", { name: "Build editable preview" }).click();

  await expect(page.getByRole("button", { name: "Confirm 120 requirements" })).toBeVisible();
  await page.getByRole("button", { name: /warning/i }).click();
  await page.getByLabel("Accept warnings").check();
  await page.getByRole("button", { name: "Confirm 120 requirements" }).click();

  await expect(page.getByText(/120 requirements confirmed/)).toBeVisible();
  await expect(page.getByText(/Session-only draft/)).toBeVisible();
});
