import { calculateComplianceMetrics, type RequirementOutcome } from "@/domain/complianceMetrics";
import type { NormalizedModel, Requirement, ValidationResult } from "@/domain/types";

export interface ValidationSnapshot {
  id: string;
  model_name: string;
  normalized_model: NormalizedModel;
  requirements: Requirement[];
  results: ValidationResult[];
  created_at: string;
}

export type RequirementChangeKind = "resolved" | "regressed" | "changed" | "unchanged" | "added" | "removed";

export interface RequirementChange {
  requirementId: string;
  title: string;
  before: RequirementOutcome | "missing";
  after: RequirementOutcome | "missing";
  kind: RequirementChangeKind;
}

export interface ValidationComparison {
  beforePassRate: number | null;
  afterPassRate: number | null;
  passRateDelta: number | null;
  roomsDelta: number;
  doorsDelta: number;
  levelsDelta: number;
  changes: RequirementChange[];
  counts: Record<RequirementChangeKind, number>;
}

function classify(before: RequirementOutcome | "missing", after: RequirementOutcome | "missing"): RequirementChangeKind {
  if (before === "missing") return "added";
  if (after === "missing") return "removed";
  if (before === after) return "unchanged";
  if (before === "violation" && after === "compliant") return "resolved";
  if (before === "compliant" && after === "violation") return "regressed";
  return "changed";
}

export function compareValidationSnapshots(before: ValidationSnapshot, after: ValidationSnapshot): ValidationComparison {
  const beforeMetrics = calculateComplianceMetrics(before.requirements, before.results);
  const afterMetrics = calculateComplianceMetrics(after.requirements, after.results);
  const beforeOutcomes = new Map(beforeMetrics.assessments.map((item) => [item.requirement.id, item.outcome]));
  const afterOutcomes = new Map(afterMetrics.assessments.map((item) => [item.requirement.id, item.outcome]));
  const requirements = new Map<string, Requirement>();
  for (const requirement of before.requirements) requirements.set(requirement.id, requirement);
  for (const requirement of after.requirements) requirements.set(requirement.id, requirement);

  const changes = [...requirements.values()].map((requirement) => {
    const beforeOutcome = beforeOutcomes.get(requirement.id) ?? "missing";
    const afterOutcome = afterOutcomes.get(requirement.id) ?? "missing";
    return {
      requirementId: requirement.id,
      title: requirement.title,
      before: beforeOutcome,
      after: afterOutcome,
      kind: classify(beforeOutcome, afterOutcome)
    } satisfies RequirementChange;
  });

  const counts: ValidationComparison["counts"] = {
    resolved: 0, regressed: 0, changed: 0, unchanged: 0, added: 0, removed: 0
  };
  for (const change of changes) counts[change.kind] += 1;

  return {
    beforePassRate: beforeMetrics.passRate,
    afterPassRate: afterMetrics.passRate,
    passRateDelta: beforeMetrics.passRate === null || afterMetrics.passRate === null
      ? null
      : afterMetrics.passRate - beforeMetrics.passRate,
    roomsDelta: after.normalized_model.rooms.length - before.normalized_model.rooms.length,
    doorsDelta: after.normalized_model.doors.length - before.normalized_model.doors.length,
    levelsDelta: after.normalized_model.levels.length - before.normalized_model.levels.length,
    changes,
    counts
  };
}
