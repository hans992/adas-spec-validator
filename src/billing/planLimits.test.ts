import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLANS,
  assertCanCreateProject,
  assertCanUseApi,
  assertFileWithinPlan,
  currentUsageMonth,
  formatBytes,
  planLimitError
} from "@/billing/planLimits";
import {
  DEMO_WAIVE_REQUIREMENT_ID,
  buildDemoValidation,
  demoRequirementsA,
  demoRequirementsB,
  summariseDemoOutcomes
} from "@/domain/demoProject";

describe("plan limits", () => {
  it("publishes three plans with enforceable caps", () => {
    expect(PLANS.starter.maxProjects).toBe(2);
    expect(PLANS.starter.apiAccess).toBe(false);
    expect(PLANS.professional.apiAccess).toBe(true);
    expect(PLANS.enterprise.retentionDays).toBeGreaterThan(PLANS.professional.retentionDays);
    expect(formatBytes(10 * 1024 * 1024)).toContain("MB");
    expect(currentUsageMonth(new Date("2026-08-05T12:00:00Z"))).toBe("2026-08");
  });

  it("builds a 402 plan-limit error", () => {
    const error = planLimitError("Upgrade required.");
    expect(error.status).toBe(402);
    expect(error.message).toContain("Upgrade");
  });

  describe("with mocked Supabase", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

    it("blocks a third project on the starter plan", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(Response.json([])) // account_plans → starter
        .mockResolvedValueOnce(Response.json([{ id: "p1" }, { id: "p2" }]));
      await expect(assertCanCreateProject("token", "user-1")).rejects.toMatchObject({ status: 402 });
    });

    it("allows API tokens only on plans with apiAccess", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([]));
      await expect(assertCanUseApi("token", "user-1")).rejects.toMatchObject({ status: 402 });

      vi.stubEnv("FORCE_ACCOUNT_PLAN", "professional");
      await expect(assertCanUseApi("token", "user-1")).resolves.toMatchObject({ id: "professional" });
    });

    it("rejects files larger than the plan max", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(Response.json({ validation_runs: 0, audit_exports: 0, storage_bytes: 0 }))
        .mockResolvedValueOnce(Response.json([]));
      await expect(assertFileWithinPlan("token", "user-1", PLANS.starter.maxFileBytes + 1))
        .rejects.toMatchObject({ status: 402 });
    });
  });
});

describe("demo project content", () => {
  it("produces passes, failures, an unknown finding and a waivable fail", () => {
    const summary = summariseDemoOutcomes();
    expect(summary.passes).toBeGreaterThan(0);
    expect(summary.fails).toBeGreaterThan(0);
    expect(summary.unknowns).toBeGreaterThanOrEqual(1);
    expect(summary.waiveRequirementId).toBe(DEMO_WAIVE_REQUIREMENT_ID);

    const baseline = buildDemoValidation(demoRequirementsA);
    const doorFail = baseline.results.find((result) => result.requirementId === DEMO_WAIVE_REQUIREMENT_ID);
    expect(doorFail?.status).toBe("fail");

    const unknown = baseline.results.find((result) => result.status === "unknown");
    expect(unknown?.requirementId).toBe("req-fire-rating-unknown");
  });

  it("tightens office area between revision A and B for regression", () => {
    const officeA = demoRequirementsA.find((item) => item.id === "req-office-min-area");
    const officeB = demoRequirementsB.find((item) => item.id === "req-office-min-area");
    expect(officeA && officeA.type === "minimum_room_area" && officeA.minAreaSqm).toBe(8);
    expect(officeB && officeB.type === "minimum_room_area" && officeB.minAreaSqm).toBe(10);

    const baselineFails = buildDemoValidation(demoRequirementsA).results
      .filter((result) => result.requirementId === "req-office-min-area" && result.status === "fail").length;
    const candidateFails = buildDemoValidation(demoRequirementsB).results
      .filter((result) => result.requirementId === "req-office-min-area" && result.status === "fail").length;
    expect(candidateFails).toBeGreaterThanOrEqual(baselineFails);
  });
});
