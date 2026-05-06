import { ZodError } from "zod";
import { normalizedModelSchema, requirementsSchema } from "@/domain/schemas";
import type { NormalizedModel, Requirement } from "@/domain/types";

export type UploadParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function parseUploadedJson(rawText: string): UploadParseResult<unknown> {
  try {
    return { success: true, data: JSON.parse(rawText) };
  } catch {
    return { success: false, error: "Invalid JSON. Please upload a valid JSON file." };
  }
}

export function validateUploadedModel(rawData: unknown): UploadParseResult<NormalizedModel> {
  try {
    return { success: true, data: normalizedModelSchema.parse(rawData) };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: `Model schema error: ${error.issues[0]?.message ?? "Invalid model data."}` };
    }
    return { success: false, error: "Model validation failed." };
  }
}

export function validateUploadedRequirements(rawData: unknown): UploadParseResult<Requirement[]> {
  try {
    return { success: true, data: requirementsSchema.parse(rawData) };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: `Requirements schema error: ${error.issues[0]?.message ?? "Invalid requirements data."}`
      };
    }
    return { success: false, error: "Requirements validation failed." };
  }
}
