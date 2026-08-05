import { createHash } from "node:crypto";

import { calculateComplianceMetrics } from "@/domain/complianceMetrics";
import { findingKey } from "@/domain/regressionValidation";
import {
  buildTraceabilityMatrix,
  exportTraceabilityCsv,
  exportTraceabilityXlsx,
  type ReviewRecord
} from "@/domain/traceabilityMatrix";
import type {
  DocumentSourceSnapshot,
  Requirement,
  ValidationResult,
  ValidationSeverity
} from "@/domain/types";
import type { ValidationSnapshot } from "@/domain/validationComparison";

export type FindingEvidenceKind =
  | "file"
  | "screenshot"
  | "model_element"
  | "comment"
  | "link"
  | "technical_note";

export interface FindingEvidence {
  id: string;
  requirementId: string;
  ruleId?: string;
  findingKey: string;
  kind: FindingEvidenceKind;
  title: string;
  comment: string;
  linkUrl?: string;
  technicalNote?: string;
  modelElementId?: string;
  modelElementType?: "room" | "door" | "model";
  fileName?: string;
  fileMime?: string;
  fileSizeBytes?: number;
  fileContentHash?: string;
  /** Present only when the attachment payload is requested; omitted from list views. */
  fileContentBase64?: string;
  authorId: string;
  createdAt: string;
}

export type ReviewDecisionStatus = "open" | "acknowledged" | "resolved" | "waived";

export interface ReviewDecision {
  decisionId: string;
  requirementId: string;
  status: ReviewDecisionStatus;
  comment: string;
  waiverReason?: string;
  waiverExpiresAt?: string;
  reviewerId?: string;
  decidedAt: string;
  superseded?: boolean;
  supersededAt?: string;
  supersededByDecisionId?: string;
}

export interface AuditBundleInput {
  project: {
    id: string;
    name: string;
    description?: string;
    baselineValidationId?: string | null;
    releasePolicy?: unknown;
  };
  snapshot: ValidationSnapshot;
  specification?: {
    id?: string;
    name: string;
    revision: string;
    documentSource?: DocumentSourceSnapshot;
  };
  modelFingerprint?: {
    modelAssetId?: string;
    sourceFileName: string;
    sourceContentHash?: string;
    inputFingerprint?: string;
  };
  validationConfig?: Record<string, unknown>;
  reviews: ReviewDecision[];
  reviewHistory: ReviewDecision[];
  evidence: FindingEvidence[];
  generatedAt?: string;
  generatedBy?: string;
}

export interface AuditChecksumEntry {
  path: string;
  sha256: string;
  bytes: number;
}

export interface AuditManifest {
  schemaVersion: "1.0.0";
  packageKind: "aec-audit-bundle";
  generatedAt: string;
  generatedBy?: string;
  projectId: string;
  validationRunId: string;
  /** Integrity only — not a digital signature. */
  integrity: {
    method: "sha256-manifest";
    note: "Immutable snapshot with server-generated SHA-256 checksums. This package is not digitally signed.";
  };
  files: AuditChecksumEntry[];
  packageSha256: string;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

async function pdfReportBytes(input: AuditBundleInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const metrics = calculateComplianceMetrics(input.snapshot.requirements, input.snapshot.results);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const write = (text: string, size = 10, useBold = false) => {
    if (y < 48) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(text.slice(0, 110), {
      x: 40,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.1, 0.12)
    });
    y -= size + 6;
  };

