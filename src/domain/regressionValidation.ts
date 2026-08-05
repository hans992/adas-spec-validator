import { calculateComplianceMetrics, type RequirementOutcome } from "@/domain/complianceMetrics";
import { compareSpecificationRequirements } from "@/domain/specificationComparison";
import {
  compareValidationSnapshots,
  type RequirementChange,
  type ValidationSnapshot
} from "@/domain/validationComparison";
import type {
  NormalizedModel,
  ValidationResult,
  ValidationSeverity,
  ValidationStatus
} from "@/domain/types";

export type ReviewStatus = "open" | "acknowledged" | "resolved" | "waived";

export interface RegressionReview {
  requirement_id: string;
  status: ReviewStatus;
  comment: string;
  updated_at: string;
}

/**
 * Project release gate. Every field is evaluated deterministically from stored
 * snapshots and reviews — never from an AI explanation.
 */
export interface ReleasePolicy {
  /** Block when the candidate introduces a critical-severity fail that the baseline did not have. */
  blockOnNewCritical: boolean;
  /** Block when evaluation coverage (determined / applicable) drops versus baseline. */
  blockOnDecreasedCoverage: boolean;
  /** Warn (not block) when the candidate introduces new unknown findings. */
  warnOnNewUnknown: boolean;
  /** When false, a critical fail that is waived still blocks release. */
  allowWaivedCritical: boolean;
  /** Max critical-severity fail findings allowed on the candidate (null = unlimited). */
  maxHighFindings: number | null;
  /** Max warning-severity fail findings allowed on the candidate (null = unlimited). */
  maxMediumFindings: number | null;
}

export const DEFAULT_RELEASE_POLICY: ReleasePolicy = {
  blockOnNewCritical: true,
  blockOnDecreasedCoverage: true,
  warnOnNewUnknown: true,
  allowWaivedCritical: false,
  maxHighFindings: null,
  maxMediumFindings: null
};

export type FindingDeltaKind = "new" | "resolved" | "reopened" | "changed" | "unchanged";

export interface FindingFingerprint {
  key: string;
  requirementId: string;
  ruleId: string;
  affectedElementIds: string[];
}

export interface FindingDelta {
  key: string;
  requirementId: string;
  ruleId: string;
  title: string;
  affectedElementIds: string[];
  kind: FindingDeltaKind;
  beforeStatus?: ValidationStatus;
  afterStatus?: ValidationStatus;
  beforeSeverity?: ValidationSeverity;
  afterSeverity?: ValidationSeverity;
  beforeSummary?: string;
  afterSummary?: string;
}

export interface ModelDelta {
  roomsDelta: number;
  doorsDelta: number;
  levelsDelta: number;
  addedRoomIds: string[];
  removedRoomIds: string[];
  addedDoorIds: string[];
  removedDoorIds: string[];
  addedLevelIds: string[];
  removedLevelIds: string[];
}

export type GateStatus = "pass" | "warn" | "block";

export interface PolicyViolation {
  code:
    | "new_critical_finding"
    | "decreased_coverage"
    | "new_unknown_finding"
    | "waived_critical_forbidden"
    | "max_high_findings"
    | "max_medium_findings";
  severity: "block" | "warn";
  message: string;
}

export interface ReleaseGateResult {
  status: GateStatus;
  violations: PolicyViolation[];
  policy: ReleasePolicy;
}

export interface RegressionReport {
  baselineId: string;
  candidateId: string;
  baselineModelName: string;
  candidateModelName: string;
  findings: FindingDelta[];
  findingCounts: Record<FindingDeltaKind, number>;
  requirementChanges: RequirementChange[];
  requirementCounts: Record<RequirementChange["kind"], number>;
  specificationChanges: Array<{ id: string; title: string; kind: "added" | "changed" | "removed" | "unchanged" }>;
  specificationCounts: Record<"added" | "changed" | "removed" | "unchanged", number>;
  model: ModelDelta;
  metrics: {
    beforePassRate: number | null;
    afterPassRate: number | null;
    passRateDelta: number | null;
    beforeCoverage: number | null;
    afterCoverage: number | null;
    coverageDelta: number | null;
  };
  gate: ReleaseGateResult;
}

export function findingKey(result: Pick<ValidationResult, "requirementId" | "ruleId" | "affectedElementIds">): string {
  const elements = [...result.affectedElementIds].sort().join(",");
  return `${result.requirementId}|${result.ruleId}|${elements}`;
}

function fingerprint(result: ValidationResult): FindingFingerprint {
  return {
    key: findingKey(result),
    requirementId: result.requirementId,
    ruleId: result.ruleId,
    affectedElementIds: [...result.affectedElementIds].sort()
  };
}

function isProblem(status: ValidationStatus): boolean {
  return status === "fail" || status === "unknown";
}

