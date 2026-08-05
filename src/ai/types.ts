import { z } from "zod";
import { normalizedModelSchema, requirementsSchema } from "@/domain/schemas";
import type { NormalizedModel, Requirement, ValidationResult } from "@/domain/types";

export const aecRoleSchema = z.enum(["Design Engineer", "Stockroom Personnel", "Project Manager"]);

export type AecRole = z.infer<typeof aecRoleSchema>;

export const aecChatRequestSchema = z.object({
  userQuestion: z.string().trim().min(1).max(1000),
  selectedRole: aecRoleSchema,
  normalizedModel: normalizedModelSchema,
  requirements: requirementsSchema
});

export const aecChatResponseSchema = z.object({
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

export type AecChatRequest = z.infer<typeof aecChatRequestSchema>;
export interface TrustedAecChatInput {
  userQuestion: string;
  selectedRole: AecRole;
  normalizedModel: NormalizedModel;
  requirements: Requirement[];
  validationResults: ValidationResult[];
}
export type AecChatResponse = z.infer<typeof aecChatResponseSchema>;
export type ProviderAnswer = z.infer<typeof providerAnswerSchema>;
