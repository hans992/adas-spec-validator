import { z } from "zod";

import { normalizedModelSchema, requirementsSchema } from "@/domain/schemas";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional()
}).strict();

export const saveValidationSchema = z.object({
  modelName: z.string().trim().min(1).max(255),
  model: normalizedModelSchema,
  requirements: requirementsSchema
}).strict();

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

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type SaveValidationInput = z.infer<typeof saveValidationSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export type ProjectInvitationInput = z.infer<typeof projectInvitationSchema>;
