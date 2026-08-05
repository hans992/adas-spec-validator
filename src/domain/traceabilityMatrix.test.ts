import { describe, expect, it } from "vitest";

import {
  buildTraceabilityMatrix,
  exportTraceabilityCsv,
  exportTraceabilityXlsx,
  filterTraceabilityRows,
  traceabilityRowsToFlat,
  type ReviewRecord
} from "@/domain/traceabilityMatrix";
import type { DocxDocumentSourceSnapshot, Requirement, ValidationResult } from "@/domain/types";

const requirements: Requirement[] = [
  {
    id: "REQ-001",
    title: "Office minimum area",
    type: "minimum_room_area",
    severity: "critical",
    discipline: "Architecture",
    roomType: "office",
    minAreaSqm: 9,
    source: { document: "HR Pravilnik 2024", section: "3.1", revision: "A" },
    sourceFragmentIds: ["frag-1"]
  },
  {
    id: "REQ-002",
    title: "Corridor exit door width",
    type: "minimum_door_width_for_room_type",
    severity: "warning",
    discipline: "Fire safety",
    roomType: "corridor",
    minDoorWidthM: 0.9,
    source: { document: "HR Pravilnik 2024", section: "5.2", revision: "A" }
  },
  {
    id: "REQ-003",
    title: "Acoustic comfort statement",
    type: "textual_requirement",
    severity: "info",
    discipline: "Acoustics",
    description: "Walls shall provide adequate acoustic insulation.",
    automationStatus: "requires_rule_configuration"
  },
  {
    id: "REQ-004",
    title: "Stockroom minimum area",
    type: "minimum_room_area",
    severity: "warning",
    discipline: "Architecture",
    roomType: "stockroom",
    minAreaSqm: 6
  }
];

const results: ValidationResult[] = [
  {
    ruleId: "rule-area",
    requirementId: "REQ-001",
    requirementTitle: "Office minimum area",
    elementType: "room",
    status: "pass",
    severity: "critical",
    summary: "Office R1 is 11.2 m².",
    affectedElementIds: ["room-r1"],
    evidence: [{ message: "Observed area 11.2 m²", observed: 11.2, expected: 9 }]
  },
  {
    ruleId: "rule-door",
    requirementId: "REQ-002",
    requirementTitle: "Corridor exit door width",
    elementType: "door",
    status: "fail",
    severity: "warning",
    summary: "Door D3 is 0.8 m wide.",
    affectedElementIds: ["door-d3"],
    evidence: [{ message: "Observed width 0.8 m", observed: 0.8, expected: 0.9 }]
  },
  {
    ruleId: "rule-area",
    requirementId: "REQ-004",
    requirementTitle: "Stockroom minimum area",
    elementType: "room",
    status: "unknown",
    severity: "warning",
    summary: "Stockroom S1 has no area quantity.",
    affectedElementIds: ["room-s1"],
    evidence: []
  }
];

const reviews: ReviewRecord[] = [
  { requirement_id: "REQ-002", status: "waived", comment: "Existing building, waiver approved.", updated_at: "2026-08-01T10:00:00Z" }
];

const documentSource: DocxDocumentSourceSnapshot = {
  kind: "docx",
  fileName: "pravilnik.docx",
  contentHash: "abc123def456",
  parserVersion: "1.0.0",
  metadata: {},
  fragments: [
    {
      fragmentId: "frag-1",
      kind: "numbered_clause",
      exactText: "3.1 Spavaće sobe moraju imati najmanje 9 m².",
      headingPath: ["3 Prostorije"],
      sourceAnchor: { kind: "paragraph", bodyIndex: 4, paragraphIndex: 4, startOffset: 0, endOffset: 44 }
    }
  ],
  unsupportedContent: [],
  trackChanges: { present: false, insertedRuns: 0, deletedRuns: 0, comments: 0 },
  fragmentRequirementMap: [{ requirementId: "REQ-001", fragmentIds: ["frag-1"], textRanges: [] }]
};

