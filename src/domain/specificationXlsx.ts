import {
  suggestColumnMappings,
  type CanonicalField,
  type ColumnMapping
} from "@/domain/specificationRows";
import type { Requirement, SpecificationPackage } from "@/domain/types";

export const XLSX_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxZipEntries: 500,
  maxSheets: 20,
  maxRowsPerSheet: 5000,
  maxCells: 100_000,
  parseTimeoutMs: 8000
} as const;

export interface SpreadsheetCell {
  display: string;
  formula?: string;
  derived: boolean;
  missingFormulaResult: boolean;
  merged: boolean;
}

export interface SpreadsheetRow {
  rowNumber: number;
  cells: SpreadsheetCell[];
  empty: boolean;
}

export interface SheetAnalysis {
  name: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  hiddenColumns: number[];
  rows: SpreadsheetRow[];
  suggestedHeaderRow: number;
  suggestedMappings: ColumnMapping[];
}

export interface WorkbookAnalysis {
  safeFileName: string;
  sheets: SheetAnalysis[];
  warnings: string[];
}

export type XlsxAnalysisResult =
  | { success: true; data: WorkbookAnalysis }
  | { success: false; error: string };

type ZipInspection = {
  entryCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  names: string[];
};

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return (base || "requirements.xlsx").slice(0, 180);
}

function inspectZip(buffer: ArrayBuffer): ZipInspection {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const names: string[] = [];
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let entryCount = 0;

  for (let offset = 0; offset <= view.byteLength - 46;) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (offset + recordLength > view.byteLength) throw new Error("The XLSX ZIP directory is malformed.");
    names.push(decoder.decode(new Uint8Array(buffer, offset + 46, nameLength)));
    compressedBytes += compressed;
    uncompressedBytes += uncompressed;
    entryCount += 1;
    if (entryCount > XLSX_LIMITS.maxZipEntries) throw new Error(`XLSX contains more than ${XLSX_LIMITS.maxZipEntries} ZIP entries.`);
    if (uncompressedBytes > XLSX_LIMITS.maxUncompressedBytes) throw new Error("XLSX expands beyond the 50 MB safety limit.");
    offset += recordLength;
  }
  if (entryCount === 0) throw new Error("The file is not a valid XLSX ZIP archive.");
  if (compressedBytes > 0 && uncompressedBytes / compressedBytes > XLSX_LIMITS.maxCompressionRatio) {
    throw new Error("XLSX compression ratio exceeds the ZIP-bomb safety limit.");
  }
  return { entryCount, compressedBytes, uncompressedBytes, names };
}

export function validateXlsxEnvelope(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType = ""
): { success: true; safeFileName: string } | { success: false; error: string } {
  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName.toLowerCase().endsWith(".xlsx")) {
    return { success: false, error: "Only macro-free .xlsx files are accepted; .xls and .xlsm are rejected." };
  }
  if (buffer.byteLength === 0 || buffer.byteLength > XLSX_LIMITS.maxFileBytes) {
    return { success: false, error: "XLSX must be non-empty and no larger than 10 MB." };
  }
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return { success: false, error: "XLSX magic bytes are invalid." };
  }
  const allowedMimes = new Set([
    "",
    "application/octet-stream",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]);
  if (!allowedMimes.has(mimeType.toLowerCase())) {
    return { success: false, error: `Unsupported XLSX MIME type '${mimeType}'.` };
  }
  try {
    const zip = inspectZip(buffer);
    const names = zip.names.map((name) => name.toLowerCase());
    if (names.some((name) => name.endsWith("vbaproject.bin") || name.includes("/macrosheets/"))) {
      return { success: false, error: "Macro-enabled workbooks are not accepted." };
    }
    if (names.some((name) => name.startsWith("xl/externallinks/"))) {
      return { success: false, error: "Workbooks with external links are not accepted." };
    }
    if (!names.includes("[content_types].xml") || !names.includes("xl/workbook.xml")) {
      return { success: false, error: "The ZIP archive does not contain a valid XLSX workbook." };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "XLSX ZIP validation failed." };
  }
  return { success: true, safeFileName };
}

