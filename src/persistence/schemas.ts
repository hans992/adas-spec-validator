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
  comment: z.string().trim().max(2000),
  waiverReason: z.string().trim().min(1).max(2000).optional(),
  waiverExpiresAt: z.string().datetime().nullable().optional()
}).strict().superRefine((value, context) => {
  if (value.status === "waived" && !value.waiverReason) {
    context.addIssue({
      code: "custom",
      path: ["waiverReason"],
      message: "Waived decisions require a waiver reason."
    });
  }
  if (value.status !== "waived" && (value.waiverReason || value.waiverExpiresAt)) {
    context.addIssue({
      code: "custom",
      path: ["waiverReason"],
      message: "Waiver fields are only valid for waived decisions."
    });
  }
});

export const findingEvidenceSchema = z.object({
  requirementId: z.string().trim().min(1).max(200),
  ruleId: z.string().trim().min(1).max(200).optional(),
  findingKey: z.string().trim().min(1).max(500),
  kind: z.enum(["file", "screenshot", "model_element", "comment", "link", "technical_note"]),
  title: z.string().trim().min(1).max(200),
  comment: z.string().trim().max(4000).default(""),
  linkUrl: z.string().url().max(2048).optional(),
  technicalNote: z.string().trim().min(1).max(8000).optional(),
  modelElementId: z.string().trim().min(1).max(200).optional(),
  modelElementType: z.enum(["room", "door", "model"]).optional(),
  fileName: z.string().trim().min(1).max(255).optional(),
  fileMime: z.string().trim().min(1).max(120).optional(),
  fileContentBase64: z.string().min(1).max(7_000_000).optional()
}).strict().superRefine((value, context) => {
  if ((value.kind === "file" || value.kind === "screenshot") && (!value.fileName || !value.fileContentBase64)) {
    context.addIssue({ code: "custom", message: "File and screenshot evidence require fileName and fileContentBase64." });
  }
  if (value.kind === "model_element" && (!value.modelElementId || !value.modelElementType)) {
    context.addIssue({ code: "custom", message: "Model element evidence requires modelElementId and modelElementType." });
  }
  if (value.kind === "comment" && !value.comment.trim()) {
    context.addIssue({ code: "custom", path: ["comment"], message: "Comment evidence requires a comment." });
  }
  if (value.kind === "link" && !value.linkUrl) {
    context.addIssue({ code: "custom", path: ["linkUrl"], message: "Link evidence requires linkUrl." });
  }
  if (value.kind === "technical_note" && !value.technicalNote) {
    context.addIssue({ code: "custom", path: ["technicalNote"], message: "Technical note evidence requires technicalNote." });
  }
});

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

export const projectApiScopeSchema = z.enum([
  "models:read",
  "models:write",
  "specifications:read",
  "specifications:write",
  "runs:read",
  "runs:write",
  "regressions:read"
]);

export const createProjectApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(projectApiScopeSchema).min(1).max(7),
  expiresAt: z.string().datetime().nullable().optional()
}).strict();

export const createProjectWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(["validation.completed"])).min(1).default(["validation.completed"]),
  expiresAt: z.string().datetime().nullable().optional()
}).strict();

export const createPipelineRunSchema = z.object({
  modelId: z.string().uuid(),
  specificationId: z.string().uuid()
}).strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type SaveValidationInput = z.infer<typeof saveValidationSchema>;
export type SaveSpecificationPackageInput = z.infer<typeof saveSpecificationPackageSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export type ProjectInvitationInput = z.infer<typeof projectInvitationSchema>;
export type UpdateProjectSettingsInput = z.infer<typeof updateProjectSettingsSchema>;
export type ReleasePolicyInput = z.infer<typeof releasePolicySchema>;
export type ProjectApiScopeInput = z.infer<typeof projectApiScopeSchema>;
