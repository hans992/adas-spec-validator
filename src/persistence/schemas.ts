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

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type SaveValidationInput = z.infer<typeof saveValidationSchema>;
