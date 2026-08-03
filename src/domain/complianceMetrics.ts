import type { Requirement, ValidationResult, ValidationStatus } from "@/domain/types";

export type RequirementOutcome = "compliant" | "violation" | "unknown" | "not_applicable";

export interface RequirementAssessment {
  requirement: Requirement;
  outcome: RequirementOutcome;
  results: ValidationResult[];
}

export interface ComplianceMetrics {
  assessments: RequirementAssessment[];
  requirementCount: number;
  compliantRequirements: number;
  violatedRequirements: number;
  unknownRequirements: number;
  notApplicableRequirements: number;
  applicableRequirements: number;
  determinedRequirements: number;
  passRate: number | null;
  coverage: number | null;
  criticalFailures: number;
  resultCounts: Record<ValidationStatus, number>;
}

function outcomeFor(results: ValidationResult[]): RequirementOutcome {
  if (results.length === 0) return "unknown";
  if (results.some((result) => result.status === "fail")) return "violation";
  if (results.some((result) => result.status === "unknown")) return "unknown";
  if (results.every((result) => result.status === "not_applicable")) return "not_applicable";
  if (results.every((result) => result.status === "pass")) return "compliant";
  return "unknown";
}

export function calculateComplianceMetrics(
  requirements: Requirement[],
  results: ValidationResult[]
): ComplianceMetrics {
  const assessments = requirements.map((requirement) => {
    const requirementResults = results.filter((result) => result.requirementId === requirement.id);
    return { requirement, results: requirementResults, outcome: outcomeFor(requirementResults) };
  });

  const compliantRequirements = assessments.filter((item) => item.outcome === "compliant").length;
  const violatedRequirements = assessments.filter((item) => item.outcome === "violation").length;
  const unknownRequirements = assessments.filter((item) => item.outcome === "unknown").length;
  const notApplicableRequirements = assessments.filter((item) => item.outcome === "not_applicable").length;
  const applicableRequirements = requirements.length - notApplicableRequirements;
  const determinedRequirements = compliantRequirements + violatedRequirements;

  return {
    assessments,
    requirementCount: requirements.length,
    compliantRequirements,
    violatedRequirements,
    unknownRequirements,
    notApplicableRequirements,
    applicableRequirements,
    determinedRequirements,
    passRate: determinedRequirements > 0
      ? Math.round((compliantRequirements / determinedRequirements) * 100)
      : null,
    coverage: applicableRequirements > 0
      ? Math.round((determinedRequirements / applicableRequirements) * 100)
      : null,
    criticalFailures: assessments.filter(
      (item) => item.outcome === "violation" && item.requirement.severity === "critical"
    ).length,
    resultCounts: {
      pass: results.filter((result) => result.status === "pass").length,
      fail: results.filter((result) => result.status === "fail").length,
      unknown: results.filter((result) => result.status === "unknown").length,
      not_applicable: results.filter((result) => result.status === "not_applicable").length
    }
  };
}
