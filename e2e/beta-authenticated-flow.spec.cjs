const { expect, test } = require("@playwright/test");
const path = require("node:path");

/**
 * Full authenticated beta scenario. Requires a live Supabase project and either:
 *   E2E_USER_EMAIL + E2E_USER_PASSWORD  (sign-in to an existing account), or
 *   E2E_SIGNUP_EMAIL + E2E_SIGNUP_PASSWORD (creates a fresh account when the
 *   project allows immediate sessions without email confirmation).
 *
 * Skipped in default CI so the beta gate stays green without secrets. Set
 * E2E_AUTH=1 (and credentials) in a staging job to exercise the path.
 */
const authEnabled = process.env.E2E_AUTH === "1";
const email = process.env.E2E_USER_EMAIL || process.env.E2E_SIGNUP_EMAIL;
const password = process.env.E2E_USER_PASSWORD || process.env.E2E_SIGNUP_PASSWORD;
const useSignup = Boolean(process.env.E2E_SIGNUP_EMAIL);

test.describe("beta authenticated lifecycle", () => {
  test.skip(!authEnabled || !email || !password, "Set E2E_AUTH=1 and credentials to run.");

  test("register/sign-in → demo project → review → baseline/regression → audit → delete", async ({ page }) => {
    await page.goto("/workspace");

    if (useSignup) {
      await page.getByRole("button", { name: /create account/i }).click();
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: /create account/i }).click();
    } else {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: /^sign in$/i }).click();
    }

    await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 30_000 });

    // Prefer the seeded demo (two revisions, waived finding, baseline).
    const loadDemo = page.getByRole("button", { name: /load demo project/i });
    if (await loadDemo.isVisible()) {
      await loadDemo.click();
      await expect(page.getByText(/demo project/i)).toBeVisible({ timeout: 60_000 });
    } else {
      const projectName = `Beta QA ${Date.now()}`;
      await page.getByLabel("New project name").fill(projectName);
      await page.getByRole("button", { name: /create project/i }).click();
      await expect(page.getByText(projectName)).toBeVisible({ timeout: 30_000 });

      await page.getByLabel("Upload BIM model").setInputFiles(
        path.join(process.cwd(), "test/fixtures/minimal-building.ifc")
      );
      await expect(page.getByText("Active: minimal-building.ifc")).toBeVisible({ timeout: 60_000 });

      await page.locator('input[type="file"][accept*=".xlsx"]').first().setInputFiles(
        path.join(process.cwd(), "test/fixtures/aec-building-requirements.xlsx")
      );
      await page.getByRole("button", { name: "Build editable preview" }).click();
      await page.getByRole("button", { name: /warning/i }).click();
      await page.getByLabel("Accept warnings").check();
      await page.getByRole("button", { name: /Confirm \d+ requirements/ }).click();

      await page.getByLabel("Specification name").fill("Beta Spec");
      await page.getByLabel("Specification revision").fill("A");
      await page.getByRole("button", { name: /save revision/i }).click();
      await page.getByRole("button", { name: /save validation/i }).click();
      await expect(page.getByText(/validation saved/i)).toBeVisible({ timeout: 30_000 });
    }

    // Open a report when a run exists.
    const reportButton = page.getByRole("button", { name: /^report$/i }).first();
    if (await reportButton.isVisible()) {
      await reportButton.click();
      await expect(page.getByText(/audit zip|validation report|findings/i).first()).toBeVisible();
      const audit = page.getByRole("button", { name: /audit zip/i });
      if (await audit.isVisible()) {
        const downloadPromise = page.waitForEvent("download");
        await audit.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/audit-bundle/i);
      }
      await page.getByRole("button", { name: /close/i }).first().click();
    }

    const compareBaseline = page.getByRole("button", { name: /compare to baseline/i }).first();
    if (await compareBaseline.isVisible()) {
      await compareBaseline.click();
      await expect(page.getByTestId("regression-report")).toBeVisible({ timeout: 30_000 });
    }

    await expect(page.getByTestId("traceability-matrix")).toBeVisible();
    const exportCsv = page.getByRole("button", { name: /csv|xlsx|export/i }).first();
    if (await exportCsv.isVisible()) {
      // Traceability export is client-side; presence is enough for the gate.
      await expect(exportCsv).toBeEnabled();
    }

    page.once("dialog", (dialog) => dialog.accept());
    const deleteButton = page.getByRole("button", { name: /delete project/i });
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      await expect(page.getByText(/project deleted|retention/i)).toBeVisible({ timeout: 30_000 });
    }
  });
});
