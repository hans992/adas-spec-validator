import { requirementSchema, specificationPackageSchema } from "@/domain/schemas";
import {
  DOCX_PARSER_VERSION,
  type DocxExtraction,
  type DocxLanguage
} from "@/domain/specificationDocx";
import type {
  DocumentFragment,
  DocumentSourceSnapshot,
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${prefix}-${String(index).padStart(3, "0")}${slug ? `-${slug}` : ""}`;
}

function titleFromText(text: string): string {
  const firstLine = text.split(/\n/)[0]?.trim() ?? text.trim();
  return firstLine.slice(0, 160) || "Untitled requirement";
}

function isStructural(fragment: DocumentFragment): boolean {
  return fragment.kind === "heading" || fragment.kind === "subheading" || fragment.kind === "metadata";
}

function isCandidate(fragment: DocumentFragment): boolean {
  return (
    fragment.kind === "numbered_clause" ||
    fragment.kind === "mandatory_candidate" ||
    fragment.kind === "bullet_item" ||
    fragment.kind === "table_cell"
  );
}

export function createInitialDrafts(extraction: DocxExtraction): RequirementDraft[] {
  const drafts: RequirementDraft[] = [];
  let candidateIndex = 1;
  for (const fragment of extraction.fragments) {
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
        reviewed: true,
        errors: [],
        warnings: []
      });
      continue;
    }

    const candidate = isCandidate(fragment);
    const draftIndex = candidateIndex;
    if (candidate) candidateIndex += 1;
    const numbering = fragment.numberingLabel ? `${fragment.numberingLabel} ` : "";
    drafts.push({
      draftId: `draft-${fragment.fragmentId}`,
      requirementId: slugId(candidate ? "REQ" : "CLAUSE", draftIndex, fragment.exactText),
      title: titleFromText(`${numbering}${fragment.exactText}`),
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
        startOffset: fragment.sourceAnchor.kind === "paragraph"
          ? fragment.sourceAnchor.startOffset
          : fragment.sourceAnchor.startOffset ?? 0,
        endOffset: fragment.sourceAnchor.kind === "paragraph"
          ? fragment.sourceAnchor.endOffset
          : fragment.sourceAnchor.endOffset ?? fragment.exactText.length,
        exactText: fragment.exactText
      }],
      origin: "deterministic",
      reviewed: !candidate,
      errors: [],
      warnings: [
        ...(fragment.revisionContent ? ["Fragment includes Track Changes inserted text."] : []),
        ...(fragment.languageHints?.length
          ? [`Mandatory phrasing hints: ${fragment.languageHints.join(", ")}.`]
          : [])
      ]
    });
  }
  return drafts;
}

export function approveDraftSource(
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
    ...(approved ? {} : { included: false, kind: "excluded", status: "excluded" as const })
  };
}

export function mergeDrafts(
  drafts: RequirementDraft[],
  draftIds: string[],
  approvedBy: string
): RequirementDraft[] {
  const selected = drafts.filter((draft) => draftIds.includes(draft.draftId) && !draft.superseded);
  if (selected.length < 2) return drafts;
  const ordered = [...selected].sort(
    (left, right) => drafts.findIndex((draft) => draft.draftId === left.draftId)
      - drafts.findIndex((draft) => draft.draftId === right.draftId)
  );
  const fragmentIds = [...new Set(ordered.flatMap((draft) => draft.fragmentIds))];
  const textRanges = ordered.flatMap((draft) => draft.textRanges);
  const description = ordered.map((draft) => draft.description).join("\n\n");
  const merged: RequirementDraft = {
    draftId: `draft-merge-${ordered.map((draft) => draft.draftId).join("-").slice(0, 80)}`,
    requirementId: ordered[0].requirementId,
    title: ordered[0].title,
    description,
    severity: ordered.some((draft) => draft.severity === "critical")
      ? "critical"
      : ordered.some((draft) => draft.severity === "warning")
        ? "warning"
        : "info",
    status: "requires_rule_configuration",
    included: true,
    decision: "accepted",
    kind: "candidate",
    sourceApproval: { status: "approved", approvedBy, approvedAt: new Date().toISOString() },
    fragmentIds,
    textRanges,
    origin: "user",
    mergedFromDraftIds: ordered.map((draft) => draft.draftId),
    reviewed: true,
    errors: [],
    warnings: ["Merged from multiple source fragments; verify combined wording."]
  };
  return drafts.map((draft) => {
    if (!draftIds.includes(draft.draftId)) return draft;
    return {
      ...draft,
      superseded: true,
      included: false,
      supersededByDraftIds: [merged.draftId],
      decision: "accepted" as const,
      reviewed: true
    };
  }).concat(merged);
}

export function splitDraft(
  drafts: RequirementDraft[],
  draftId: string,
  splitOffset: number,
  approvedBy: string
): RequirementDraft[] {
  const original = drafts.find((draft) => draft.draftId === draftId && !draft.superseded);
  if (!original || original.textRanges.length !== 1) return drafts;
  const range = original.textRanges[0];
  if (splitOffset <= 0 || splitOffset >= range.exactText.length) return drafts;
  const leftText = range.exactText.slice(0, splitOffset).trimEnd();
  const rightText = range.exactText.slice(splitOffset).trimStart();
  if (!leftText || !rightText) return drafts;
  const leftOffsetEnd = range.startOffset + leftText.length;
  const rightOffsetStart = range.startOffset + (range.exactText.length - rightText.length);
  const left: RequirementDraft = {
    ...original,
    draftId: `${original.draftId}-a`,
    requirementId: `${original.requirementId}-a`,
    title: titleFromText(leftText),
    description: leftText,
    textRanges: [{
      fragmentId: range.fragmentId,
      startOffset: range.startOffset,
      endOffset: leftOffsetEnd,
      exactText: leftText
    }],
    origin: "user",
    splitFromDraftId: original.draftId,
    sourceApproval: { status: "approved", approvedBy, approvedAt: new Date().toISOString() },
    decision: "accepted",
    reviewed: true,
    superseded: false,
    warnings: ["Split from a shared source fragment; character ranges are preserved."]
  };
  const right: RequirementDraft = {
    ...original,
    draftId: `${original.draftId}-b`,
    requirementId: `${original.requirementId}-b`,
    title: titleFromText(rightText),
    description: rightText,
    textRanges: [{
      fragmentId: range.fragmentId,
      startOffset: rightOffsetStart,
      endOffset: range.endOffset,
      exactText: rightText
    }],
    origin: "user",
    splitFromDraftId: original.draftId,
    sourceApproval: { status: "approved", approvedBy, approvedAt: new Date().toISOString() },
    decision: "accepted",
    reviewed: true,
    superseded: false,
    warnings: ["Split from a shared source fragment; character ranges are preserved."]
  };
  return drafts.flatMap((draft) => {
    if (draft.draftId !== draftId) return [draft];
    return [
      {
        ...draft,
        superseded: true,
        included: false,
        supersededByDraftIds: [left.draftId, right.draftId],
        decision: "accepted" as const,
        reviewed: true
      },
      left,
      right
    ];
  });
}

export function validateCitationQuotes(
  fragments: DocumentFragment[],
  citations: Array<{
    fragmentId: string;
    quotes: Array<{ startOffset: number; endOffset: number; exactText: string }>;
  }>
): string[] {
  const errors: string[] = [];
  const byId = new Map(fragments.map((fragment) => [fragment.fragmentId, fragment]));
  for (const citation of citations) {
    const fragment = byId.get(citation.fragmentId);
    if (!fragment) {
      errors.push(`Unknown fragmentId '${citation.fragmentId}'.`);
      continue;
    }
    for (const quote of citation.quotes) {
      if (quote.startOffset < 0 || quote.endOffset > fragment.exactText.length || quote.startOffset >= quote.endOffset) {
        errors.push(`Invalid offsets for fragment '${citation.fragmentId}'.`);
        continue;
      }
      const slice = fragment.exactText.slice(quote.startOffset, quote.endOffset);
      if (slice !== quote.exactText) {
        errors.push(`Quote text does not match fragment '${citation.fragmentId}' at the given offsets.`);
      }
    }
  }
  return errors;
}

function draftToRequirement(draft: RequirementDraft, fileName: string, revision: string): Requirement | null {
  const automationStatus: RequirementAutomationStatus =
    draft.status === "informational"
      ? "informational"
      : draft.status === "valid_requirement"
        ? "valid_requirement"
        : "requires_rule_configuration";
  const section = draft.textRanges[0]?.fragmentId ?? draft.fragmentIds[0] ?? "unspecified";
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
    }
  };
  const parsed = requirementSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function confirmationBlockers(drafts: RequirementDraft[]): string[] {
  const blockers: string[] = [];
  const active = drafts.filter((draft) => !draft.superseded && draft.kind !== "structural");
  for (const draft of active) {
    if (draft.kind === "ai_suggestion" && draft.decision === "pending") {
      blockers.push(`${draft.requirementId}: AI draft must be accepted or rejected.`);
    }
    if (draft.included) {
      if (draft.sourceApproval.status !== "approved") {
        blockers.push(`${draft.requirementId}: included requirement needs an approved source.`);
      }
      if (draft.decision === "pending") {
        blockers.push(`${draft.requirementId}: included draft must be accepted.`);
      }
      if (draft.errors.length > 0) {
        blockers.push(`${draft.requirementId}: ${draft.errors.join(" ")}`);
      }
    } else if (draft.kind === "candidate" && draft.decision === "pending") {
      blockers.push(`${draft.requirementId}: candidate must be classified, excluded, or deferred.`);
    }
  }
  if (active.filter((draft) => draft.included).length === 0) {
    blockers.push("At least one included requirement is required.");
  }
  return [...new Set(blockers)];
}

export function buildDocumentSourceSnapshot(
  extraction: DocxExtraction,
  drafts: RequirementDraft[]
): DocumentSourceSnapshot {
  const included = drafts.filter((draft) => draft.included && !draft.superseded);
  return {
    kind: "docx",
    fileName: extraction.safeFileName,
    contentHash: extraction.contentHash,
    parserVersion: extraction.parserVersion || DOCX_PARSER_VERSION,
    ...(extraction.language !== "unknown" ? { language: extraction.language } : {}),
    metadata: extraction.metadata,
    fragments: extraction.fragments,
    unsupportedContent: extraction.unsupportedContent,
    trackChanges: extraction.trackChanges,
    fragmentRequirementMap: included.map((draft) => ({
      requirementId: draft.requirementId,
      fragmentIds: draft.fragmentIds,
      textRanges: draft.textRanges
    }))
  };
}

export function finalizeDocxImport(
  name: string,
  revision: string,
  extraction: DocxExtraction,
  drafts: RequirementDraft[]
): { success: true; data: SpecificationPackage } | { success: false; errors: string[] } {
  const blockers = confirmationBlockers(drafts);
  if (blockers.length > 0) return { success: false, errors: blockers };

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

  const documentSource = buildDocumentSourceSnapshot(extraction, drafts);
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

export function withLanguageOverride(
  extraction: DocxExtraction,
  language: DocxLanguage
): DocxExtraction {
  return { ...extraction, language };
}