function cellDisplay(value: unknown): {
  display: string;
  formula?: string;
  derived: boolean;
  missingFormulaResult: boolean;
} {
  if (value === null || value === undefined) return { display: "", derived: false, missingFormulaResult: false };
  if (value instanceof Date) return { display: value.toISOString(), derived: false, missingFormulaResult: false };
  if (typeof value === "object") {
    const candidate = value as {
      formula?: string;
      sharedFormula?: string;
      result?: unknown;
      richText?: Array<{ text?: string }>;
      text?: string;
      hyperlink?: string;
    };
    const formula = candidate.formula ?? candidate.sharedFormula;
    if (formula) {
      if (/\[[^\]]+\]|https?:\/\//i.test(formula)) throw new Error("Formulas with external references are not accepted.");
      const result = candidate.result;
      const display = result === null || result === undefined
        ? ""
        : typeof result === "object"
          ? JSON.stringify(result)
          : String(result);
      return { display, formula, derived: true, missingFormulaResult: display === "" };
    }
    if (candidate.richText) return {
      display: candidate.richText.map((part) => part.text ?? "").join(""),
      derived: false,
      missingFormulaResult: false
    };
    if (candidate.text !== undefined) return { display: String(candidate.text), derived: false, missingFormulaResult: false };
    if (candidate.hyperlink !== undefined) return { display: String(candidate.text ?? ""), derived: false, missingFormulaResult: false };
  }
  return { display: String(value), derived: false, missingFormulaResult: false };
}

function scoreHeader(headers: string[], mappings: ColumnMapping[]): number {
  const mappedScore = mappings.reduce((sum, mapping) => sum + (
    mapping.confidence === "high" ? 4 : mapping.confidence === "medium" ? 2 : mapping.confidence === "low" ? 1 : 0
  ), 0);
  const fields = new Set(mappings.map((mapping) => mapping.field));
  const required = (fields.has("id") ? 8 : 0) + (fields.has("title") ? 8 : 0);
  const density = headers.filter((header) => header.trim()).length / Math.max(headers.length, 1);
  return mappedScore + required + density;
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("XLSX parsing exceeded the 8 second safety timeout.")), XLSX_LIMITS.parseTimeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function analyzeSpecificationXlsx(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType = ""
): Promise<XlsxAnalysisResult> {
  const envelope = validateXlsxEnvelope(buffer, fileName, mimeType);
  if (!envelope.success) return envelope;
  try {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    await withTimeout(workbook.xlsx.load(buffer));
    if (workbook.worksheets.length === 0) return { success: false, error: "XLSX contains no worksheets." };
    if (workbook.worksheets.length > XLSX_LIMITS.maxSheets) {
      return { success: false, error: `XLSX contains more than ${XLSX_LIMITS.maxSheets} worksheets.` };
    }

    let totalCells = 0;
    const warnings: string[] = [];
    const sheets: SheetAnalysis[] = workbook.worksheets.map((worksheet) => {
      const rowCount = worksheet.rowCount;
      const columnCount = worksheet.actualColumnCount;
      if (rowCount > XLSX_LIMITS.maxRowsPerSheet) throw new Error(`Sheet '${worksheet.name}' exceeds ${XLSX_LIMITS.maxRowsPerSheet} rows.`);
      totalCells += worksheet.actualRowCount * columnCount;
      if (totalCells > XLSX_LIMITS.maxCells) throw new Error(`Workbook exceeds ${XLSX_LIMITS.maxCells.toLocaleString()} populated cells.`);
      const hiddenColumns: number[] = [];
      for (let column = 1; column <= columnCount; column += 1) {
        if (worksheet.getColumn(column).hidden) hiddenColumns.push(column);
      }
      const rows: SpreadsheetRow[] = [];
      for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
        const cells: SpreadsheetCell[] = [];
        for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
          const cell = worksheet.getCell(rowNumber, columnNumber);
          const displayed = cellDisplay(cell.value);
          if (displayed.derived) warnings.push(`Sheet '${worksheet.name}' cell ${cell.address} contains a formula; cached result may be stale.`);
          cells.push({ ...displayed, merged: cell.isMerged });
        }
        rows.push({ rowNumber, cells, empty: cells.every((cell) => cell.display.trim() === "") });
      }
      let suggestedHeaderRow = 1;
      let suggestedMappings: ColumnMapping[] = [];
      let bestScore = -1;
      for (const row of rows.slice(0, 50)) {
        const headers = row.cells.map((cell) => cell.display);
        const mappings = suggestColumnMappings(headers);
        const score = scoreHeader(headers, mappings);
        if (score > bestScore) {
          bestScore = score;
          suggestedHeaderRow = row.rowNumber;
          suggestedMappings = mappings;
        }
      }
      const hidden = worksheet.state !== "visible";
      if (hidden) warnings.push(`Sheet '${worksheet.name}' is hidden and will not be selected automatically.`);
      if (hiddenColumns.length > 0) warnings.push(`Sheet '${worksheet.name}' contains ${hiddenColumns.length} hidden column(s).`);
      return { name: worksheet.name, hidden, rowCount, columnCount, hiddenColumns, rows, suggestedHeaderRow, suggestedMappings };
    });
    return { success: true, data: { safeFileName: envelope.safeFileName, sheets, warnings: [...new Set(warnings)] } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "XLSX parsing failed." };
  }
}

