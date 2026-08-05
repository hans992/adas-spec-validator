"use client";

import { useMemo, useState } from "react";
import { FileDown, Link2, Table2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildTraceabilityMatrix,
  exportTraceabilityCsv,
  exportTraceabilityXlsx,
  filterTraceabilityRows,
  type ReviewRecord,
  type TraceabilityGapFilter,
  type TraceabilityRow
} from "@/domain/traceabilityMatrix";
import type {
  DocumentSourceSnapshot,
  Requirement,
  ValidationResult,
  ValidationSeverity
} from "@/domain/types";

const gapFilters: Array<{ key: TraceabilityGapFilter; label: string }> = [
  { key: "uncovered", label: "Uncovered" },
  { key: "no_executable_rule", label: "No executable rule" },
  { key: "unknown_outcome", label: "Unknown result" },
  { key: "finding_without_review", label: "Findings without review" },
  { key: "waived", label: "Waived" }
];

const outcomeStyles: Record<TraceabilityRow["outcome"], string> = {
  compliant: "bg-emerald-100 text-emerald-800",
  violation: "bg-rose-100 text-rose-800",
  unknown: "bg-amber-100 text-amber-800",
  not_applicable: "bg-slate-100 text-slate-600"
};

function download(filename: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function TraceabilityMatrix({
  requirements,
  results,
  reviews = [],
  documentSource,
  reviewsContext,
  onSelectElement
}: {
  requirements: Requirement[];
  results: ValidationResult[];
  reviews?: ReviewRecord[];
  documentSource?: DocumentSourceSnapshot;
  /** Where the review decisions come from (e.g. the opened validation report), for honest labelling. */
  reviewsContext?: string;
  onSelectElement?: (elementId: string, elementType: "room" | "door" | "model") => void;
}) {
  const [documentFilter, setDocumentFilter] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState<ValidationSeverity | "">("");
  const [gapFilter, setGapFilter] = useState<TraceabilityGapFilter | "">("");
  const [clauseRow, setClauseRow] = useState<TraceabilityRow | null>(null);

  const matrix = useMemo(
    () => buildTraceabilityMatrix({ requirements, results, reviews, documentSource }),
    [requirements, results, reviews, documentSource]
  );
  const filteredRows = useMemo(
    () => filterTraceabilityRows(matrix.rows, {
      document: documentFilter,
      discipline: disciplineFilter,
      severity: severityFilter,
      gap: gapFilter
    }),
    [matrix.rows, documentFilter, disciplineFilter, severityFilter, gapFilter]
  );

  const documents = useMemo(
    () => [...new Set(matrix.rows.map((row) => row.sourceDocument || "No source document"))].sort(),
    [matrix.rows]
  );
  const disciplines = useMemo(
    () => [...new Set(matrix.rows.map((row) => row.discipline))].sort(),
    [matrix.rows]
  );

  const metricCards = [
    { label: "Extraction coverage", metric: matrix.metrics.extractionCoverage, hint: "Requirements with a recorded source" },
    { label: "Rule coverage", metric: matrix.metrics.ruleCoverage, hint: "Requirements with an executable rule" },
    { label: "Evaluation coverage", metric: matrix.metrics.evaluationCoverage, hint: "Determined of applicable requirements" },
    { label: "Pass rate", metric: matrix.metrics.passRate, hint: "Compliant of determined requirements" },
    { label: "Review completion", metric: matrix.metrics.reviewCompletion, hint: "Findings with a review decision" },
    { label: "Source traceability", metric: matrix.metrics.sourceTraceabilityCoverage, hint: "Requirements resolvable to a persisted clause" }
  ];

  async function exportXlsx() {
    const bytes = await exportTraceabilityXlsx({ ...matrix, rows: filteredRows });
    download(
      "traceability-matrix.xlsx",
      new Blob([Uint8Array.from(bytes).buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
  }

  function exportCsv() {
    download(
      "traceability-matrix.csv",
      new Blob([exportTraceabilityCsv(filteredRows)], { type: "text/csv;charset=utf-8" })
    );
  }

  return (
    <Card className="shadow-md" data-testid="traceability-matrix">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm"><Table2 className="h-4 w-4" /> Traceability matrix</CardTitle>
            <CardDescription className="text-xs">
              Source clause → requirement → validation rule → model evidence → finding → review decision.
              Metrics stay separate on purpose; there is no single aggregated compliance number.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5"><FileDown className="h-3.5 w-3.5" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => void exportXlsx()} className="gap-1.5"><FileDown className="h-3.5 w-3.5" /> XLSX</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {metricCards.map((card) => (
            <div key={card.label} className="rounded-lg border p-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
              <p className="text-lg font-extrabold">
                {card.metric.percent === null ? "—" : `${card.metric.percent}%`}
                <span className="ml-1 text-[10px] font-normal text-slate-500">{card.metric.numerator}/{card.metric.denominator}</span>
              </p>
              <p className="text-[10px] text-slate-500">{card.hint}</p>
            </div>
          ))}
        </div>

        {reviews.length === 0 && (
          <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
            No review decisions are loaded{reviewsContext ? ` (${reviewsContext})` : ""}. Open a saved validation report to bring its review decisions into the matrix.
          </p>
        )}
        {reviews.length > 0 && reviewsContext && (
          <p className="text-[11px] text-slate-500">Review decisions loaded from: {reviewsContext}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Filter by source document" value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)} className="h-8 rounded border bg-transparent px-2">
            <option value="">All documents</option>
            {documents.map((doc) => <option key={doc} value={doc}>{doc}</option>)}
          </select>
          <select aria-label="Filter by discipline" value={disciplineFilter} onChange={(event) => setDisciplineFilter(event.target.value)} className="h-8 rounded border bg-transparent px-2">
            <option value="">All disciplines</option>
            {disciplines.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
          </select>
          <select aria-label="Filter by severity" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as ValidationSeverity | "")} className="h-8 rounded border bg-transparent px-2">
            <option value="">All severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
          {gapFilters.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`rounded px-2 py-1 text-[11px] ${gapFilter === item.key ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800"}`}
              onClick={() => setGapFilter((current) => current === item.key ? "" : item.key)}
            >
              {item.label} ({matrix.rows.filter((row) => row.gaps[
                item.key === "no_executable_rule" ? "noExecutableRule"
                : item.key === "unknown_outcome" ? "unknownOutcome"
                : item.key === "finding_without_review" ? "findingWithoutReview"
                : item.key
              ]).length})
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-500">{filteredRows.length} of {matrix.rows.length} requirements</span>
        </div>

        <div className="max-h-[28rem] overflow-auto rounded border">
          <table className="min-w-max w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="p-2">Requirement</th>
                <th className="p-2">Source clause</th>
                <th className="p-2">Rule</th>
                <th className="p-2">Model evidence</th>
                <th className="p-2">Finding</th>
                <th className="p-2">Review decision</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.requirementId} className="border-t align-top">
                  <td className="max-w-56 p-2">
                    <p className="font-mono text-[10px] text-slate-500">{row.requirementId}</p>
                    <p className="font-semibold">{row.title}</p>
                    <p className="text-[10px] text-slate-500">{row.discipline} · {row.severity}</p>
                  </td>
                  <td className="max-w-52 p-2">
                    {row.sourceDocument ? (
                      <p>{row.sourceDocument} · {row.sourceSection}{row.sourceRevision ? ` · rev ${row.sourceRevision}` : ""}</p>
                    ) : (
                      <p className="text-rose-600">No source recorded</p>
                    )}
                    {row.sourceResolved ? (
                      <button type="button" className="mt-1 flex items-center gap-1 text-indigo-600 underline" onClick={() => setClauseRow(row)}>
                        <Link2 className="h-3 w-3" /> Open source clause
                      </button>
                    ) : row.sourceFragmentIds.length > 0 ? (
                      <p className="mt-1 text-[10px] text-amber-700">Fragments not resolvable in the active snapshot</p>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {row.hasExecutableRule
                      ? <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800">{row.requirementType}</span>
                      : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">textual · no executable rule</span>}
                  </td>
                  <td className="max-w-48 p-2">
                    {row.findings.length === 0
                      ? <span className="text-rose-600">Uncovered — no results</span>
                      : [...new Set(row.findings.flatMap((finding) => finding.affectedElementIds))].map((elementId) => (
                          <button
                            key={elementId}
                            type="button"
                            className="mb-0.5 mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] hover:bg-indigo-100 dark:bg-slate-800"
                            onClick={() => onSelectElement?.(elementId, row.findings.find((finding) => finding.affectedElementIds.includes(elementId))?.elementType ?? "model")}
                            title="Highlight this element in the floor plan"
                          >
                            {elementId}
                          </button>
                        ))}
                  </td>
                  <td className="max-w-56 p-2">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${outcomeStyles[row.outcome]}`}>{row.outcome.replace("_", " ")}</span>
                    {row.findings.slice(0, 2).map((finding) => (
                      <p key={`${finding.ruleId}-${finding.summary}`} className="mt-1 text-[10px] text-slate-600">{finding.summary} ({finding.evidenceCount} evidence)</p>
                    ))}
                    {row.findings.length > 2 && <p className="text-[10px] text-slate-400">+{row.findings.length - 2} more findings</p>}
                  </td>
                  <td className="max-w-48 p-2">
                    {row.reviewStatus ? (
                      <>
                        <span className={`rounded px-1.5 py-0.5 font-semibold ${row.reviewStatus === "waived" ? "bg-purple-100 text-purple-800" : row.reviewStatus === "open" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{row.reviewStatus}</span>
                        {row.reviewComment && <p className="mt-1 text-[10px] text-slate-600">{row.reviewComment}</p>}
                        {row.reviewUpdatedAt && <p className="text-[10px] text-slate-400">{new Date(row.reviewUpdatedAt).toLocaleString()}</p>}
                      </>
                    ) : row.needsReview ? (
                      <span className="text-rose-600">Needs review — no decision</span>
                    ) : (
                      <span className="text-slate-400">Not required</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {([["By specification document", matrix.coverageByDocument], ["By discipline", matrix.coverageByDiscipline]] as const).map(([label, groups]) => (
            <div key={label} className="rounded border p-2">
              <p className="mb-1 text-xs font-semibold">{label}</p>
              <table className="w-full text-[10px]">
                <thead><tr className="text-left text-slate-500"><th className="py-0.5 pr-2">Group</th><th className="pr-2">Reqs</th><th className="pr-2">With rule</th><th className="pr-2">Determined</th><th className="pr-2">Compliant</th><th>Unreviewed</th></tr></thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.key} className="border-t">
                      <td className="max-w-44 truncate py-0.5 pr-2" title={group.key}>{group.key}</td>
                      <td className="pr-2">{group.requirementCount}</td>
                      <td className="pr-2">{group.withRule}</td>
                      <td className="pr-2">{group.determined}</td>
                      <td className="pr-2">{group.compliant}</td>
                      <td className={group.unreviewedFindings > 0 ? "font-semibold text-rose-600" : ""}>{group.unreviewedFindings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {clauseRow && (
          <div className="rounded border border-indigo-200 bg-indigo-50/50 p-3 text-xs dark:bg-indigo-950/20">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">Source clause for {clauseRow.requirementId}</p>
                <p className="text-[10px] text-slate-500">
                  {clauseRow.sourceClauseLocation}
                  {documentSource ? ` · ${documentSource.fileName} · SHA-256 ${documentSource.contentHash.slice(0, 12)}…` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setClauseRow(null)}><X className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="whitespace-pre-wrap rounded bg-white p-2 text-slate-800 dark:bg-slate-900 dark:text-slate-200">{clauseRow.sourceClauseText}</p>
            <p className="mt-1 text-[10px] font-mono text-slate-400">Fragments: {clauseRow.sourceFragmentIds.join(", ")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
