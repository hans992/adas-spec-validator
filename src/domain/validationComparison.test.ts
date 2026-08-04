import { describe, expect, it } from "vitest";

import { compareValidationSnapshots, type ValidationSnapshot } from "@/domain/validationComparison";
import type { Requirement, ValidationResult } from "@/domain/types";

const requirement = (id: string): Requirement => ({
  id, title: `Requirement ${id}`, type: "room_has_connected_door", severity: "critical"
});

const result = (id: string, status: ValidationResult["status"]): ValidationResult => ({
  ruleId: id, requirementId: id, requirementTitle: `Requirement ${id}`,
  elementType: "model", status, severity: "critical", summary: status,
  affectedElementIds: [], evidence: []
});

const snapshot = (requirements: Requirement[], results: ValidationResult[], rooms = 1): ValidationSnapshot => ({
  id: crypto.randomUUID(), model_name: "model.ifc", created_at: "2026-08-04T10:00:00Z",
  normalized_model: { levels: [{ id: "l1", name: "Ground" }], rooms: Array.from({ length: rooms }, (_, i) => ({ id: `r${i}`, name: `Room ${i}`, levelId: "l1", roomType: "office" as const })), doors: [] },
  requirements, results
});

describe("compareValidationSnapshots", () => {
  it("classifies resolved, regressed, unchanged, added and removed requirements", () => {
    const before = snapshot([requirement("resolved"), requirement("regressed"), requirement("same"), requirement("removed")], [result("resolved", "fail"), result("regressed", "pass"), result("same", "pass"), result("removed", "pass")]);
    const after = snapshot([requirement("resolved"), requirement("regressed"), requirement("same"), requirement("added")], [result("resolved", "pass"), result("regressed", "fail"), result("same", "pass"), result("added", "pass")], 2);
    const comparison = compareValidationSnapshots(before, after);

    expect(comparison.counts).toEqual({ resolved: 1, regressed: 1, changed: 0, unchanged: 1, added: 1, removed: 1 });
    expect(comparison.roomsDelta).toBe(1);
  });

  it("reports a null pass-rate delta when either run has no determined requirements", () => {
    const comparison = compareValidationSnapshots(snapshot([], []), snapshot([requirement("a")], [result("a", "pass")]));
    expect(comparison.beforePassRate).toBeNull();
    expect(comparison.passRateDelta).toBeNull();
  });
});
