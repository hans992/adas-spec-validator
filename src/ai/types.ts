import { z } from "zod";
import { normalizedModelSchema } from "@/domain/schemas";

const validationStatusSchema = z.enum(["pass", "fail", "unknown"]);
const validationSeveritySchema = z.enum(["info", "warning", "critical"]);

const evidenceItemSchema = z.object({
  message: z.string(),
  observed: z.union([z.string(), z.number(), z.null()]).optional(),
  expected: z.union([z.string(), z.number(), z.null()]).optional(),
  field: z.string().optional()
});

const validationResultSchema = z.object({
  ruleId: z.string(),
  requirementId: z.string(),
  requirementTitle: z.string(),
  elementType: z.enum(["room", "door", "model"]),
  status: validationStatusSchema,
  severity: validationSeveritySchema,
  summary: z.string(),
  affectedElementIds: z.array(z.string()),
  evidence: z.array(evidenceItemSchema)
});

export const adasRoleSchema = z.enum(["Design Engineer", "Stockroom Personnel", "Project Manager"]);

export type AdasRole = z.infer<typeof adasRoleSchema>;

export const adasChatRequestSchema = z.object({
  userQuestion: z.string().min(1),
  selectedRole: adasRoleSchema,
  normalizedModel: normalizedModelSchema,
  validationResults: z.array(validationResultSchema)
});

export const adasChatResponseSchema = z.object({
  answer: z.string(),
  metadata: z.object({
    mode: z.enum(["fallback", "ai"])
  })
});

export type AdasChatRequest = z.infer<typeof adasChatRequestSchema>;
export type AdasChatResponse = z.infer<typeof adasChatResponseSchema>;
