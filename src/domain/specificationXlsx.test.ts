import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  finalizeImportedRows,
  valuesToImportRow,
  type CanonicalField,
  type ImportRow
} from "@/domain/specificationRows";
import {
  analyzeSpecificationXlsx,
  exportSpecificationXlsx,
  validateXlsxEnvelope,
  type SheetAnalysis
} from "@/domain/specificationXlsx";

async function fixtureBuffer(): Promise<ArrayBuffer> {
  const data = await readFile(path.join(process.cwd(), "test", "fixtures", "aec-building-requirements.xlsx"));
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function mappedRows(sheet: SheetAnalysis): ImportRow[] {
  return sheet.rows
    .filter((row) => row.rowNumber > sheet.suggestedHeaderRow && !row.empty)
    .map((row) => {
      const values: Partial<Record<CanonicalField, string>> = {};
      const derived: CanonicalField[] = [];
      for (const mapping of sheet.suggestedMappings) {
        if (!mapping.field) continue;
        const cell = row.cells[mapping.columnIndex];
        values[mapping.field] = cell?.display ?? "";
        if (cell?.derived) derived.push(mapping.field);
      }
      return { ...valuesToImportRow(row.rowNumber, values, derived), reviewed: true };
    });
}

describe("secure XLSX analysis", () => {
  it("detects realistic sheets, headers, hidden data and stale formula results", async () => {
    const result = await analyzeSpecificationXlsx(
      await fixtureBuffer(),
      "../../aec-building-requirements.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.safeFileName).toBe("aec-building-requirements.xlsx");
    expect(result.data.sheets.map((sheet) => [sheet.name, sheet.hidden])).toEqual(expect.arrayContaining([
      ["Instructions", true],
      ["Requirements", false],
      ["Legacy archive", true]
    ]));
    const requirements = result.data.sheets.find((sheet) => sheet.name === "Requirements")!;
    expect(requirements.suggestedHeaderRow).toBe(3);
    expect(requirements.suggestedMappings.find((mapping) => mapping.field === "id")?.confidence).toBe("high");
    expect(requirements.hiddenColumns).toContain(15);
    expect(result.data.warnings.some((warning) => warning.includes("cached result may be stale"))).toBe(true);
  });

  it("rejects incorrect extension, MIME, magic bytes and invalid ZIPs", async () => {
    const fixture = await fixtureBuffer();
    expect(validateXlsxEnvelope(fixture, "requirements.xlsm").success).toBe(false);
    expect(validateXlsxEnvelope(fixture, "requirements.xlsx", "application/x-msdownload").success).toBe(false);
    expect(validateXlsxEnvelope(new Uint8Array([1, 2, 3, 4]).buffer, "requirements.xlsx").success).toBe(false);
    expect(validateXlsxEnvelope(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, "requirements.xlsx").success).toBe(false);
  });

  it("surfaces duplicate IDs, missing fields and formulas without cached values", async () => {
    const result = await analyzeSpecificationXlsx(await fixtureBuffer(), "requirements.xlsx");
    expect(result.success).toBe(true);
    if (!result.success) return;
    const problems = result.data.sheets.find((sheet) => sheet.name === "Problem Cases")!;
    const rows = mappedRows(problems);
    expect(rows.some((row) => row.errors.some((error) => error.includes("ID is required")))).toBe(true);
    const formulaCell = problems.rows.find((row) => row.rowNumber === 5)?.cells[4];
    expect(formulaCell?.derived).toBe(true);
    expect(formulaCell?.missingFormulaResult).toBe(true);
    const finalized = finalizeImportedRows("Problem package", "A", rows);
    expect(finalized.success).toBe(false);
    if (!finalized.success) expect(finalized.errors.some((error) => error.includes("Duplicate requirement ID"))).toBe(true);
  });
});

describe("XLSX requirement normalization and round trip", () => {
  it("imports over 100 requirements with dimension-safe decimal and unit conversion", async () => {
    const result = await analyzeSpecificationXlsx(await fixtureBuffer(), "requirements.xlsx");
    expect(result.success).toBe(true);
    if (!result.success) return;
    const rows = mappedRows(result.data.sheets.find((sheet) => sheet.name === "Requirements")!);
    const finalized = finalizeImportedRows("Riverside Office Building Specification", "C", rows);
    expect(finalized.success).toBe(true);
    if (!finalized.success) return;
    expect(finalized.data.requirements).toHaveLength(120);
    expect(finalized.data.requirements.find((requirement) => requirement.id === "AEC-0002")).toMatchObject({
      type: "minimum_room_area",
      minAreaSqm: 12.5,
      quantityType: "area",
      unit: "m²"
    });
    expect(finalized.data.requirements.find((requirement) => requirement.id === "AEC-0003")).toMatchObject({
      type: "minimum_door_width_for_room_type",
      minDoorWidthM: 0.9,
      quantityType: "length",
      unit: "cm"
    });
    expect(finalized.data.requirements.find((requirement) => requirement.id === "AEC-0010")).toMatchObject({
      type: "textual_requirement",
      automationStatus: "requires_rule_configuration"
    });
  });

  it("preserves the canonical package through export and re-import", async () => {
    const first = await analyzeSpecificationXlsx(await fixtureBuffer(), "requirements.xlsx");
    expect(first.success).toBe(true);
    if (!first.success) return;
    const initial = finalizeImportedRows(
      "Riverside Office Building Specification",
      "C",
      mappedRows(first.data.sheets.find((sheet) => sheet.name === "Requirements")!)
    );
    expect(initial.success).toBe(true);
    if (!initial.success) return;

    const exported = await exportSpecificationXlsx(initial.data);
    const exportedBuffer = Uint8Array.from(exported).buffer;
    const second = await analyzeSpecificationXlsx(exportedBuffer, "round-trip.xlsx");
    expect(second.success).toBe(true);
    if (!second.success) return;
    const requirements = second.data.sheets.find((sheet) => sheet.name === "Requirements")!;
    const imported = finalizeImportedRows(initial.data.name, initial.data.revision, mappedRows(requirements));
    expect(imported).toEqual({ success: true, data: initial.data });
  });
});
