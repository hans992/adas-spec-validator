import { createHash } from "node:crypto";

import type { Requirement, SpecificationPackage, ValidationResult } from "@/domain/types";

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inputFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export interface PipelineReport {
  runId: string;
  projectId: string;
  modelName: string;
  status: string;
  metrics: Record<string, unknown>;
  requirements: Requirement[];
  results: ValidationResult[];
  regression?: Record<string, unknown> | null;
}

function csv(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportPipelineCsv(report: PipelineReport): string {
  const headers = [
    "run_id", "requirement_id", "rule_id", "status", "severity", "element_type",
    "affected_element_ids", "summary", "evidence"
  ];
  const rows = report.results.map((result) => [
    report.runId,
    result.requirementId,
    result.ruleId,
    result.status,
    result.severity,
    result.elementType,
    result.affectedElementIds.join(";"),
    result.summary,
    result.evidence
  ].map(csv).join(","));
  return [headers.join(","), ...rows].join("\r\n");
}

export function exportPipelineSarif(report: PipelineReport): Record<string, unknown> {
  const requirements = new Map(report.requirements.map((requirement) => [requirement.id, requirement]));
  const failed = report.results.filter((result) => result.status === "fail" || result.status === "unknown");
  const rules = [...new Map(failed.map((result) => {
    const requirement = requirements.get(result.requirementId);
    return [result.ruleId, {
      id: result.ruleId,
      name: requirement?.title ?? result.requirementTitle,
      shortDescription: { text: requirement?.title ?? result.requirementTitle },
      fullDescription: { text: requirement?.description ?? result.summary },
      properties: {
        requirementId: result.requirementId,
        severity: result.severity,
        source: requirement?.source ?? null
      }
    }];
  })).values()];

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: {
        driver: {
          name: "AEC Spec Validator",
          informationUri: "https://github.com/hans992/aec-spec-validator",
          rules
        }
      },
      automationDetails: { id: report.runId },
      results: failed.map((result) => {
        const requirement = requirements.get(result.requirementId);
        const source = requirement?.source;
        return {
          ruleId: result.ruleId,
          level: result.status === "unknown"
            ? "note"
            : result.severity === "critical" ? "error" : result.severity === "warning" ? "warning" : "note",
          message: { text: result.summary },
          locations: result.affectedElementIds.map((elementId) => ({
            logicalLocations: [{
              name: elementId,
              fullyQualifiedName: `${result.elementType}:${elementId}`,
              kind: result.elementType
            }]
          })),
          properties: {
            requirementId: result.requirementId,
            affectedElementIds: result.affectedElementIds,
            evidence: result.evidence,
            sourceDocument: source?.document ?? null,
            sourceSection: source?.section ?? null,
            sourceRevision: source?.revision ?? null
          }
        };
      })
    }]
  };
}

export function pipelineSpecificationIdentity(specification: SpecificationPackage): {
  name: string;
  revision: string;
} {
  return { name: specification.name, revision: specification.revision };
}
