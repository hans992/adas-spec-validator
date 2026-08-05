import { describe, expect, it } from "vitest";

import {
  exportPipelineCsv,
  exportPipelineSarif,
  inputFingerprint,
  stableJson,
  type PipelineReport
} from "@/domain/pipelineArtifacts";

const report: PipelineReport = {
  runId: "run-1",
  projectId: "project-1",
  modelName: "building.ifc",
  status: "completed",
  metrics: { passRate: 50 },
  requirements: [{
    id: "REQ-1",
    title: "Office area",
    description: "Office shall be large enough.",
    type: "minimum_room_area",
    severity: "critical",
    roomType: "office",
    minAreaSqm: 10,
    source: { document: "Spec A", section: "3.2", revision: "B" }
  }],
  results: [{
    ruleId: "minimum-room-area",
    requirementId: "REQ-1",
    requirementTitle: "Office area",
    elementType: "room",
    status: "fail",
    severity: "critical",
    summary: "Room R-1 is too small.",
    affectedElementIds: ["R-1"],
    evidence: [{ message: "Area 8 m²", observed: 8, expected: 10 }]
  }]
};

describe("pipeline artifacts", () => {
  it("creates deterministic fingerprints independent of object key order", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
    expect(inputFingerprint({ b: 2, a: 1 })).toBe(inputFingerprint({ a: 1, b: 2 }));
  });

  it("exports stable CSV with evidence and element IDs", () => {
    const csv = exportPipelineCsv(report);
    expect(csv).toContain("run_id,requirement_id");
    expect(csv).toContain("R-1");
    expect(csv).toContain('"[{""message"":""Area 8 m²""');
  });

  it("exports SARIF 2.1 with critical failures as errors and source metadata", () => {
    const sarif = exportPipelineSarif(report) as {
      version: string;
      runs: Array<{ results: Array<Record<string, any>> }>;
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]!.results[0]!.level).toBe("error");
    expect(sarif.runs[0]!.results[0]!.ruleId).toBe("minimum-room-area");
    expect(sarif.runs[0]!.results[0]!.properties.sourceSection).toBe("3.2");
  });
});
