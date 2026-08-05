import { describe, expect, it } from "vitest";

import {
  buildRegressionReport,
  compareFindings,
  DEFAULT_RELEASE_POLICY,
  evaluateReleasePolicy,
  findingKey,
  normalizeReleasePolicy,
  type ReleasePolicy
} from "@/domain/regressionValidation";
import type { ValidationSnapshot } from "@/domain/validationComparison";
import type { Requirement, ValidationResult } from "@/domain/types";

const requirement = (
  id: string,
  severity: Requirement["severity"] = "critical"
): Requirement => ({
  id,
  title: `Requirement ${id}`,
  type: "room_has_connected_door",
  severity
});

const result = (
  id: string,
  status: ValidationResult["status"],
  severity: ValidationResult["severity"] = "critical",
  elements: string[] = ["r1"]
): ValidationResult => ({
  ruleId: `rule-${id}`,
  requirementId: id,
  requirementTitle: `Requirement ${id}`,
  elementType: "room",
  status,
  severity,
  summary: `${id}:${status}`,
  affectedElementIds: elements,
  evidence: []
});

const snapshot = (
  id: string,
  requirements: Requirement[],
  results: ValidationResult[],
  rooms = 1
): ValidationSnapshot => ({
  id,
  model_name: `${id}.ifc`,
  created_at: "2026-08-05T10:00:00Z",
  normalized_model: {
    levels: [{ id: "l1", name: "Ground" }],
    rooms: Array.from({ length: rooms }, (_, index) => ({
      id: `r${index}`,
      name: `Room ${index}`,
      levelId: "l1",
      roomType: "office" as const
    })),
    doors: rooms > 1 ? [{ id: "d1", name: "Door 1", levelId: "l1", widthM: 0.9, connectedRoomIds: ["r0", "r1"] }] : []
  },
  requirements,
  results
});

describe("finding identity", () => {
  it("is stable regardless of affected-element order", () => {
    expect(findingKey(result("a", "fail", "critical", ["b", "a"]))).toBe(
      findingKey(result("a", "fail", "critical", ["a", "b"]))
    );
  });
});