  write("AEC Spec Validator — Audit report", 16, true);
  write("Integrity: immutable snapshot + SHA-256 checksums (not digitally signed).", 9);
  write(`Project: ${input.project.name}`);
  write(`Run ID: ${input.snapshot.id}`);
  write(`Model: ${input.snapshot.model_name}`);
  write(`Validated: ${input.snapshot.created_at}`);
  write(`Pass rate: ${metrics.passRate ?? "—"}% · Coverage: ${metrics.coverage ?? "—"}%`);
  write(`Violations: ${metrics.violatedRequirements} · Critical: ${metrics.criticalFailures}`);
  write("");
  write("Findings", 12, true);
  for (const result of input.snapshot.results.filter((item) => item.status === "fail" || item.status === "unknown").slice(0, 80)) {
    write(`[${result.status}/${result.severity}] ${result.requirementId}: ${result.summary}`, 9);
  }
  write("");
  write("Current review decisions", 12, true);
  for (const review of input.reviews.slice(0, 80)) {
    write(
      `${review.requirementId}: ${review.status}` +
        (review.reviewerId ? ` · reviewer ${review.reviewerId}` : "") +
        (review.waiverReason ? ` · waiver: ${review.waiverReason}` : ""),
      9
    );
  }
  return pdf.save();
}

async function findingsXlsx(requirements: Requirement[], results: ValidationResult[]): Promise<Uint8Array> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Findings");
  sheet.addRow([
    "requirement_id", "title", "rule_id", "status", "severity", "element_type",
    "affected_element_ids", "summary", "evidence_messages"
  ]);
  const titles = new Map(requirements.map((requirement) => [requirement.id, requirement.title]));
  for (const result of results) {
    sheet.addRow([
      result.requirementId,
      titles.get(result.requirementId) ?? result.requirementTitle,
      result.ruleId,
      result.status,
      result.severity,
      result.elementType,
      result.affectedElementIds.join("; "),
      result.summary,
      result.evidence.map((item) => item.message).join(" | ")
    ]);
  }
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function normalizeReviewDecision(row: {
  decision_id?: string;
  id?: string;
  requirement_id: string;
  status: ReviewDecisionStatus;
  comment?: string;
  waiver_reason?: string | null;
  waiver_expires_at?: string | null;
  updated_by?: string | null;
  reviewer_id?: string | null;
  updated_at?: string;
  decided_at?: string;
  superseded_at?: string | null;
  superseded_by_decision_id?: string | null;
}): ReviewDecision {
  return {
    decisionId: row.decision_id ?? row.id ?? crypto.randomUUID(),
    requirementId: row.requirement_id,
    status: row.status,
    comment: row.comment ?? "",
    ...(row.waiver_reason ? { waiverReason: row.waiver_reason } : {}),
    ...(row.waiver_expires_at ? { waiverExpiresAt: row.waiver_expires_at } : {}),
    ...(row.updated_by || row.reviewer_id
      ? { reviewerId: row.updated_by ?? row.reviewer_id ?? undefined }
      : {}),
    decidedAt: row.decided_at ?? row.updated_at ?? new Date().toISOString(),
    ...(row.superseded_at
      ? {
          superseded: true,
          supersededAt: row.superseded_at,
          ...(row.superseded_by_decision_id
            ? { supersededByDecisionId: row.superseded_by_decision_id }
            : {})
        }
      : {})
  };
}

export function normalizeFindingEvidence(row: {
  id: string;
  requirement_id: string;
  rule_id?: string | null;
  finding_key: string;
  kind: FindingEvidenceKind;
  title: string;
  comment?: string;
  link_url?: string | null;
  technical_note?: string | null;
  model_element_id?: string | null;
  model_element_type?: "room" | "door" | "model" | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size_bytes?: number | null;
  file_content_hash?: string | null;
  file_content_base64?: string | null;
  created_by: string;
  created_at: string;
}): FindingEvidence {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    ...(row.rule_id ? { ruleId: row.rule_id } : {}),
    findingKey: row.finding_key,
    kind: row.kind,
    title: row.title,
    comment: row.comment ?? "",
    ...(row.link_url ? { linkUrl: row.link_url } : {}),
    ...(row.technical_note ? { technicalNote: row.technical_note } : {}),
    ...(row.model_element_id ? { modelElementId: row.model_element_id } : {}),
    ...(row.model_element_type ? { modelElementType: row.model_element_type } : {}),
    ...(row.file_name ? { fileName: row.file_name } : {}),
    ...(row.file_mime ? { fileMime: row.file_mime } : {}),
    ...(row.file_size_bytes != null ? { fileSizeBytes: row.file_size_bytes } : {}),
    ...(row.file_content_hash ? { fileContentHash: row.file_content_hash } : {}),
    ...(row.file_content_base64 ? { fileContentBase64: row.file_content_base64 } : {}),
    authorId: row.created_by,
    createdAt: row.created_at
  };
}