function displayNumber(value: number | undefined, unit: string | undefined, quantityType: string | undefined): string {
  if (value === undefined) return "";
  if (quantityType === "length") {
    if (unit === "mm") return String(value * 1000);
    if (unit === "cm") return String(value * 100);
  }
  return String(value);
}

function requirementToRow(requirement: Requirement, specification: SpecificationPackage): Record<CanonicalField, string> {
  const minimum = requirement.type === "minimum_room_area"
    ? requirement.minAreaSqm
    : requirement.type === "minimum_door_width_for_room_type"
      ? requirement.minDoorWidthM
      : undefined;
  const maximum = requirement.type === "minimum_room_area"
    ? requirement.maxAreaSqm
    : requirement.type === "minimum_door_width_for_room_type"
      ? requirement.maxDoorWidthM
      : undefined;
  const targetType = "roomType" in requirement ? requirement.roomType : requirement.elementType ?? "";
  return {
    id: requirement.id,
    title: requirement.title,
    description: requirement.description ?? "",
    discipline: requirement.discipline ?? "",
    type: requirement.type,
    severity: requirement.severity,
    target_type: targetType,
    minimum: displayNumber(minimum, requirement.unit, requirement.quantityType),
    maximum: displayNumber(maximum, requirement.unit, requirement.quantityType),
    unit: requirement.unit ?? "",
    quantity_type: requirement.quantityType ?? "",
    source_document: requirement.source?.document ?? "",
    source_section: requirement.source?.section ?? "",
    source_revision: requirement.source?.revision ?? "",
    notes: requirement.notes ?? "",
    derived_fields: requirement.derivedFields?.join("; ") ?? "",
    quantifier: "quantifier" in requirement ? requirement.quantifier ?? "" : "",
    operator: "operator" in requirement ? requirement.operator : "",
    conditions_json: "conditions" in requirement ? JSON.stringify(requirement.conditions) : "",
    specification_name: specification.name,
    specification_revision: specification.revision
  };
}

export async function exportSpecificationXlsx(specification: SpecificationPackage): Promise<Uint8Array> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "AEC Spec Validator";
  workbook.created = new Date();
  const metadata = workbook.addWorksheet("Package");
  metadata.addRows([
    ["Specification name", specification.name],
    ["Specification revision", specification.revision],
    ["Requirement count", specification.requirements.length]
  ]);
  const sheet = workbook.addWorksheet("Requirements");
  const headers: CanonicalField[] = [
    "id", "title", "description", "discipline", "type", "severity", "target_type",
    "minimum", "maximum", "unit", "quantity_type", "source_document", "source_section",
    "source_revision", "notes", "derived_fields", "quantifier", "operator", "conditions_json",
    "specification_name", "specification_revision"
  ];
  sheet.addRow(headers);
  for (const requirement of specification.requirements) {
    const record = requirementToRow(requirement, specification);
    sheet.addRow(headers.map((header) => record[header]));
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 18; });
  const output = await workbook.xlsx.writeBuffer();
  return new Uint8Array(output);
}
