import { calculateComplianceMetrics, type RequirementOutcome } from "@/domain/complianceMetrics";
import type {
  DocumentFragment,
  DocumentSourceSnapshot,
  Requirement,
  ValidationResult,
  ValidationSeverity
} from "@/domain/types";

export type ReviewStatus = "open" | "acknowledged" | "resolved" | "waived";

export interface ReviewRecord {
  requirement_id: string;
  status: ReviewStatus;
  comment: string;
  updated_at: string;
}

export interface TraceabilityFinding {
  ruleId: string;
  elementType: "room" | "door" | "model";
  status: ValidationResult["status"];
  severity: ValidationSeverity;
  summary: string;
  affectedElementIds: string[];
  evidenceCount: number;
}

export interface TraceabilityGaps {
  uncovered: boolean;
  noExecutableRule: boolean;
  unknownOutcome: boolean;
  findingWithoutReview: boolean;
  waived: boolean;
}

export interface TraceabilityRow {
  requirementId: string;
  title: string;
  discipline: string;
  severity: ValidationSeverity;
  requirementType: Requirement["type"];
  sourceDocument: string;
  sourceSection: string;
  sourceRevision: string;
  sourceFragmentIds: string[];
  /** Exact clause text resolved from the persisted document snapshot, when available. */
  sourceClauseText?: string;
  sourceClauseLocation?: string;
  /** True when at least one source fragment resolves inside the durable snapshot. */
  sourceResolved: boolean;
  hasSourceMetadata: boolean;
  hasExecutableRule: boolean;
  outcome: RequirementOutcome;
  findings: TraceabilityFinding[];
  reviewStatus?: ReviewStatus;
  reviewComment?: string;
  reviewUpdatedAt?: string;
  needsReview: boolean;
  gaps: TraceabilityGaps;
}

export interface CoverageMetric {
  numerator: number;
  denominator: number;
  percent: number | null;
}

/**
 * Deliberately separate metrics. There is no single aggregated "compliance" number,
 * because extraction, rule authoring, evaluation, and review are different responsibilities.
 */
export interface TraceabilityMetrics {
  extractionCoverage: CoverageMetric;
  ruleCoverage: CoverageMetric;
  evaluationCoverage: CoverageMetric;
  passRate: CoverageMetric;
  reviewCompletion: CoverageMetric;
  sourceTraceabilityCoverage: CoverageMetric;
}

export interface CoverageGroup {
  key: string;
  requirementCount: number;
  withRule: number;
  determined: number;
  compliant: number;
  unreviewedFindings: number;
}

export interface TraceabilityMatrix {
  rows: TraceabilityRow[];
  metrics: TraceabilityMetrics;
  coverageByDocument: CoverageGroup[];
  coverageByDiscipline: CoverageGroup[];
}

const EXECUTABLE_TYPES = new Set<Requirement["type"]>([
  "minimum_room_area",
  "minimum_door_width_for_room_type",
  "room_has_connected_door",
  "composite_room_rule"
]);

function metric(numerator: number, denominator: number): CoverageMetric {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? Math.round((numerator / denominator) * 100) : null
  };
}

function fragmentLocation(fragment: DocumentFragment): string {
  const anchor = fragment.sourceAnchor;
  if (anchor.kind === "pdf_text_block" || anchor.kind === "pdf_table_cell") {
    return `PDF page ${anchor.pageNumber}`;
  }
  if (anchor.kind === "table_cell") {
    return `DOCX table ${anchor.tableIndex + 1}, row ${anchor.rowIndex + 1}, cell ${anchor.cellIndex + 1}`;
  }
  return `DOCX paragraph ${anchor.paragraphIndex + 1}`;
}

