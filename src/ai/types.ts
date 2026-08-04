import { z } from "zod";
import { normalizedModelSchema, requirementsSchema } from "@/domain/schemas";
import type { NormalizedModel, Requirement, ValidationResult } from "@/domain/types";

export const adasRoleSchema = z.enum(["Design Engineer", "Stockroom Personnel", "Project Manager"]);

export type AdasRole = z.infer<typeof adasRoleSchema>;

export const adasChatRequestSchema = z.object({
  userQuestion: z.string().trim().min(1).max(1000),
  selectedRole: adasRoleSchema,
  normalizedModel: normalizedModelSchema,
  requirements: requirementsSchema
});

export const adasChatResponseSchema = z.object({
  answer: z.string(),
  metadata: z.object({
    mode: z.enum(["fallback", "ai"]),
    provider: z.enum(["gemini", "openai", "deterministic"]),
    model: z.string().optional()
  })
});

export const evidenceCitationSchema = z.object({
  requirementId: z.string().min(1),
  elementIds: z.array(z.string().min(1)).max(20)
});

export const providerAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8000),
  citations: z.array(evidenceCitationSchema).min(1).max(20)
});

export type AdasChatRequest = z.infer<typeof adasChatRequestSchema>;
export interface TrustedAdasChatInput {
  userQuestion: string;
  selectedRole: AdasRole;
  normalizedModel: NormalizedModel;
  requirements: Requirement[];
  validationResults: ValidationResult[];
}
export type AdasChatResponse = z.infer<typeof adasChatResponseSchema>;
export type ProviderAnswer = z.infer<typeof providerAnswerSchema>;