describe("compareFindings", () => {
  it("classifies new, resolved, reopened and changed findings", () => {
    const titles = new Map([["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]]);
    const before = [
      result("a", "fail"),
      result("b", "pass"),
      result("c", "fail"),
      result("d", "fail", "warning")
    ];
    const after = [
      result("b", "fail"),
      result("c", "pass"),
      result("d", "fail", "critical"),
      result("e", "fail")
    ];
    const deltas = compareFindings(before, after, titles);
    const byId = Object.fromEntries(deltas.map((item) => [item.requirementId, item.kind]));
    expect(byId.a).toBe("resolved");
    expect(byId.b).toBe("reopened");
    expect(byId.c).toBe("resolved");
    expect(byId.d).toBe("changed");
    expect(byId.e).toBe("new");
  });
});

describe("evaluateReleasePolicy", () => {
  const basePolicy: ReleasePolicy = { ...DEFAULT_RELEASE_POLICY };

  it("blocks on new critical findings when configured", () => {
    const findings = compareFindings([], [result("x", "fail", "critical")], new Map([["x", "X"]]));
    const gate = evaluateReleasePolicy({
      policy: basePolicy,
      findings,
      candidateResults: [result("x", "fail", "critical")],
      beforeCoverage: 80,
      afterCoverage: 80
    });
    expect(gate.status).toBe("block");
    expect(gate.violations.map((item) => item.code)).toContain("new_critical_finding");
  });

  it("blocks on decreased coverage when configured", () => {
    const gate = evaluateReleasePolicy({
      policy: basePolicy,
      findings: [],
      candidateResults: [],
      beforeCoverage: 90,
      afterCoverage: 70
    });
    expect(gate.status).toBe("block");
    expect(gate.violations.map((item) => item.code)).toContain("decreased_coverage");
  });

  it("warns on new unknown results without blocking", () => {
    const findings = compareFindings([], [result("u", "unknown", "warning")], new Map([["u", "U"]]));
    const gate = evaluateReleasePolicy({
      policy: { ...basePolicy, blockOnNewCritical: false, blockOnDecreasedCoverage: false },
      findings,
      candidateResults: [result("u", "unknown", "warning")],
      beforeCoverage: 50,
      afterCoverage: 50
    });
    expect(gate.status).toBe("warn");
    expect(gate.violations.map((item) => item.code)).toEqual(["new_unknown_finding"]);
  });

  it("blocks waived critical findings when allowWaivedCritical is false", () => {
    const gate = evaluateReleasePolicy({
      policy: { ...basePolicy, blockOnNewCritical: false },
      findings: [],
      candidateResults: [result("w", "fail", "critical")],
      beforeCoverage: 100,
      afterCoverage: 100,
      reviews: [{ requirement_id: "w", status: "waived", comment: "accepted risk", updated_at: "2026-08-05T12:00:00Z" }]
    });
    expect(gate.status).toBe("block");
    expect(gate.violations.map((item) => item.code)).toContain("waived_critical_forbidden");
  });

  it("allows waived critical findings when policy permits them", () => {
    const gate = evaluateReleasePolicy({
      policy: {
        ...basePolicy,
        blockOnNewCritical: false,
        allowWaivedCritical: true
      },
      findings: [],
      candidateResults: [result("w", "fail", "critical")],
      beforeCoverage: 100,
      afterCoverage: 100,
      reviews: [{ requirement_id: "w", status: "waived", comment: "accepted risk", updated_at: "2026-08-05T12:00:00Z" }]
    });
    expect(gate.status).toBe("pass");
  });

  it("enforces max high and medium finding caps", () => {
    const candidateResults = [
      result("h1", "fail", "critical"),
      result("h2", "fail", "critical"),
      result("m1", "fail", "warning"),
      result("m2", "fail", "warning"),
      result("m3", "fail", "warning")
    ];
    const gate = evaluateReleasePolicy({
      policy: {
        ...basePolicy,
        blockOnNewCritical: false,
        blockOnDecreasedCoverage: false,
        warnOnNewUnknown: false,
        allowWaivedCritical: true,
        maxHighFindings: 1,
        maxMediumFindings: 2
      },
      findings: [],
      candidateResults,
      beforeCoverage: null,
      afterCoverage: null
    });
    expect(gate.status).toBe("block");
    expect(gate.violations.map((item) => item.code).sort()).toEqual([
      "max_high_findings",
      "max_medium_findings"
    ]);
  });

  it("is deterministic: identical inputs always yield the same gate status", () => {
    const findings = compareFindings(
      [result("a", "pass")],
      [result("a", "fail"), result("b", "unknown", "info")],
      new Map([["a", "A"], ["b", "B"]])
    );
    const input = {
      policy: basePolicy,
      findings,
      candidateResults: [result("a", "fail"), result("b", "unknown", "info")],
      beforeCoverage: 100,
      afterCoverage: 50
    };
    expect(evaluateReleasePolicy(input)).toEqual(evaluateReleasePolicy(input));
  });
});

describe("buildRegressionReport", () => {
  it("aggregates findings, requirements, model and specification deltas with a gate", () => {
    const baseline = snapshot(
      "base",
      [requirement("keep"), requirement("gone"), requirement("area", "warning")],
      [result("keep", "fail"), result("gone", "pass"), result("area", "fail", "warning")],
      1
    );
    const candidate = snapshot(
      "cand",
      [requirement("keep"), requirement("area", "warning"), requirement("new")],
      [result("keep", "pass"), result("area", "fail", "critical"), result("new", "fail")],
      2
    );
    const report = buildRegressionReport({
      baseline,
      candidate,
      policy: DEFAULT_RELEASE_POLICY,
      reviews: []
    });

    expect(report.findingCounts.new).toBe(1);
    expect(report.findingCounts.resolved).toBeGreaterThanOrEqual(1);
    expect(report.findingCounts.changed).toBe(1);
    expect(report.requirementCounts.added).toBe(1);
    expect(report.requirementCounts.removed).toBe(1);
    expect(report.specificationCounts.added).toBe(1);
    expect(report.specificationCounts.removed).toBe(1);
    expect(report.model.roomsDelta).toBe(1);
    expect(report.model.addedRoomIds).toEqual(["r1"]);
    expect(report.gate.status).toBe("block");
  });

  it("does not depend on AI — only snapshots, policy and reviews", () => {
    const baseline = snapshot("base", [requirement("a")], [result("a", "pass")]);
    const candidate = snapshot("cand", [requirement("a")], [result("a", "pass")]);
    const first = buildRegressionReport({ baseline, candidate });
    const second = buildRegressionReport({ baseline, candidate });
    expect(first.gate).toEqual(second.gate);
    expect(first.gate.status).toBe("pass");
  });
});

describe("normalizeReleasePolicy", () => {
  it("fills defaults and coerces numeric caps", () => {
    expect(normalizeReleasePolicy(undefined)).toEqual(DEFAULT_RELEASE_POLICY);
    expect(normalizeReleasePolicy({
      blockOnNewCritical: false,
      allowWaivedCritical: true,
      maxHighFindings: "3",
      maxMediumFindings: -1
    })).toEqual({
      blockOnNewCritical: false,
      blockOnDecreasedCoverage: true,
      warnOnNewUnknown: true,
      allowWaivedCritical: true,
      maxHighFindings: 3,
      maxMediumFindings: null
    });
  });
});
