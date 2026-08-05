import { requirementSchema, specificationPackageSchema } from "@/domain/schemas";
import {
  PDF_PARSER_VERSION,
  type PdfExtraction,
  type PdfLanguage
} from "@/domain/specificationPdf";
import type {
  DocumentFragment,
  PdfDocumentSourceSnapshot,
  Requirement,
  RequirementAutomationStatus,
  SourceApproval,
  SpecificationPackage,
  ValidationSeverity
} from "@/domain/types";

export type RequirementDraftDecision = "pending" | "accepted" | "rejected";
export type RequirementDraftKind =
  | "candidate"
  | "informational"
  | "excluded"
  | "structural"
  | "ai_suggestion";

export interface FragmentTextRange {
  fragmentId: string;
  startOffset: number;
  endOffset: number;
  exactText: string;
}

export interface RequirementDraft {
  draftId: string;
  requirementId: string;
  title: string;
  description: string;
  severity: ValidationSeverity;
  status: RequirementAutomationStatus | "excluded" | "extracted";
  included: boolean;
  decision: RequirementDraftDecision;
  kind: RequirementDraftKind;
  sourceApproval: SourceApproval;
  fragmentIds: string[];
  textRanges: FragmentTextRange[];
  origin: "deterministic" | "ai_draft" | "user";
  pageNumber?: number;
  mergedFromDraftIds?: string[];
  splitFromDraftId?: string;
  superseded?: boolean;
  supersededByDraftIds?: string[];
  reviewed: boolean;
  errors: string[];
  warnings: string[];
}

