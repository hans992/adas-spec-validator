import { analyzeSpecificationXlsx } from "@/domain/specificationXlsx";
import {
  finalizeImportedRows,
  valuesToImportRow,
  type CanonicalValues
} from "@/domain/specificationRows";
import {
  parseUploadedJson,
  parseUploadedSpecificationCsv,
  validateUploadedSpecification
} from "@/domain/uploadHelpers";
import type { SpecificationPackage } from "@/domain/types";

export async function parsePipelineSpecification(file: File): Promise<SpecificationPackage> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) {
    const json = parseUploadedJson(await file.text());
    if (!json.success) throw new Error(json.error);
    const specification = validateUploadedSpecification(json.data);
    if (!specification.success) throw new Error(specification.error);
    return specification.data;
  }
  if (lower.endsWith(".csv")) {
    const specification = parseUploadedSpecificationCsv(await file.text());
    if (!specification.success) throw new Error(specification.error);
    return specification.data;
  }
  if (!lower.endsWith(".xlsx")) {
    throw new Error("Specification must be canonical JSON, CSV, or XLSX.");
  }

  const analysis = await analyzeSpecificationXlsx(
    await file.arrayBuffer(),
    file.name,
    file.type
  );
  if (!analysis.success) throw new Error(analysis.error);
  const sheet = analysis.data.sheets.find((candidate) =>
    !candidate.hidden &&
    ["id", "title", "type", "severity"].every((required) =>
      candidate.suggestedMappings.some(
        (mapping) => mapping.field === required && mapping.confidence === "high"
      )
    ) &&
    candidate.suggestedMappings
      .filter((mapping) => mapping.field !== undefined)
      .every((mapping) => mapping.confidence === "high")
  );
  if (!sheet) {
    throw new Error(
      "XLSX requires a visible sheet with high-confidence canonical id, title, type, and severity mappings."
    );
  }

  const mappings = sheet.suggestedMappings.filter(
    (mapping): mapping is typeof mapping & { field: NonNullable<typeof mapping.field> } =>
      mapping.field !== undefined && mapping.confidence === "high"
  );
  const dataRows = sheet.rows.filter(
    (row) => row.rowNumber > sheet.suggestedHeaderRow && !row.empty
  );
  const imported = dataRows.map((row) => {
    const values: CanonicalValues = {};
    for (const mapping of mappings) {
      const cell = row.cells[mapping.columnIndex];
      if (cell?.missingFormulaResult) {
        throw new Error(`XLSX row ${row.rowNumber} contains a formula without a cached result.`);
      }
      values[mapping.field] = cell?.display ?? "";
    }
    return { ...valuesToImportRow(row.rowNumber, values), reviewed: true };
  });
  const names = new Set(imported.map((row) => row.values.specification_name).filter(Boolean));
  const revisions = new Set(imported.map((row) => row.values.specification_revision).filter(Boolean));
  if (names.size > 1 || revisions.size > 1) {
    throw new Error("XLSX package name and revision must be consistent across all rows.");
  }
  const finalized = finalizeImportedRows(
    [...names][0] ?? file.name.replace(/\.xlsx$/i, ""),
    [...revisions][0] ?? "Unspecified",
    imported
  );
  if (!finalized.success) {
    throw new Error(finalized.errors[0] ?? "Canonical XLSX requirements could not be validated.");
  }
  return finalized.data;
}