function classifyFinding(
  before: ValidationResult | undefined,
  after: ValidationResult | undefined
): FindingDeltaKind {
  if (!before && after) return "new";
  if (before && !after) return isProblem(before.status) ? "resolved" : "unchanged";
  if (!before || !after) return "unchanged";
  if (before.status === after.status && before.severity === after.severity && before.summary === after.summary) {
    return "unchanged";
  }
  if (isProblem(before.status) && !isProblem(after.status)) return "resolved";
  if (!isProblem(before.status) && after.status === "fail") return "reopened";
  if (before.status === "pass" && after.status === "unknown") return "changed";
  if (before.status !== "fail" && after.status === "fail") return "reopened";
  return "changed";
}

export function compareFindings(
  beforeResults: ValidationResult[],
  afterResults: ValidationResult[],
  titles: Map<string, string>
): FindingDelta[] {
  const beforeMap = new Map(beforeResults.map((result) => [findingKey(result), result]));
  const afterMap = new Map(afterResults.map((result) => [findingKey(result), result]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();

  return keys.map((key) => {
    const before = beforeMap.get(key);
    const after = afterMap.get(key);
    const sample = after ?? before!;
    const print = fingerprint(sample);
    return {
      key,
      requirementId: print.requirementId,
      ruleId: print.ruleId,
      title: titles.get(print.requirementId) ?? sample.requirementTitle,
      affectedElementIds: print.affectedElementIds,
      kind: classifyFinding(before, after),
      ...(before
        ? { beforeStatus: before.status, beforeSeverity: before.severity, beforeSummary: before.summary }
        : {}),
      ...(after
        ? { afterStatus: after.status, afterSeverity: after.severity, afterSummary: after.summary }
        : {})
    } satisfies FindingDelta;
  });
}

function idDelta(beforeIds: string[], afterIds: string[]): { added: string[]; removed: string[] } {
  const before = new Set(beforeIds);
  const after = new Set(afterIds);
  return {
    added: afterIds.filter((id) => !before.has(id)).sort(),
    removed: beforeIds.filter((id) => !after.has(id)).sort()
  };
}

export function compareModels(before: NormalizedModel, after: NormalizedModel): ModelDelta {
  const rooms = idDelta(before.rooms.map((room) => room.id), after.rooms.map((room) => room.id));
  const doors = idDelta(before.doors.map((door) => door.id), after.doors.map((door) => door.id));
  const levels = idDelta(before.levels.map((level) => level.id), after.levels.map((level) => level.id));
  return {
    roomsDelta: after.rooms.length - before.rooms.length,
    doorsDelta: after.doors.length - before.doors.length,
    levelsDelta: after.levels.length - before.levels.length,
    addedRoomIds: rooms.added,
    removedRoomIds: rooms.removed,
    addedDoorIds: doors.added,
    removedDoorIds: doors.removed,
    addedLevelIds: levels.added,
    removedLevelIds: levels.removed
  };
}

function countKinds<T extends string>(items: Array<{ kind: T }>, kinds: T[]): Record<T, number> {
  const counts = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<T, number>;
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/**
 * Pure release-gate evaluator. Same inputs always produce the same GateStatus.
 * Reviews are consulted only for the waived-critical rule; AI is never involved.
 */
export function evaluateReleasePolicy(input: {
  policy: ReleasePolicy;
  findings: FindingDelta[];
  candidateResults: ValidationResult[];
  beforeCoverage: number | null;
  afterCoverage: number | null;
  reviews?: RegressionReview[];
}): ReleaseGateResult {
  const { policy, findings, candidateResults, beforeCoverage, afterCoverage, reviews = [] } = input;
  const violations: PolicyViolation[] = [];
  const reviewByRequirement = new Map(reviews.map((review) => [review.requirement_id, review]));

  const newCritical = findings.filter(
    (finding) =>
      (finding.kind === "new" || finding.kind === "reopened") &&
      finding.afterStatus === "fail" &&
      finding.afterSeverity === "critical"
  );
  if (policy.blockOnNewCritical && newCritical.length > 0) {
    violations.push({
      code: "new_critical_finding",
      severity: "block",
      message: `${newCritical.length} new or reopened critical finding${newCritical.length === 1 ? "" : "s"} versus baseline.`
    });
  }

  if (
    policy.blockOnDecreasedCoverage &&
    beforeCoverage !== null &&
    afterCoverage !== null &&
    afterCoverage < beforeCoverage
  ) {
    violations.push({
      code: "decreased_coverage",
      severity: "block",
      message: `Evaluation coverage fell from ${beforeCoverage}% to ${afterCoverage}%.`
    });
  }

  const newUnknown = findings.filter(
    (finding) => finding.kind === "new" && finding.afterStatus === "unknown"
  );
  if (policy.warnOnNewUnknown && newUnknown.length > 0) {
    violations.push({
      code: "new_unknown_finding",
      severity: "warn",
      message: `${newUnknown.length} new unknown result${newUnknown.length === 1 ? "" : "s"} versus baseline.`
    });
  }

  const criticalFails = candidateResults.filter(
    (result) => result.status === "fail" && result.severity === "critical"
  );
  if (!policy.allowWaivedCritical) {
    const waivedCritical = criticalFails.filter((result) => {
      const review = reviewByRequirement.get(result.requirementId);
      return review?.status === "waived";
    });
    // Also block when critical fails exist and are waived — the forbid rule targets waived criticals.
    // When allowWaivedCritical is false: waived critical findings are not an acceptable release state.
    if (waivedCritical.length > 0) {
      violations.push({
        code: "waived_critical_forbidden",
        severity: "block",
        message: `${waivedCritical.length} waived critical finding${waivedCritical.length === 1 ? "" : "s"} are not allowed by project policy.`
      });
    }
  }

  const highFails = criticalFails.length;
  if (policy.maxHighFindings !== null && highFails > policy.maxHighFindings) {
    violations.push({
      code: "max_high_findings",
      severity: "block",
      message: `${highFails} high (critical) findings exceed the project limit of ${policy.maxHighFindings}.`
    });
  }

  const mediumFails = candidateResults.filter(
    (result) => result.status === "fail" && result.severity === "warning"
  ).length;
  if (policy.maxMediumFindings !== null && mediumFails > policy.maxMediumFindings) {
    violations.push({
      code: "max_medium_findings",
      severity: "block",
      message: `${mediumFails} medium (warning) findings exceed the project limit of ${policy.maxMediumFindings}.`
    });
  }

  const status: GateStatus = violations.some((item) => item.severity === "block")
    ? "block"
    : violations.some((item) => item.severity === "warn")
      ? "warn"
      : "pass";

  return { status, violations, policy };
}

export function buildRegressionReport(input: {
  baseline: ValidationSnapshot;
  candidate: ValidationSnapshot;
  policy?: ReleasePolicy;
  reviews?: RegressionReview[];
}): RegressionReport {
  const policy = input.policy ?? DEFAULT_RELEASE_POLICY;
  const { baseline, candidate, reviews = [] } = input;
  const titles = new Map<string, string>();
  for (const requirement of [...baseline.requirements, ...candidate.requirements]) {
    titles.set(requirement.id, requirement.title);
  }

  const findings = compareFindings(baseline.results, candidate.results, titles);
  const requirementChanges = compareValidationSnapshots(baseline, candidate).changes;
  const specificationChanges = compareSpecificationRequirements(baseline.requirements, candidate.requirements);
  const model = compareModels(baseline.normalized_model, candidate.normalized_model);

  const beforeMetrics = calculateComplianceMetrics(baseline.requirements, baseline.results);
  const afterMetrics = calculateComplianceMetrics(candidate.requirements, candidate.results);

  const gate = evaluateReleasePolicy({
    policy,
    findings,
    candidateResults: candidate.results,
    beforeCoverage: beforeMetrics.coverage,
    afterCoverage: afterMetrics.coverage,
    reviews
  });

  return {
    baselineId: baseline.id,
    candidateId: candidate.id,
    baselineModelName: baseline.model_name,
    candidateModelName: candidate.model_name,
    findings,
    findingCounts: countKinds(findings, ["new", "resolved", "reopened", "changed", "unchanged"]),
    requirementChanges,
    requirementCounts: countKinds(requirementChanges, ["resolved", "regressed", "changed", "unchanged", "added", "removed"]),
    specificationChanges,
    specificationCounts: countKinds(specificationChanges, ["added", "changed", "removed", "unchanged"]),
    model,
    metrics: {
      beforePassRate: beforeMetrics.passRate,
      afterPassRate: afterMetrics.passRate,
      passRateDelta:
        beforeMetrics.passRate === null || afterMetrics.passRate === null
          ? null
          : afterMetrics.passRate - beforeMetrics.passRate,
      beforeCoverage: beforeMetrics.coverage,
      afterCoverage: afterMetrics.coverage,
      coverageDelta:
        beforeMetrics.coverage === null || afterMetrics.coverage === null
          ? null
          : afterMetrics.coverage - beforeMetrics.coverage
    },
    gate
  };
}

/** Normalize partial/unknown JSON into a complete ReleasePolicy with defaults. */
export function normalizeReleasePolicy(value: unknown): ReleasePolicy {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const numberOrNull = (raw: unknown): number | null => {
    if (raw === null || raw === undefined || raw === "") return null;
    const number = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(number) || number < 0) return null;
    return Math.floor(number);
  };
  return {
    blockOnNewCritical: source.blockOnNewCritical !== false,
    blockOnDecreasedCoverage: source.blockOnDecreasedCoverage !== false,
    warnOnNewUnknown: source.warnOnNewUnknown !== false,
    allowWaivedCritical: source.allowWaivedCritical === true,
    maxHighFindings: numberOrNull(source.maxHighFindings),
    maxMediumFindings: numberOrNull(source.maxMediumFindings)
  };
}

/** Re-export outcome helper for callers that need requirement-level summaries beside findings. */
export type { RequirementOutcome };
