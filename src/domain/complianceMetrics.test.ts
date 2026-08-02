import { describe, expect, it } from "vitest";
import { calculateComplianceMetrics } from "@/domain/complianceMetrics";
import type { Requirement, ValidationResult } from "@/domain/types";

const requirements: Requirement[] = [
  { id: "pass", title: "Pass", type: "room_has_connected_door", severity: "info" },
  { id: "fail", title: "Fail", type: "room_has_connected_door", severity: "critical" },
  { id: "unknown", title: "Unknown", type: "room_has_connected_door", severity: "warning" },
  { id: "na", title: "N/A", type: "minimum_room_area", severity: "warning", roomType: "meeting_room", minAreaSqm: 10 }
];

function result(requirementId: string, status: ValidationResult["status"]): ValidationResult {
  return {
    ruleId: "test",
    requirementId,
    requirementTitle: requirementId,
    elementType: "model",
    status,
    severity: requirementId === "fail" ? "critical" : "warning",
    summary: "test",
    affectedElementIds: [],
    evidence: [{ message: "test" }]
  };
}

describe("calculateComplianceMetrics", () => {
  it("separates pass rate from evaluation coverage", () => {
    const metrics = calculateComplianceMetrics(requirements, [
      result("pass", "pass"),
      result("pass", "pass"),
      result("fail", "fail"),
      result("unknown", "unknown"),
      result("na", "not_applicable")
    ]);

    expect(metrics.passRate).toBe(50);
    expect(metrics.coverage).toBe(67);
    expect(metrics.criticalFailures).toBe(1);
    expect(metrics.notApplicableRequirements).toBe(1);
    expect(metrics.resultCounts.pass).toBe(2);
  });

  it("gives each requirement one outcome regardless of element count", () => {
    const metrics = calculateComplianceMetrics(requirements.slice(0, 2), [
      ...Array.from({ length: 20 }, () => result("pass", "pass")),
      result("fail", "fail")
    ]);

    expect(metrics.passRate).toBe(50);
  });

  it("does not treat missing results as compliant", () => {
    const metrics = calculateComplianceMetrics(requirements.slice(0, 1), []);
    expect(metrics.unknownRequirements).toBe(1);
    expect(metrics.passRate).toBeNull();
    expect(metrics.coverage).toBe(0);
  });

  it("excludes not-applicable requirements from both rates", () => {
    const metrics = calculateComplianceMetrics([requirements[3]], [result("na", "not_applicable")]);
    expect(metrics.passRate).toBeNull();
    expect(metrics.coverage).toBeNull();
  });
});
