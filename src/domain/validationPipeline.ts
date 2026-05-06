import { normalizedModelSchema, requirementsSchema } from "@/domain/schemas";
import { runDeterministicValidation } from "@/domain/ruleEngine";
import type { NormalizedModel, Requirement, ValidationResult } from "@/domain/types";

export function validateWithDeterministicRules(
  modelInput: unknown,
  requirementsInput: unknown
): {
  model: NormalizedModel;
  requirements: Requirement[];
  results: ValidationResult[];
} {
  const model = normalizedModelSchema.parse(modelInput);
  const requirements = requirementsSchema.parse(requirementsInput);
  const results = runDeterministicValidation(model, requirements);

  return { model, requirements, results };
}
