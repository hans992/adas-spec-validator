"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canonicalFields,
  finalizeImportedRows,
  suggestColumnMappings,
  valuesToImportRow,
  type CanonicalField,
  type ColumnMapping,
  type ExclusionReason,
  type ImportRow,
  type ImportRowStatus
} from "@/domain/specificationRows";
import {
  analyzeSpecificationXlsx,
  type SheetAnalysis,
  type WorkbookAnalysis
} from "@/domain/specificationXlsx";
import type { SpecificationPackage } from "@/domain/types";

const PAGE_SIZE = 25;
const exclusionReasons: ExclusionReason[] = [
  "empty", "informational", "section_header", "duplicate", "not_applicable", "excluded_by_user"
];
const textualStatuses: ImportRowStatus[] = [
  "valid_requirement", "informational", "requires_rule_configuration"
];

type ConfirmMeta = {
  fileName: string;
  includedRows: number;
  excludedRows: Array<{ sourceRow: number; reason: ExclusionReason }>;
};

export function XlsxImportWizard({
  onConfirm,
  onClose,
  initialFile
}: {
  onConfirm: (specification: SpecificationPackage, meta: ConfirmMeta) => Promise<void> | void;
  onClose: () => void;
  initialFile?: File | null;
}) {
  const [analysis, setAnalysis] = useState<WorkbookAnalysis | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [name, setName] = useState("Imported XLSX requirements");
  const [revision, setRevision] = useState("Draft");
  const [filter, setFilter] = useState<"all" | "errors" | "warnings" | "excluded">("all");
  const [page, setPage] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [batchField, setBatchField] = useState<"discipline" | "severity" | "unit">("discipline");
  const [batchValue, setBatchValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadedInitialFile, setLoadedInitialFile] = useState(false);

  const selectedSheet = analysis?.sheets.find((sheet) => sheet.name === sheetName) ?? null;
  const activeFields = useMemo(
    () => [...new Set(mappings.map((mapping) => mapping.field).filter((field): field is CanonicalField => Boolean(field)))],
    [mappings]
  );
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (filter === "errors") return row.included && row.errors.length > 0;
    if (filter === "warnings") return row.included && row.warnings.length > 0;
    if (filter === "excluded") return !row.included;
    return true;
  }), [filter, rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const counts = useMemo(() => ({
    valid: rows.filter((row) => row.included && row.errors.length === 0 && row.warnings.length === 0).length,
    warning: rows.filter((row) => row.included && row.errors.length === 0 && row.warnings.length > 0).length,
    blocked: rows.filter((row) => row.included && row.errors.length > 0).length,
    excluded: rows.filter((row) => !row.included).length
  }), [rows]);

  async function loadFile(file: File) {
    setBusy(true);
    setError("");
    setRows([]);
    try {
      const result = await analyzeSpecificationXlsx(await file.arrayBuffer(), file.name, file.type);
      if (!result.success) throw new Error(result.error);
      setAnalysis(result.data);
      const visibleSheets = result.data.sheets.filter((sheet) => !sheet.hidden);
      const firstVisible = visibleSheets
        .filter((sheet) => {
          const fields = new Set(sheet.suggestedMappings.map((mapping) => mapping.field));
          return fields.has("id") && fields.has("title");
        })
        .sort((left, right) =>
          right.suggestedMappings.filter((mapping) => mapping.field).length -
          left.suggestedMappings.filter((mapping) => mapping.field).length
        )[0] ?? visibleSheets[0] ?? result.data.sheets[0];
      selectSheet(firstVisible, result.data);
    } catch (cause) {
      setAnalysis(null);
      setError(cause instanceof Error ? cause.message : "XLSX could not be analyzed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialFile && !loadedInitialFile) {
      setLoadedInitialFile(true);
      void loadFile(initialFile);
    }
  }, [initialFile, loadedInitialFile]);

  function selectSheet(sheet: SheetAnalysis, workbook = analysis) {
    setSheetName(sheet.name);
    setHeaderRow(sheet.suggestedHeaderRow);
    setMappings(sheet.suggestedMappings);
    setRows([]);
    setPage(0);
    setSelectedRows(new Set());
    const packageSheet = workbook?.sheets.find((candidate) => candidate.name.toLowerCase() === "package");
    if (packageSheet) {
      const metadata = new Map(packageSheet.rows.map((row) => [row.cells[0]?.display.toLowerCase(), row.cells[1]?.display]));
      setName(metadata.get("specification name") || "Imported XLSX requirements");
      setRevision(metadata.get("specification revision") || "Draft");
    }
  }

  function changeHeaderRow(nextRow: number) {
    if (!selectedSheet) return;
    const row = selectedSheet.rows.find((candidate) => candidate.rowNumber === nextRow);
    setHeaderRow(nextRow);
    setMappings(suggestColumnMappings(row?.cells.map((cell) => cell.display) ?? []));
    setRows([]);
  }

  function changeMapping(index: number, field: CanonicalField | "") {
    setMappings((current) => current.map((mapping, mappingIndex) => {
      if (field && mappingIndex !== index && mapping.field === field) {
        return { ...mapping, field: undefined, confidence: "unmapped", accepted: false, reason: "Replaced by manual mapping." };
      }
      if (mappingIndex !== index) return mapping;
      return field
        ? { ...mapping, field, confidence: "low", accepted: false, reason: "Manual mapping; explicit acceptance required." }
        : { ...mapping, field: undefined, confidence: "unmapped", accepted: false, reason: "Column intentionally left unmapped." };
    }));
    setRows([]);
  }

  function buildPreview() {
    if (!selectedSheet) return;
    const mappedFields = new Set(mappings.map((mapping) => mapping.field));
    if (!mappedFields.has("id") || !mappedFields.has("title")) {
      setError("Requirement ID and title columns must be mapped.");
      return;
    }
    if (mappings.some((mapping) => mapping.field && mapping.confidence !== "high" && !mapping.accepted)) {
      setError("Accept every medium/low confidence mapping before building the preview.");
      return;
    }
    const nextRows = selectedSheet.rows
      .filter((row) => row.rowNumber > headerRow)
      .map((source) => {
        const values: Partial<Record<CanonicalField, string>> = {};
        const derivedFields: CanonicalField[] = [];
        const formulaErrors: string[] = [];
        for (const mapping of mappings) {
          if (!mapping.field) continue;
          const cell = source.cells[mapping.columnIndex];
          values[mapping.field] = cell?.display ?? "";
          if (cell?.derived) derivedFields.push(mapping.field);
          if (cell?.missingFormulaResult) formulaErrors.push(`${mapping.field}: formula has no cached result.`);
        }
        const imported = valuesToImportRow(source.rowNumber, values, derivedFields);
        if (source.empty) {
          return { ...imported, included: false, status: "excluded" as const, exclusionReason: "empty" as const };
        }
        return formulaErrors.length > 0
          ? { ...imported, errors: [...imported.errors, ...formulaErrors] }
          : imported;
      });
    setRows(nextRows);
    setError("");
    setPage(0);
  }

  function updateRow(sourceRow: number, field: CanonicalField, value: string) {
    setRows((current) => current.map((row) => {
      if (row.sourceRow !== sourceRow) return row;
      const values = { ...row.values, [field]: value };
      const refreshed = valuesToImportRow(row.sourceRow, values, row.derivedFields, row.status);
      return { ...refreshed, included: row.included, exclusionReason: row.exclusionReason, reviewed: false };
    }));
  }

  function setRowStatus(sourceRow: number, status: ImportRowStatus) {
    setRows((current) => current.map((row) => {
      if (row.sourceRow !== sourceRow) return row;
      return { ...valuesToImportRow(row.sourceRow, row.values, row.derivedFields, status), reviewed: false };
    }));
  }

  function toggleIncluded(sourceRow: number) {
    setRows((current) => current.map((row) => {
      if (row.sourceRow !== sourceRow) return row;
      if (row.included) return { ...row, included: false, status: "excluded", exclusionReason: row.exclusionReason ?? "excluded_by_user" };
      const restored = valuesToImportRow(row.sourceRow, row.values, row.derivedFields);
      return { ...restored, included: true, exclusionReason: undefined };
    }));
  }

  function applyBatch() {
    if (!batchValue.trim() || selectedRows.size === 0) return;
    setRows((current) => current.map((row) => {
      if (!selectedRows.has(row.sourceRow)) return row;
      const values = { ...row.values, [batchField]: batchValue };
      const refreshed = valuesToImportRow(row.sourceRow, values, row.derivedFields, row.status);
      return { ...refreshed, included: row.included, exclusionReason: row.exclusionReason, reviewed: false };
    }));
  }

  async function confirm() {
    const result = finalizeImportedRows(name, revision, rows);
    if (!result.success) {
      setError(result.errors.slice(0, 5).join(" "));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(result.data, {
        fileName: analysis?.safeFileName ?? "requirements.xlsx",
        includedRows: rows.filter((row) => row.included).length,
        excludedRows: rows
          .filter((row): row is ImportRow & { exclusionReason: ExclusionReason } => !row.included && Boolean(row.exclusionReason))
          .map((row) => ({ sourceRow: row.sourceRow, reason: row.exclusionReason }))
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-indigo-300 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-4 w-4" /> XLSX specification import</CardTitle><CardDescription>Analyze, map, edit and explicitly confirm every imported requirement.</CardDescription></div>
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close XLSX importer"><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-left">
        <label className="block rounded border border-dashed p-4 text-xs">
          <span className="font-semibold">Select a macro-free .xlsx file (maximum 10 MB)</span>
          <input className="mt-2 block w-full text-xs" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadFile(file);
          }} />
        </label>
        {busy && <p className="flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing workbook…</p>}
        {error && <p className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}

        {analysis && selectedSheet && <>
          {analysis.warnings.length > 0 && <details className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"><summary>{analysis.warnings.length} workbook warning(s)</summary><ul className="mt-2 list-disc pl-5">{analysis.warnings.slice(0, 30).map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs">Worksheet<select className="mt-1 h-9 w-full rounded border bg-transparent px-2" value={sheetName} onChange={(event) => {
              const sheet = analysis.sheets.find((candidate) => candidate.name === event.target.value);
              if (sheet) selectSheet(sheet);
            }}>{analysis.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}{sheet.hidden ? " (hidden — review)" : ""}</option>)}</select></label>
            <label className="text-xs">Header row<input className="mt-1 h-9 w-full rounded border bg-transparent px-2" type="number" min={1} max={Math.min(50, selectedSheet.rowCount)} value={headerRow} onChange={(event) => changeHeaderRow(Number(event.target.value))} /></label>
            <div className="text-xs"><p>Sheet limits</p><p className="mt-2 font-mono">{selectedSheet.rowCount} rows · {selectedSheet.columnCount} columns · {selectedSheet.hiddenColumns.length} hidden columns</p></div>
          </div>

          <div className="overflow-x-auto rounded border">
            <table className="w-full min-w-[760px] text-xs"><thead><tr className="bg-slate-50"><th className="p-2 text-left">Workbook column</th><th className="p-2 text-left">Map to</th><th className="p-2 text-left">Confidence</th><th className="p-2 text-left">Review</th></tr></thead><tbody>{mappings.map((mapping, index) => <tr key={`${mapping.columnIndex}-${mapping.header}`} className="border-t"><td className="p-2">{mapping.header || `Column ${mapping.columnIndex + 1}`}</td><td className="p-2"><select className="h-8 w-full rounded border bg-transparent px-2" value={mapping.field ?? ""} onChange={(event) => changeMapping(index, event.target.value as CanonicalField | "")}><option value="">Unmapped</option>{canonicalFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></td><td className="p-2"><span className="font-mono">{mapping.confidence}</span><p className="text-[10px] text-slate-500">{mapping.reason}</p></td><td className="p-2">{mapping.field && mapping.confidence !== "high" && <label className="flex items-center gap-2"><input type="checkbox" checked={mapping.accepted} onChange={(event) => setMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, accepted: event.target.checked } : item))} /> Accept</label>}</td></tr>)}</tbody></table>
          </div>
          <Button onClick={buildPreview}>Build editable preview</Button>
        </>}

        {rows.length > 0 && <>
          <div className="grid gap-2 sm:grid-cols-4">{Object.entries(counts).map(([label, value]) => <button type="button" key={label} onClick={() => { setFilter(label === "blocked" ? "errors" : label === "warning" ? "warnings" : label === "excluded" ? "excluded" : "all"); setPage(0); }} className="rounded border p-2 text-left"><span className="block text-lg font-bold">{value}</span><span className="text-[10px] uppercase">{label}</span></button>)}</div>
          <div className="flex flex-wrap items-end gap-2 rounded border p-2">
            <label className="text-xs">Batch field<select className="ml-2 h-8 rounded border bg-transparent px-2" value={batchField} onChange={(event) => setBatchField(event.target.value as typeof batchField)}><option value="discipline">Discipline</option><option value="severity">Severity</option><option value="unit">Unit</option></select></label>
            <label className="text-xs">Value<input className="ml-2 h-8 rounded border bg-transparent px-2" value={batchValue} onChange={(event) => setBatchValue(event.target.value)} /></label>
            <Button variant="outline" size="sm" disabled={selectedRows.size === 0} onClick={applyBatch}>Apply to {selectedRows.size} selected</Button>
            <select className="h-8 rounded border bg-transparent px-2 text-xs" value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setPage(0); }}><option value="all">All rows</option><option value="errors">Errors only</option><option value="warnings">Warnings only</option><option value="excluded">Excluded only</option></select>
          </div>
          <div className="max-h-[620px] overflow-auto rounded border">
            <table className="min-w-max text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">Select</th><th className="p-2">Row</th><th className="p-2">Include</th><th className="p-2">Status/reason</th>{activeFields.map((field) => <th key={field} className="min-w-40 p-2 text-left">{field}</th>)}<th className="p-2">Review</th></tr></thead><tbody>{pageRows.map((row) => <tr key={row.sourceRow} className={`border-t align-top ${row.errors.length ? "bg-rose-50" : row.warnings.length ? "bg-amber-50" : ""}`}><td className="p-2"><input type="checkbox" checked={selectedRows.has(row.sourceRow)} onChange={(event) => setSelectedRows((current) => { const next = new Set(current); if (event.target.checked) next.add(row.sourceRow); else next.delete(row.sourceRow); return next; })} /></td><td className="p-2 font-mono">{row.sourceRow}</td><td className="p-2"><input type="checkbox" checked={row.included} onChange={() => toggleIncluded(row.sourceRow)} /></td><td className="min-w-52 p-2">{row.included ? <select className="h-8 w-full rounded border bg-transparent px-2" value={row.status} disabled={row.status === "ready_for_validation"} onChange={(event) => setRowStatus(row.sourceRow, event.target.value as ImportRowStatus)}>{row.status === "ready_for_validation" && <option value="ready_for_validation">ready_for_validation</option>}{textualStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select> : <select className="h-8 w-full rounded border bg-transparent px-2" value={row.exclusionReason ?? ""} onChange={(event) => setRows((current) => current.map((item) => item.sourceRow === row.sourceRow ? { ...item, exclusionReason: event.target.value as ExclusionReason } : item))}><option value="">Choose reason</option>{exclusionReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select>}<div className="mt-1 max-w-xs text-[10px]">{row.errors.map((item) => <p key={item} className="text-rose-700">{item}</p>)}{row.warnings.map((item) => <p key={item} className="text-amber-700">{item}</p>)}</div></td>{activeFields.map((field) => <td key={field} className="p-1"><input className="h-8 w-full rounded border bg-white px-2" value={row.values[field] ?? ""} onChange={(event) => updateRow(row.sourceRow, field, event.target.value)} disabled={!row.included} /></td>)}<td className="p-2">{row.included && row.warnings.length > 0 && <label className="flex items-center gap-1"><input type="checkbox" checked={row.reviewed} onChange={(event) => setRows((current) => current.map((item) => item.sourceRow === row.sourceRow ? { ...item, reviewed: event.target.checked } : item))} /> Accept warnings</label>}{!row.included && !row.exclusionReason && <span className="text-rose-700">Reason required</span>}</td></tr>)}</tbody></table>
          </div>
          <div className="flex items-center justify-between text-xs"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Page {page + 1} of {pageCount} · {filteredRows.length} rows</span><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button></div>
          <div className="grid gap-3 rounded border p-3 sm:grid-cols-[1fr_0.5fr_auto]"><label className="text-xs">Specification name<input className="mt-1 h-9 w-full rounded border bg-transparent px-2" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-xs">Revision<input className="mt-1 h-9 w-full rounded border bg-transparent px-2" value={revision} onChange={(event) => setRevision(event.target.value)} /></label><Button className="self-end" disabled={busy || rows.some((row) => !row.included && !row.exclusionReason)} onClick={() => void confirm()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : counts.blocked ? <AlertTriangle className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Confirm {counts.valid + counts.warning} requirements</Button></div>
          <p className="text-[10px] text-slate-500">Without an editable active project, confirmation creates a session-only draft that is lost on refresh.</p>
        </>}
      </CardContent>
    </Card>
  );
}
