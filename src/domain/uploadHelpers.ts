import { ZodError } from "zod";
import { normalizedModelSchema, requirementsSchema, specificationPackageSchema } from "@/domain/schemas";
import type { NormalizedModel, Requirement, SpecificationPackage } from "@/domain/types";

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

function parseCsvRows(rawText: string): UploadParseResult<string[][]> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];
    if (character === '"') {
      if (quoted && rawText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && rawText[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) return { success: false, error: "Invalid CSV: a quoted field is not closed." };
  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows.length > 0
    ? { success: true, data: rows }
    : { success: false, error: "Invalid CSV: the file is empty." };
}

const csvRequiredHeaders = ["id", "title", "type", "severity"] as const;

function optionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseUploadedSpecificationCsv(rawText: string): UploadParseResult<SpecificationPackage> {
  const parsedRows = parseCsvRows(rawText.replace(/^\uFEFF/, ""));
  if (!parsedRows.success) return parsedRows;

  const [headerRow, ...dataRows] = parsedRows.data;
  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const duplicateHeader = headers.find((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeader) return { success: false, error: `Invalid CSV: duplicate header '${duplicateHeader}'.` };
  const missingHeader = csvRequiredHeaders.find((header) => !headers.includes(header));
  if (missingHeader) return { success: false, error: `Invalid CSV: missing required header '${missingHeader}'.` };
  if (dataRows.length === 0) return { success: false, error: "Invalid CSV: at least one requirement row is required." };
  const malformedRowIndex = dataRows.findIndex((values) => values.length !== headers.length);
  if (malformedRowIndex >= 0) {
    return { success: false, error: `Invalid CSV: row ${malformedRowIndex + 2} has ${dataRows[malformedRowIndex].length} fields; expected ${headers.length}.` };
  }

  const records = dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  const names = new Set(records.map((record) => record.specification_name).filter(Boolean));
  const revisions = new Set(records.map((record) => record.specification_revision).filter(Boolean));
  if (names.size > 1 || revisions.size > 1) {
    return { success: false, error: "Invalid CSV: specification name and revision must be consistent across all rows." };
  }
  const incompleteSourceIndex = records.findIndex((record) => Boolean(record.source_document) !== Boolean(record.source_section));
  if (incompleteSourceIndex >= 0) {
    return { success: false, error: `Invalid CSV: row ${incompleteSourceIndex + 2} must provide both source_document and source_section.` };
  }

  const requirements = records.map((record) => {
    const source = record.source_document && record.source_section
      ? { document: record.source_document, section: record.source_section, ...(record.source_revision ? { revision: record.source_revision } : {}) }
      : undefined;
    const common = { id: record.id, title: record.title, type: record.type, severity: record.severity, ...(source ? { source } : {}) };
    if (record.type === "minimum_room_area") {
      return { ...common, roomType: record.room_type, minAreaSqm: optionalNumber(record.min_area_sqm), maxAreaSqm: optionalNumber(record.max_area_sqm) };
    }
    if (record.type === "minimum_door_width_for_room_type") {
      return { ...common, roomType: record.room_type, minDoorWidthM: optionalNumber(record.min_door_width_m), maxDoorWidthM: optionalNumber(record.max_door_width_m), ...(record.quantifier ? { quantifier: record.quantifier } : {}) };
    }
    if (record.type === "composite_room_rule") {
      let conditions: unknown = undefined;
      try { conditions = JSON.parse(record.conditions_json || ""); } catch { /* reported by schema validation */ }
      return { ...common, roomType: record.room_type, operator: record.operator, conditions };
    }
    return common;
  });

  return validateUploadedSpecification({
    name: [...names][0] ?? "Imported CSV requirements",
    revision: [...revisions][0] ?? "Unspecified",
    requirements
  });
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

export function validateUploadedSpecification(rawData: unknown): UploadParseResult<SpecificationPackage> {
  const packaged = specificationPackageSchema.safeParse(rawData);
  if (packaged.success) return { success: true, data: packaged.data };

  const legacy = requirementsSchema.safeParse(rawData);
  if (legacy.success) {
    return {
      success: true,
      data: { name: "Imported requirements", revision: "Unspecified", requirements: legacy.data }
    };
  }

  return {
    success: false,
    error: `Specification package schema error: ${packaged.error.issues[0]?.message ?? "Invalid specification data."}`
  };
}