export function engineEvidenceAsTechnicalNotes(
  results: ValidationResult[]
): Omit<FindingEvidence, "id" | "authorId" | "createdAt">[] {
  return results.flatMap((result) =>
    result.evidence.map((item, index) => ({
      requirementId: result.requirementId,
      ruleId: result.ruleId,
      findingKey: findingKey(result),
      kind: "technical_note" as const,
      title: `Engine evidence ${index + 1}`,
      comment: "",
      technicalNote: [
        item.message,
        item.field ? `field=${item.field}` : null,
        item.observed !== undefined && item.observed !== null ? `observed=${String(item.observed)}` : null,
        item.expected !== undefined && item.expected !== null ? `expected=${String(item.expected)}` : null
      ].filter(Boolean).join(" · ")
    }))
  );
}

/**
 * Builds an audit ZIP from immutable snapshots. Integrity is SHA-256 checksums +
 * a server-generated manifest — not a digital signature.
 */
export async function buildAuditBundle(input: AuditBundleInput): Promise<{
  zip: Uint8Array;
  manifest: AuditManifest;
}> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const metrics = calculateComplianceMetrics(input.snapshot.requirements, input.snapshot.results);
  const reviewRecords: ReviewRecord[] = input.reviews.map((review) => ({
    requirement_id: review.requirementId,
    status: review.status,
    comment: review.comment,
    updated_at: review.decidedAt
  }));
  const matrix = buildTraceabilityMatrix({
    requirements: input.snapshot.requirements,
    results: input.snapshot.results,
    reviews: reviewRecords,
    documentSource: input.specification?.documentSource
  });

  const files = new Map<string, Uint8Array>();
  const put = (path: string, bytes: Uint8Array) => files.set(path, bytes);

  put("project.json", jsonBytes({
    id: input.project.id,
    name: input.project.name,
    description: input.project.description ?? null,
    baselineValidationId: input.project.baselineValidationId ?? null,
    releasePolicy: input.project.releasePolicy ?? null
  }));
  put("specification.json", jsonBytes({
    id: input.specification?.id ?? null,
    name: input.specification?.name ?? "Stored with validation run",
    revision: input.specification?.revision ?? "Stored with validation run",
    requirementCount: input.snapshot.requirements.length,
    requirements: input.snapshot.requirements,
    documentSource: input.specification?.documentSource ?? null
  }));
  put("validation-configuration.json", jsonBytes({
    validationRunId: input.snapshot.id,
    modelName: input.snapshot.model_name,
    createdAt: input.snapshot.created_at,
    metrics,
    releasePolicy: input.project.releasePolicy ?? null,
    ...(input.validationConfig ?? {})
  }));
  put("model-fingerprint.json", jsonBytes({
    modelName: input.snapshot.model_name,
    inventory: {
      levels: input.snapshot.normalized_model.levels.length,
      rooms: input.snapshot.normalized_model.rooms.length,
      doors: input.snapshot.normalized_model.doors.length
    },
    modelSha256: sha256Hex(JSON.stringify(input.snapshot.normalized_model)),
    ...(input.modelFingerprint ?? {})
  }));
  put("findings.json", jsonBytes({
    results: input.snapshot.results,
    counts: metrics.resultCounts
  }));
  put("evidence/index.json", jsonBytes({
    attachments: input.evidence.map(({ fileContentBase64: _omit, ...rest }) => rest),
    engineTechnicalNotes: engineEvidenceAsTechnicalNotes(input.snapshot.results)
  }));
  for (const item of input.evidence) {
    if (item.fileContentBase64 && item.fileName && item.fileContentHash) {
      const safeName = item.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
      const bytes = Buffer.from(item.fileContentBase64, "base64");
      put(`evidence/files/${item.id}-${safeName}`, new Uint8Array(bytes));
    }
  }
  put("reviews/current.json", jsonBytes({ decisions: input.reviews }));
  put("reviews/history.json", jsonBytes({
    supersededDecisions: input.reviewHistory,
    note: "Older decisions superseded by later reviewer actions."
  }));
  put("traceability/matrix.csv", new TextEncoder().encode(exportTraceabilityCsv(matrix.rows)));
  put("traceability/matrix.xlsx", await exportTraceabilityXlsx(matrix));
  put("results/results.json", jsonBytes({
    id: input.snapshot.id,
    model_name: input.snapshot.model_name,
    created_at: input.snapshot.created_at,
    requirements: input.snapshot.requirements,
    results: input.snapshot.results,
    metrics
  }));
  put("results/results.xlsx", await findingsXlsx(input.snapshot.requirements, input.snapshot.results));
  put("report/report.pdf", await pdfReportBytes(input));
  put("audit-log.json", jsonBytes({
    events: [
      {
        at: input.snapshot.created_at,
        type: "validation.completed",
        validationRunId: input.snapshot.id
      },
      ...input.reviewHistory.map((decision) => ({
        at: decision.decidedAt,
        type: "review.decision.superseded",
        requirementId: decision.requirementId,
        decisionId: decision.decisionId,
        status: decision.status,
        reviewerId: decision.reviewerId ?? null
      })),
      ...input.reviews.map((decision) => ({
        at: decision.decidedAt,
        type: "review.decision.current",
        requirementId: decision.requirementId,
        decisionId: decision.decisionId,
        status: decision.status,
        reviewerId: decision.reviewerId ?? null
      })),
      ...input.evidence.map((item) => ({
        at: item.createdAt,
        type: "evidence.attached",
        evidenceId: item.id,
        kind: item.kind,
        findingKey: item.findingKey,
        authorId: item.authorId,
        fileContentHash: item.fileContentHash ?? null
      }))
    ].sort((left, right) => String(left.at).localeCompare(String(right.at)))
  }));

  const checksumEntries: AuditChecksumEntry[] = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) => ({
      path,
      sha256: sha256Hex(bytes),
      bytes: bytes.byteLength
    }));
  const checksumText = `${checksumEntries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`;
  put("CHECKSUMS.sha256", new TextEncoder().encode(checksumText));

  const packageSha256 = sha256Hex(
    checksumEntries.map((entry) => `${entry.sha256}:${entry.path}:${entry.bytes}`).join("|")
  );
  const manifest: AuditManifest = {
    schemaVersion: "1.0.0",
    packageKind: "aec-audit-bundle",
    generatedAt,
    ...(input.generatedBy ? { generatedBy: input.generatedBy } : {}),
    projectId: input.project.id,
    validationRunId: input.snapshot.id,
    integrity: {
      method: "sha256-manifest",
      note: "Immutable snapshot with server-generated SHA-256 checksums. This package is not digitally signed."
    },
    files: [
      ...checksumEntries,
      {
        path: "CHECKSUMS.sha256",
        sha256: sha256Hex(files.get("CHECKSUMS.sha256")!),
        bytes: files.get("CHECKSUMS.sha256")!.byteLength
      }
    ],
    packageSha256
  };
  put("manifest.json", jsonBytes(manifest));

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const [path, bytes] of files) zip.file(path, bytes);
  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  return { zip: archive, manifest };
}

export function findingKeyForResult(result: Pick<ValidationResult, "requirementId" | "ruleId" | "affectedElementIds">): string {
  return findingKey(result);
}

export type { ValidationSeverity };