export function buildTraceabilityMatrix(input: {
  requirements: Requirement[];
  results: ValidationResult[];
  reviews?: ReviewRecord[];
  documentSource?: DocumentSourceSnapshot;
}): TraceabilityMatrix {
  const { requirements, results, reviews = [], documentSource } = input;
  const compliance = calculateComplianceMetrics(requirements, results);
  const outcomeById = new Map(compliance.assessments.map((item) => [item.requirement.id, item.outcome]));
  const reviewById = new Map(reviews.map((review) => [review.requirement_id, review]));
  const fragmentById = new Map<string, DocumentFragment>(
    (documentSource?.fragments ?? []).map((fragment) => [fragment.fragmentId, fragment])
  );

  const rows: TraceabilityRow[] = requirements.map((requirement) => {
    const requirementResults = results.filter((result) => result.requirementId === requirement.id);
    const outcome = outcomeById.get(requirement.id) ?? "unknown";
    const review = reviewById.get(requirement.id);
    const fragmentIds = requirement.sourceFragmentIds ?? [];
    const resolvedFragments = fragmentIds
      .map((id) => fragmentById.get(id))
      .filter((fragment): fragment is DocumentFragment => Boolean(fragment));
    const hasSourceMetadata = Boolean(requirement.source?.document && requirement.source?.section) || fragmentIds.length > 0;
    const hasExecutableRule = EXECUTABLE_TYPES.has(requirement.type);
    const needsReview = outcome === "violation" || outcome === "unknown";
    const hasReviewDecision = review !== undefined && review.status !== "open";

    return {
      requirementId: requirement.id,
      title: requirement.title,
      discipline: requirement.discipline ?? "Unassigned",
      severity: requirement.severity,
      requirementType: requirement.type,
      sourceDocument: requirement.source?.document ?? "",
      sourceSection: requirement.source?.section ?? "",
      sourceRevision: requirement.source?.revision ?? "",
      sourceFragmentIds: fragmentIds,
      ...(resolvedFragments.length > 0
        ? {
            sourceClauseText: resolvedFragments.map((fragment) => fragment.exactText).join("\n\n"),
            sourceClauseLocation: resolvedFragments.map(fragmentLocation).join("; ")
          }
        : {}),
      sourceResolved: resolvedFragments.length > 0,
      hasSourceMetadata,
      hasExecutableRule,
      outcome,
      findings: requirementResults.map((result) => ({
        ruleId: result.ruleId,
        elementType: result.elementType,
        status: result.status,
        severity: result.severity,
        summary: result.summary,
        affectedElementIds: result.affectedElementIds,
        evidenceCount: result.evidence.length
      })),
      ...(review
        ? {
            reviewStatus: review.status,
            reviewComment: review.comment,
            reviewUpdatedAt: review.updated_at
          }
        : {}),
      needsReview,
      gaps: {
        uncovered: requirementResults.length === 0,
        noExecutableRule: !hasExecutableRule,
        unknownOutcome: outcome === "unknown",
        findingWithoutReview: needsReview && !hasReviewDecision,
        waived: review?.status === "waived"
      }
    };
  });

  const total = rows.length;
  const needingReview = rows.filter((row) => row.needsReview);
  const metrics: TraceabilityMetrics = {
    extractionCoverage: metric(rows.filter((row) => row.hasSourceMetadata).length, total),
    ruleCoverage: metric(rows.filter((row) => row.hasExecutableRule).length, total),
    evaluationCoverage: metric(compliance.determinedRequirements, compliance.applicableRequirements),
    passRate: metric(compliance.compliantRequirements, compliance.determinedRequirements),
    reviewCompletion: metric(
      needingReview.filter((row) => !row.gaps.findingWithoutReview).length,
      needingReview.length
    ),
    sourceTraceabilityCoverage: metric(rows.filter((row) => row.sourceResolved).length, total)
  };

  const groupBy = (keyOf: (row: TraceabilityRow) => string): CoverageGroup[] => {
    const groups = new Map<string, CoverageGroup>();
    for (const row of rows) {
      const key = keyOf(row) || "Unassigned";
      const group = groups.get(key) ?? {
        key,
        requirementCount: 0,
        withRule: 0,
        determined: 0,
        compliant: 0,
        unreviewedFindings: 0
      };
      group.requirementCount += 1;
      if (row.hasExecutableRule) group.withRule += 1;
      if (row.outcome === "compliant" || row.outcome === "violation") group.determined += 1;
      if (row.outcome === "compliant") group.compliant += 1;
      if (row.gaps.findingWithoutReview) group.unreviewedFindings += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
  };

  return {
    rows,
    metrics,
    coverageByDocument: groupBy((row) => row.sourceDocument || "No source document"),
    coverageByDiscipline: groupBy((row) => row.discipline)
  };
}

export type TraceabilityGapFilter =
  | "uncovered"
  | "no_executable_rule"
  | "unknown_outcome"
  | "finding_without_review"
  | "waived";

export function filterTraceabilityRows(
  rows: TraceabilityRow[],
  filters: {
    document?: string;
    discipline?: string;
    severity?: ValidationSeverity | "";
    gap?: TraceabilityGapFilter | "";
  }
): TraceabilityRow[] {
  return rows.filter((row) => {
    if (filters.document && (row.sourceDocument || "No source document") !== filters.document) return false;
    if (filters.discipline && row.discipline !== filters.discipline) return false;
    if (filters.severity && row.severity !== filters.severity) return false;
    if (filters.gap === "uncovered" && !row.gaps.uncovered) return false;
    if (filters.gap === "no_executable_rule" && !row.gaps.noExecutableRule) return false;
    if (filters.gap === "unknown_outcome" && !row.gaps.unknownOutcome) return false;
    if (filters.gap === "finding_without_review" && !row.gaps.findingWithoutReview) return false;
    if (filters.gap === "waived" && !row.gaps.waived) return false;
    return true;
  });
}

const CSV_HEADERS = [
  "requirement_id",
  "title",
  "discipline",
  "severity",
  "requirement_type",
  "source_document",
  "source_section",
  "source_revision",
  "source_fragment_ids",
  "source_clause_location",
  "source_resolved",
  "has_executable_rule",
  "outcome",
  "rule_id",
  "element_type",
  "finding_status",
  "finding_summary",
  "affected_element_ids",
  "evidence_count",
  "review_status",
  "review_comment",
  "review_updated_at"
] as const;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** One export line per finding; requirements without findings still get one line with empty finding columns. */
export function traceabilityRowsToFlat(rows: TraceabilityRow[]): string[][] {
  const flat: string[][] = [];
  for (const row of rows) {
    const base = [
      row.requirementId,
      row.title,
      row.discipline,
      row.severity,
      row.requirementType,
      row.sourceDocument,
      row.sourceSection,
      row.sourceRevision,
      row.sourceFragmentIds.join("; "),
      row.sourceClauseLocation ?? "",
      String(row.sourceResolved),
      String(row.hasExecutableRule),
      row.outcome
    ];
    const review = [row.reviewStatus ?? "", row.reviewComment ?? "", row.reviewUpdatedAt ?? ""];
    if (row.findings.length === 0) {
      flat.push([...base, "", "", "", "", "", "0", ...review]);
      continue;
    }
    for (const finding of row.findings) {
      flat.push([
        ...base,
        finding.ruleId,
        finding.elementType,
        finding.status,
        finding.summary,
        finding.affectedElementIds.join("; "),
        String(finding.evidenceCount),
        ...review
      ]);
    }
  }
  return flat;
}

export function exportTraceabilityCsv(rows: TraceabilityRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const record of traceabilityRowsToFlat(rows)) {
    lines.push(record.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}

export async function exportTraceabilityXlsx(matrix: TraceabilityMatrix): Promise<Uint8Array> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "AEC Spec Validator";
  workbook.created = new Date();

  const metricsSheet = workbook.addWorksheet("Metrics");
  metricsSheet.addRow(["Metric", "Numerator", "Denominator", "Percent"]);
  const metricRows: Array<[string, CoverageMetric]> = [
    ["Extraction coverage", matrix.metrics.extractionCoverage],
    ["Rule coverage", matrix.metrics.ruleCoverage],
    ["Evaluation coverage", matrix.metrics.evaluationCoverage],
    ["Pass rate", matrix.metrics.passRate],
    ["Review completion", matrix.metrics.reviewCompletion],
    ["Source traceability coverage", matrix.metrics.sourceTraceabilityCoverage]
  ];
  for (const [label, value] of metricRows) {
    metricsSheet.addRow([label, value.numerator, value.denominator, value.percent ?? "n/a"]);
  }
  metricsSheet.getRow(1).font = { bold: true };

  const matrixSheet = workbook.addWorksheet("Matrix");
  matrixSheet.addRow([...CSV_HEADERS]);
  for (const record of traceabilityRowsToFlat(matrix.rows)) {
    matrixSheet.addRow(record);
  }
  matrixSheet.views = [{ state: "frozen", ySplit: 1 }];
  matrixSheet.getRow(1).font = { bold: true };
  matrixSheet.columns.forEach((column) => { column.width = 20; });

  const coverageSheet = workbook.addWorksheet("Coverage");
  coverageSheet.addRow(["Group kind", "Group", "Requirements", "With rule", "Determined", "Compliant", "Unreviewed findings"]);
  for (const group of matrix.coverageByDocument) {
    coverageSheet.addRow(["document", group.key, group.requirementCount, group.withRule, group.determined, group.compliant, group.unreviewedFindings]);
  }
  for (const group of matrix.coverageByDiscipline) {
    coverageSheet.addRow(["discipline", group.key, group.requirementCount, group.withRule, group.determined, group.compliant, group.unreviewedFindings]);
  }
  coverageSheet.getRow(1).font = { bold: true };

  const output = await workbook.xlsx.writeBuffer();
  return new Uint8Array(output);
}
