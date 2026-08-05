import { z } from "zod";

import { normalizedModelSchema, requirementsSchema, specificationPackageSchema } from "@/domain/schemas";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional()
}).strict();

export const saveValidationSchema = z.object({
  modelName: z.string().trim().min(1).max(255),
  model: normalizedModelSchema,
  requirements: requirementsSchema
}).strict();

export const saveSpecificationPackageSchema = specificationPackageSchema;

export const reviewDecisionSchema = z.object({
  requirementId: z.string().trim().min(1).max(200),
  status: z.enum(["open", "acknowledged", "resolved", "waived"]),
  comment: z.string().trim().max(2000)
}).strict();

export const projectInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["viewer", "editor"])
}).strict();

export const projectMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["viewer", "editor"])
}).strict();

export const releasePolicySchema = z.object({
  blockOnNewCritical: z.boolean(),
  blockOnDecreasedCoverage: z.boolean(),
  warnOnNewUnknown: z.boolean(),
  allowWaivedCritical: z.boolean(),
  maxHighFindings: z.number().int().min(0).nullable(),
  maxMediumFindings: z.number().int().min(0).nullable()
}).strict();

export const updateProjectSettingsSchema = z.object({
  baselineValidationId: z.string().uuid().nullable().optional(),
  releasePolicy: releasePolicySchema.optional()
}).strict().refine(
  (value) => value.baselineValidationId !== undefined || value.releasePolicy !== undefined,
  { message: "Provide baselineValidationId and/or releasePolicy." }
);

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type SaveValidationInput = z.infer<typeof saveValidationSchema>;
export type SaveSpecificationPackageInput = z.infer<typeof saveSpecificationPackageSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export type ProjectInvitationInput = z.infer<typeof projectInvitationSchema>;
export type UpdateProjectSettingsInput = z.infer<typeof updateProjectSettingsSchema>;
export type ReleasePolicyInput = z.infer<typeof releasePolicySchema>;