describe("buildTraceabilityMatrix", () => {
  const matrix = buildTraceabilityMatrix({ requirements, results, reviews, documentSource });

  it("builds one row per requirement with the full chain", () => {
    expect(matrix.rows).toHaveLength(4);
    const first = matrix.rows.find((row) => row.requirementId === "REQ-001")!;
    expect(first.sourceDocument).toBe("HR Pravilnik 2024");
    expect(first.sourceResolved).toBe(true);
    expect(first.sourceClauseText).toContain("Spavaće sobe");
    expect(first.sourceClauseLocation).toContain("paragraph 5");
    expect(first.findings).toHaveLength(1);
    expect(first.findings[0]!.affectedElementIds).toEqual(["room-r1"]);
    expect(first.outcome).toBe("compliant");
  });

  it("flags gap categories: uncovered, no executable rule, unknown, unreviewed, waived", () => {
    const textual = matrix.rows.find((row) => row.requirementId === "REQ-003")!;
    expect(textual.gaps.uncovered).toBe(true);
    expect(textual.gaps.noExecutableRule).toBe(true);
    expect(textual.gaps.unknownOutcome).toBe(true);

    const waived = matrix.rows.find((row) => row.requirementId === "REQ-002")!;
    expect(waived.gaps.waived).toBe(true);
    expect(waived.gaps.findingWithoutReview).toBe(false);

    const unknown = matrix.rows.find((row) => row.requirementId === "REQ-004")!;
    expect(unknown.gaps.unknownOutcome).toBe(true);
    expect(unknown.gaps.findingWithoutReview).toBe(true);
  });

  it("keeps the six metrics separate instead of one aggregated number", () => {
    const metrics = matrix.metrics;
    // REQ-001 (source + fragments) and REQ-002 (source) have metadata.
    expect(metrics.extractionCoverage).toEqual({ numerator: 2, denominator: 4, percent: 50 });
    // Textual requirement is the only one without an executable rule.
    expect(metrics.ruleCoverage).toEqual({ numerator: 3, denominator: 4, percent: 75 });
    // Determined: REQ-001 pass, REQ-002 fail; applicable: all 4.
    expect(metrics.evaluationCoverage).toEqual({ numerator: 2, denominator: 4, percent: 50 });
    expect(metrics.passRate).toEqual({ numerator: 1, denominator: 2, percent: 50 });
    // Needing review: REQ-002 (violation), REQ-003 + REQ-004 (unknown); only REQ-002 decided.
    expect(metrics.reviewCompletion).toEqual({ numerator: 1, denominator: 3, percent: 33 });
    // Only REQ-001 resolves to a persisted fragment.
    expect(metrics.sourceTraceabilityCoverage).toEqual({ numerator: 1, denominator: 4, percent: 25 });
  });

  it("groups coverage by document and discipline", () => {
    const pravilnik = matrix.coverageByDocument.find((group) => group.key === "HR Pravilnik 2024")!;
    expect(pravilnik.requirementCount).toBe(2);
    expect(pravilnik.determined).toBe(2);
    expect(pravilnik.compliant).toBe(1);

    const noSource = matrix.coverageByDocument.find((group) => group.key === "No source document")!;
    expect(noSource.requirementCount).toBe(2);

    const architecture = matrix.coverageByDiscipline.find((group) => group.key === "Architecture")!;
    expect(architecture.requirementCount).toBe(2);
    expect(architecture.unreviewedFindings).toBe(1);
  });

  it("reports null percentages instead of fake zeros when a denominator is empty", () => {
    const empty = buildTraceabilityMatrix({ requirements: [], results: [] });
    expect(empty.metrics.passRate.percent).toBeNull();
    expect(empty.metrics.reviewCompletion.percent).toBeNull();
  });
});

describe("filterTraceabilityRows", () => {
  const matrix = buildTraceabilityMatrix({ requirements, results, reviews, documentSource });

  it("filters by document, discipline, severity, and gap", () => {
    expect(filterTraceabilityRows(matrix.rows, { document: "HR Pravilnik 2024" })).toHaveLength(2);
    expect(filterTraceabilityRows(matrix.rows, { discipline: "Acoustics" })).toHaveLength(1);
    expect(filterTraceabilityRows(matrix.rows, { severity: "critical" })).toHaveLength(1);
    expect(filterTraceabilityRows(matrix.rows, { gap: "uncovered" }).map((row) => row.requirementId)).toEqual(["REQ-003"]);
    expect(filterTraceabilityRows(matrix.rows, { gap: "finding_without_review" }).map((row) => row.requirementId)).toEqual(["REQ-003", "REQ-004"]);
    expect(filterTraceabilityRows(matrix.rows, { gap: "waived" }).map((row) => row.requirementId)).toEqual(["REQ-002"]);
  });
});

describe("exports", () => {
  const matrix = buildTraceabilityMatrix({ requirements, results, reviews, documentSource });

  it("flattens one line per finding and one line for uncovered requirements", () => {
    const flat = traceabilityRowsToFlat(matrix.rows);
    expect(flat).toHaveLength(4);
    const uncovered = flat.find((line) => line[0] === "REQ-003")!;
    expect(uncovered[13]).toBe("");
  });

  it("produces CSV with headers, escaping, and review decisions", () => {
    const csv = exportTraceabilityCsv(matrix.rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("requirement_id");
    expect(lines[0]).toContain("review_status");
    expect(csv).toContain("waived");
    expect(csv).toContain('"Existing building, waiver approved."');
  });

  it("produces an XLSX workbook with metrics, matrix, and coverage sheets", async () => {
    const bytes = await exportTraceabilityXlsx(matrix);
    expect(bytes.length).toBeGreaterThan(1000);
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Metrics", "Matrix", "Coverage"]);
    expect(workbook.getWorksheet("Metrics")!.getCell("A2").value).toBe("Extraction coverage");
  });
});