function slugId(prefix: string, index: number, text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${prefix}-${String(index).padStart(3, "0")}${slug ? `-${slug}` : ""}`;
}

function titleFromText(text: string): string {
  return (text.split(/\n/)[0]?.trim() || text.trim()).slice(0, 160) || "Untitled requirement";
}

function pageOf(fragment: DocumentFragment): number | undefined {
  const anchor = fragment.sourceAnchor;
  if (anchor.kind === "pdf_text_block" || anchor.kind === "pdf_table_cell") return anchor.pageNumber;
  return undefined;
}

function isStructural(fragment: DocumentFragment): boolean {
  return fragment.kind === "heading" || fragment.kind === "subheading" || fragment.kind === "metadata";
}

function isCandidate(fragment: DocumentFragment): boolean {
  return (
    fragment.kind === "numbered_clause"
    || fragment.kind === "mandatory_candidate"
    || fragment.kind === "bullet_item"
    || (fragment.kind === "table_cell" && matchesLikelyRequirement(fragment.exactText))
  );
}

function matchesLikelyRequirement(text: string): boolean {
  return /\b(shall|must|muss|müssen|required|erforderlich|mora)\b/i.test(text);
}

export function createInitialPdfDrafts(extraction: PdfExtraction): RequirementDraft[] {
  const drafts: RequirementDraft[] = [];
  let candidateIndex = 1;
  for (const fragment of extraction.fragments) {
    const pageNumber = pageOf(fragment);
    if (isStructural(fragment)) {
      drafts.push({
        draftId: `draft-struct-${fragment.fragmentId}`,
        requirementId: slugId("STRUCT", drafts.length + 1, fragment.exactText),
        title: titleFromText(fragment.exactText),
        description: fragment.exactText,
        severity: "info",
        status: "informational",
        included: false,
        decision: "accepted",
        kind: "structural",
        sourceApproval: { status: "approved", approvedBy: "system", approvedAt: new Date().toISOString() },
        fragmentIds: [fragment.fragmentId],
        textRanges: [{
          fragmentId: fragment.fragmentId,
          startOffset: 0,
          endOffset: fragment.exactText.length,
          exactText: fragment.exactText
        }],
        origin: "deterministic",
        pageNumber,
        reviewed: true,
        errors: [],
        warnings: []
      });
      continue;
    }

    const candidate = isCandidate(fragment);
    if (candidate) candidateIndex += 1;
    const qualityWarning =
      fragment.extractionQuality === "sparse_text"
        ? ["Sparse digital text — verify against the source page preview."]
        : fragment.extractionQuality === "table_heuristic"
          ? ["Table cell extracted heuristically — verify column alignment on the source page."]
          : fragment.extractionQuality === "unreliable_layout"
            ? ["Layout confidence is low — verify wording on the source page."]
            : [];

    drafts.push({
      draftId: `draft-${fragment.fragmentId}`,
      requirementId: slugId(candidate ? "REQ" : "CLAUSE", candidate ? candidateIndex : drafts.length + 1, fragment.exactText),
      title: titleFromText(fragment.exactText),
      description: fragment.exactText,
      severity: candidate ? "warning" : "info",
      status: candidate ? "requires_rule_configuration" : "extracted",
      included: candidate,
      decision: candidate ? "pending" : "accepted",
      kind: candidate ? "candidate" : "informational",
      sourceApproval: { status: "pending" },
      fragmentIds: [fragment.fragmentId],
      textRanges: [{
        fragmentId: fragment.fragmentId,
        startOffset: 0,
        endOffset: fragment.exactText.length,
        exactText: fragment.exactText
      }],
      origin: "deterministic",
      pageNumber,
      reviewed: !candidate,
      errors: [],
      warnings: [
        ...qualityWarning,
        ...(fragment.languageHints?.length ? [`Mandatory phrasing hints: ${fragment.languageHints.join(", ")}.`] : []),
        ...(pageNumber ? [`Source page ${pageNumber}.`] : ["Missing PDF page anchor."])
      ]
    });
  }
  return drafts;
}

export function approvePdfDraftSource(
  draft: RequirementDraft,
  approvedBy: string,
  approved = true
): RequirementDraft {
  return {
    ...draft,
    sourceApproval: approved
      ? { status: "approved", approvedBy, approvedAt: new Date().toISOString() }
      : { status: "rejected", approvedBy, approvedAt: new Date().toISOString() },
    decision: approved ? "accepted" : "rejected",
    reviewed: true,
    ...(approved ? {} : { included: false, kind: "excluded" as const, status: "excluded" as const })
  };
}

export function confirmationBlockers(drafts: RequirementDraft[]): string[] {
  const blockers: string[] = [];
  const active = drafts.filter((draft) => !draft.superseded && draft.kind !== "structural");
  for (const draft of active) {
    if (draft.kind === "ai_suggestion" && draft.decision === "pending") {
      blockers.push(`${draft.requirementId}: AI draft must be accepted or rejected.`);
    }
    if (draft.included) {
      if (!draft.pageNumber) blockers.push(`${draft.requirementId}: included requirement must reference a PDF page.`);
      if (draft.sourceApproval.status !== "approved") {
        blockers.push(`${draft.requirementId}: included requirement needs an approved source.`);
      }
      if (draft.decision === "pending") blockers.push(`${draft.requirementId}: included draft must be accepted.`);
      if (draft.errors.length > 0) blockers.push(`${draft.requirementId}: ${draft.errors.join(" ")}`);
    } else if (draft.kind === "candidate" && draft.decision === "pending") {
      blockers.push(`${draft.requirementId}: candidate must be classified, excluded, or deferred.`);
    }
  }
  if (active.filter((draft) => draft.included).length === 0) {
    blockers.push("At least one included requirement is required.");
  }
  return [...new Set(blockers)];
}

function draftToRequirement(draft: RequirementDraft, fileName: string, revision: string): Requirement | null {
  const automationStatus: RequirementAutomationStatus =
    draft.status === "informational"
      ? "informational"
      : draft.status === "valid_requirement"
        ? "valid_requirement"
        : "requires_rule_configuration";
  const section = draft.pageNumber
    ? `page-${draft.pageNumber}`
    : draft.fragmentIds[0] ?? "unspecified";
  const candidate = {
    id: draft.requirementId,
    title: draft.title,
    type: "textual_requirement" as const,
    severity: draft.severity,
    description: draft.description,
    automationStatus,
    sourceFragmentIds: draft.fragmentIds,
    sourceApproval: draft.sourceApproval,
    provenance: {
      origin: draft.origin,
      ...(draft.mergedFromDraftIds ? { mergedFromDraftIds: draft.mergedFromDraftIds } : {}),
      ...(draft.splitFromDraftId ? { splitFromDraftId: draft.splitFromDraftId } : {}),
      ...(draft.supersededByDraftIds ? { supersededByDraftIds: draft.supersededByDraftIds } : {}),
      ...(draft.superseded ? { superseded: true } : {})
    },
    source: {
      document: fileName,
      section,
      revision
    },
    notes: draft.pageNumber ? `PDF page ${draft.pageNumber}` : undefined
  };
  const parsed = requirementSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function buildPdfDocumentSourceSnapshot(
  extraction: PdfExtraction,
  drafts: RequirementDraft[]
): PdfDocumentSourceSnapshot {
  const included = drafts.filter((draft) => draft.included && !draft.superseded);
  return {
    kind: "pdf",
    fileName: extraction.safeFileName,
    contentHash: extraction.contentHash,
    parserVersion: extraction.parserVersion || PDF_PARSER_VERSION,
    ...(extraction.language !== "unknown" ? { language: extraction.language } : {}),
    metadata: extraction.metadata,
    pageCount: extraction.pageCount,
    pages: extraction.pages,
    fragments: extraction.fragments,
    unsupportedContent: extraction.unsupportedContent,
    extractionMode: "digital_text_only",
    ocr: {
      enabled: false,
      note: "OCR for scanned PDFs is deferred. This package contains digital-text extraction only and must not be mixed with OCR output."
    },
    unreliableTableCount: extraction.unreliableTableCount,
    fragmentRequirementMap: included.map((draft) => ({
      requirementId: draft.requirementId,
      fragmentIds: draft.fragmentIds,
      textRanges: draft.textRanges
    }))
  };
}

export function finalizePdfImport(
  name: string,
  revision: string,
  extraction: PdfExtraction,
  drafts: RequirementDraft[]
): { success: true; data: SpecificationPackage } | { success: false; errors: string[] } {
  const blockers = confirmationBlockers(drafts);
  if (blockers.length > 0) return { success: false, errors: blockers };
  if (extraction.fragments.some((fragment) => fragment.ocrConfidence !== undefined)) {
    return { success: false, errors: ["OCR fragments cannot be mixed into a digital-text PDF import."] };
  }

  const included = drafts.filter((draft) => draft.included && !draft.superseded);
  const requirements: Requirement[] = [];
  const errors: string[] = [];
  for (const draft of included) {
    const requirement = draftToRequirement(draft, extraction.safeFileName, revision);
    if (!requirement) {
      errors.push(`${draft.requirementId}: could not build a valid textual requirement.`);
      continue;
    }
    requirements.push(requirement);
  }
  if (errors.length > 0) return { success: false, errors };

  const documentSource = buildPdfDocumentSourceSnapshot(extraction, drafts);
  const parsed = specificationPackageSchema.safeParse({
    name,
    revision,
    requirements,
    documentSource
  });
  return parsed.success
    ? { success: true, data: parsed.data }
    : {
        success: false,
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      };
}

export function withPdfLanguageOverride(
  extraction: PdfExtraction,
  language: PdfLanguage
): PdfExtraction {
  return { ...extraction, language };
}
