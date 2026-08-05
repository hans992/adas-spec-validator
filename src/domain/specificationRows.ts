import { requirementSchema, specificationPackageSchema } from "@/domain/schemas";
import type {
  QuantityType,
  Requirement,
  RequirementAutomationStatus,
  SpecificationPackage,
  ValidationSeverity
} from "@/domain/types";

export type MappingConfidence = "high" | "medium" | "low" | "unmapped";
export type ImportRowStatus =
  | "extracted"
  | "valid_requirement"
  | "informational"
  | "requires_rule_configuration"
  | "ready_for_validation"
  | "excluded";
export type ExclusionReason =
  | "empty"
  | "informational"
  | "section_header"
  | "duplicate"
  | "not_applicable"
  | "excluded_by_user";

export const canonicalFields = [
  "id",
  "title",
  "description",
  "discipline",
  "type",
  "severity",
  "target_type",
  "minimum",
  "maximum",
  "unit",
  "quantity_type",
  "source_document",
  "source_section",
  "source_revision",
  "notes",
  "derived_fields",
  "quantifier",
  "operator",
  "conditions_json",
  "specification_name",
  "specification_revision"
] as const;

export type CanonicalField = typeof canonicalFields[number];
export type CanonicalValues = Partial<Record<CanonicalField, string>>;

export interface ColumnMapping {
  columnIndex: number;
  header: string;
  field?: CanonicalField;
  confidence: MappingConfidence;
  reason: string;
  accepted: boolean;
}

export interface ImportRow {
  sourceRow: number;
  values: CanonicalValues;
  status: ImportRowStatus;
  included: boolean;
  exclusionReason?: ExclusionReason;
  errors: string[];
  warnings: string[];
  derivedFields: CanonicalField[];
  reviewed: boolean;
  requirement?: Requirement;
}

const aliases: Record<CanonicalField, string[]> = {
  id: ["requirement id", "requirement_id", "req id", "req_id", "identifier", "clause id", "code"],
  title: ["requirement", "requirement title", "name", "clause", "subject"],
  description: ["details", "requirement description", "text", "clause text", "requirement text"],
  discipline: ["trade", "category", "domain"],
  type: ["rule type", "requirement type", "validation type"],
  severity: ["priority", "criticality", "risk"],
  target_type: ["room type", "room_type", "element type", "element_type", "target", "target type"],
  minimum: ["min", "minimum value", "min value", "lower bound", "min_area_sqm", "min_door_width_m"],
  maximum: ["max", "maximum value", "max value", "upper bound", "max_area_sqm", "max_door_width_m"],
  unit: ["units", "measurement unit", "uom"],
  quantity_type: ["quantity type", "quantity_type", "measure type", "dimension"],
  source_document: ["source document", "document", "specification", "source"],
  source_section: ["source section", "section", "clause number", "paragraph"],
  source_revision: ["source revision", "document revision", "source rev"],
  notes: ["note", "comments", "comment", "remarks"],
  derived_fields: ["derived fields", "formula fields", "calculated fields"],
  quantifier: ["door quantifier", "any all"],
  operator: ["logical operator", "and or"],
  conditions_json: ["conditions", "conditions json", "composite conditions"],
  specification_name: ["specification name", "package name", "spec name"],
  specification_revision: ["specification revision", "package revision", "spec revision"]
};

function normalizedHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function suggestColumnMappings(headers: string[]): ColumnMapping[] {
  const used = new Set<CanonicalField>();
  return headers.map((header, columnIndex) => {
    const normalized = normalizedHeader(header);
    let best: { field?: CanonicalField; confidence: MappingConfidence; score: number; reason: string } = {
      confidence: "unmapped",
      score: 0,
      reason: "No known column name matched."
    };

    for (const field of canonicalFields) {
      const candidates = [field, ...aliases[field]].map(normalizedHeader);
      const exactIndex = candidates.indexOf(normalized);
      if (exactIndex >= 0) {
        const score = exactIndex === 0 ? 100 : 92;
        if (score > best.score) best = {
          field,
          confidence: "high",
          score,
          reason: exactIndex === 0 ? "Exact canonical header." : "Exact recognized alias."
        };
        continue;
      }
      const headerTokens = new Set(normalized.split(" ").filter(Boolean));
      const overlap = Math.max(...candidates.map((candidate) => {
        const tokens = candidate.split(" ").filter(Boolean);
        return tokens.length === 0 ? 0 : tokens.filter((token) => headerTokens.has(token)).length / tokens.length;
      }));
      if (overlap >= 0.75 && 75 > best.score) {
        best = { field, confidence: "medium", score: 75, reason: "Most header tokens match a known alias." };
      } else if (overlap >= 0.5 && 50 > best.score) {
        best = { field, confidence: "low", score: 50, reason: "Partial header token match; review required." };
      }
    }

    if (!best.field || used.has(best.field)) {
      return {
        columnIndex,
        header,
        confidence: "unmapped",
        reason: best.field ? `Duplicate suggestion for '${best.field}'.` : best.reason,
        accepted: false
      };
    }
    used.add(best.field);
    return {
      columnIndex,
      header,
      field: best.field,
      confidence: best.confidence,
      reason: best.reason,
      accepted: best.confidence === "high"
    };
  });
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseLocalizedNumber(value: string | undefined): number | undefined {
  const raw = optionalText(value);
  if (!raw) return undefined;
  const compact = raw.replace(/\s/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = compact.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeUnit(value: string | undefined): string | undefined {
  const unit = optionalText(value)?.toLowerCase().replace(/\s/g, "");
  if (!unit) return undefined;
  if (["m2", "m²", "sqm"].includes(unit)) return "m²";
  return unit;
}

function inferQuantityType(type: string, unit?: string): QuantityType {
  if (type === "minimum_room_area") return "area";
  if (type === "minimum_door_width_for_room_type") return "length";
  if (unit === "m²") return "area";
  if (["mm", "cm", "m"].includes(unit ?? "")) return "length";
  return "untyped";
}

function convertToCanonical(value: number | undefined, unit: string | undefined, quantityType: QuantityType): number | undefined {
  if (value === undefined || Number.isNaN(value)) return value;
  if (quantityType === "length") {
    if (unit === "mm") return value / 1000;
    if (unit === "cm") return value / 100;
    if (unit === undefined || unit === "m") return value;
    return Number.NaN;
  }
  if (quantityType === "area") return unit === undefined || unit === "m²" ? value : Number.NaN;
  return value;
}

function normalizeRuleType(value: string | undefined): string {
  const normalized = normalizedHeader(value ?? "").replace(/ /g, "_");
  const map: Record<string, string> = {
    room_area: "minimum_room_area",
    minimum_area: "minimum_room_area",
    minimum_room_area: "minimum_room_area",
    door_width: "minimum_door_width_for_room_type",
    minimum_door_width: "minimum_door_width_for_room_type",
    minimum_door_width_for_room_type: "minimum_door_width_for_room_type",
    connected_door: "room_has_connected_door",
    room_has_connected_door: "room_has_connected_door",
    composite: "composite_room_rule",
    composite_room_rule: "composite_room_rule",
    informational: "textual_requirement",
    textual_requirement: "textual_requirement"
  };
  return map[normalized] ?? normalized;
}

export function valuesToImportRow(
  sourceRow: number,
  values: CanonicalValues,
  derivedFields: CanonicalField[] = [],
  statusOverride?: ImportRowStatus
): ImportRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = optionalText(values.id);
  const title = optionalText(values.title);
  if (!id) errors.push("Requirement ID is required.");
  if (!title) errors.push("Title is required.");

  const rawType = normalizeRuleType(values.type);
  const executableTypes = new Set([
    "minimum_room_area",
    "minimum_door_width_for_room_type",
    "room_has_connected_door",
    "composite_room_rule"
  ]);
  const type = executableTypes.has(rawType) ? rawType : "textual_requirement";
  const unit = normalizeUnit(values.unit);
  const declaredQuantity = optionalText(values.quantity_type)?.toLowerCase() as QuantityType | undefined;
  const validQuantityTypes = new Set<QuantityType>(["length", "area", "volume", "count", "percentage", "angle", "untyped"]);
  const quantityType = declaredQuantity && validQuantityTypes.has(declaredQuantity)
    ? declaredQuantity
    : inferQuantityType(type, unit);
  if (declaredQuantity && !validQuantityTypes.has(declaredQuantity)) errors.push(`Unsupported quantity type '${declaredQuantity}'.`);

  const minimum = convertToCanonical(parseLocalizedNumber(values.minimum), unit, quantityType);
  const maximum = convertToCanonical(parseLocalizedNumber(values.maximum), unit, quantityType);
  if (Number.isNaN(minimum)) errors.push("Minimum value or unit is invalid for the selected quantity type.");
  if (Number.isNaN(maximum)) errors.push("Maximum value or unit is invalid for the selected quantity type.");
  const persistedDerivedFields = optionalText(values.derived_fields)
    ?.split(/[;,]/)
    .map((field) => field.trim())
    .filter((field): field is CanonicalField => canonicalFields.includes(field as CanonicalField)) ?? [];
  const allDerivedFields = [...new Set([...derivedFields, ...persistedDerivedFields])];
  if (allDerivedFields.length > 0) warnings.push(`Formula-derived values may be stale: ${allDerivedFields.join(", ")}.`);
  if (rawType && type === "textual_requirement" && rawType !== "textual_requirement") {
    warnings.push(`Unknown rule type '${values.type}' was preserved as a textual requirement.`);
  }
  if (!rawType) warnings.push("No executable rule type was supplied.");

  const severityValue = optionalText(values.severity)?.toLowerCase() ?? "warning";
  const severity: ValidationSeverity = ["info", "warning", "critical"].includes(severityValue)
    ? severityValue as ValidationSeverity
    : "warning";
  if (severityValue !== severity) warnings.push(`Unknown severity '${values.severity}' defaulted to warning.`);
  const sourceDocument = optionalText(values.source_document);
  const sourceSection = optionalText(values.source_section);
  if (Boolean(sourceDocument) !== Boolean(sourceSection)) errors.push("Source document and source section must be supplied together.");
  const source = sourceDocument && sourceSection
    ? { document: sourceDocument, section: sourceSection, ...(optionalText(values.source_revision) ? { revision: optionalText(values.source_revision) } : {}) }
    : undefined;
  const metadata = {
    ...(optionalText(values.description) ? { description: optionalText(values.description) } : {}),
    ...(optionalText(values.discipline) ? { discipline: optionalText(values.discipline) } : {}),
    ...(optionalText(values.target_type) ? { elementType: optionalText(values.target_type) } : {}),
    quantityType,
    ...(unit ? { unit } : {}),
    ...(optionalText(values.notes) ? { notes: optionalText(values.notes) } : {}),
    ...(allDerivedFields.length > 0 ? { derivedFields: allDerivedFields } : {}),
    ...(source ? { source } : {})
  };
  const common = { id: id ?? "", title: title ?? "", severity, ...metadata };
  let candidate: unknown;
  let status: ImportRowStatus;

  if (type === "minimum_room_area") {
    candidate = {
      ...common,
      type,
      automationStatus: "ready_for_validation",
      roomType: optionalText(values.target_type) ?? "unknown",
      minAreaSqm: minimum,
      ...(maximum !== undefined ? { maxAreaSqm: maximum } : {})
    };
    status = "ready_for_validation";
  } else if (type === "minimum_door_width_for_room_type") {
    candidate = {
      ...common,
      type,
      automationStatus: "ready_for_validation",
      roomType: optionalText(values.target_type) ?? "unknown",
      minDoorWidthM: minimum,
      ...(maximum !== undefined ? { maxDoorWidthM: maximum } : {}),
      ...(optionalText(values.quantifier) ? { quantifier: optionalText(values.quantifier)?.toLowerCase() } : {})
    };
    status = "ready_for_validation";
  } else if (type === "room_has_connected_door") {
    candidate = { ...common, type, automationStatus: "ready_for_validation" };
    status = "ready_for_validation";
  } else if (type === "composite_room_rule") {
    let conditions: unknown;
    try { conditions = JSON.parse(values.conditions_json ?? ""); } catch { errors.push("Composite conditions must be valid JSON."); }
    candidate = {
      ...common,
      type,
      automationStatus: "ready_for_validation",
      roomType: optionalText(values.target_type) ?? "unknown",
      operator: optionalText(values.operator)?.toLowerCase(),
      conditions
    };
    status = "ready_for_validation";
  } else {
    const automationStatus: RequirementAutomationStatus =
      statusOverride === "informational"
        ? "informational"
        : statusOverride === "valid_requirement"
          ? "valid_requirement"
          : optionalText(values.type)?.toLowerCase() === "informational"
            ? "informational"
          : "requires_rule_configuration";
    candidate = { ...common, type: "textual_requirement", automationStatus };
    status = automationStatus;
  }

  const parsed = requirementSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${issue.path.join(".") || "row"}: ${issue.message}`);
  }

  return {
    sourceRow,
    values,
    status,
    included: true,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    derivedFields: allDerivedFields,
    reviewed: warnings.length === 0,
    ...(parsed.success ? { requirement: parsed.data } : {})
  };
}

export function finalizeImportedRows(
  name: string,
  revision: string,
  rows: ImportRow[]
): { success: true; data: SpecificationPackage } | { success: false; errors: string[] } {
  const errors: string[] = [];
  const included = rows.filter((row) => row.included);
  for (const row of rows.filter((candidate) => !candidate.included)) {
    if (!row.exclusionReason) errors.push(`Row ${row.sourceRow}: excluded rows require a reason.`);
  }
  for (const row of included) {
    if (row.errors.length > 0 || !row.requirement) errors.push(`Row ${row.sourceRow}: ${row.errors.join(" ") || "Requirement is invalid."}`);
    if (row.warnings.length > 0 && !row.reviewed) errors.push(`Row ${row.sourceRow}: warnings must be explicitly reviewed.`);
  }
  const duplicateIds = new Set<string>();
  const seen = new Set<string>();
  for (const row of included) {
    const id = row.requirement?.id;
    if (!id) continue;
    if (seen.has(id)) duplicateIds.add(id);
    seen.add(id);
  }
  for (const id of duplicateIds) errors.push(`Duplicate requirement ID: ${id}`);
  if (included.length === 0) errors.push("At least one included requirement is required.");
  if (errors.length > 0) return { success: false, errors };
  const parsed = specificationPackageSchema.safeParse({
    name,
    revision,
    requirements: included.map((row) => row.requirement)
  });
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}
