"use client";

import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateComplianceMetrics, type RequirementOutcome } from "@/domain/complianceMetrics";
import type { ValidationSnapshot } from "@/domain/validationComparison";

const outcomeLabel: Record<RequirementOutcome, string> = { compliant: "Compliant", violation: "Violation", unknown: "Needs review", not_applicable: "Not applicable" };

export function ValidationReport({ projectName, snapshot, onClose }: { projectName: string; snapshot: ValidationSnapshot; onClose: () => void }) {
  const metrics = calculateComplianceMetrics(snapshot.requirements, snapshot.results);
  return <div className="report-shell fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
    <article className="validation-report mx-auto max-w-5xl bg-white p-8 text-slate-950 shadow-2xl print:max-w-none print:p-0 print:shadow-none">
      <div className="report-controls mb-6 flex justify-end gap-2"><Button variant="outline" onClick={onClose}><X className="mr-2 h-4 w-4" /> Close</Button><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print / Save PDF</Button></div>
      <header className="border-b-2 border-slate-900 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-700">ADAS Spec Validator</p><h1 className="mt-2 text-3xl font-bold">Validation report</h1>
        <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2"><p><b>Project:</b> {projectName}</p><p><b>Model:</b> {snapshot.model_name}</p><p><b>Validated:</b> {new Date(snapshot.created_at).toLocaleString()}</p><p className="break-all"><b>Run ID:</b> {snapshot.id}</p></div>
      </header>
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Pass rate" value={metrics.passRate === null ? "—" : `${metrics.passRate}%`} /><Metric label="Coverage" value={metrics.coverage === null ? "—" : `${metrics.coverage}%`} /><Metric label="Violations" value={`${metrics.violatedRequirements}`} danger={metrics.violatedRequirements > 0} /><Metric label="Critical failures" value={`${metrics.criticalFailures}`} danger={metrics.criticalFailures > 0} /></section>
      <section className="mt-7"><h2 className="text-lg font-bold">Model inventory</h2><div className="mt-3 grid grid-cols-3 gap-3"><Metric label="Levels" value={`${snapshot.normalized_model.levels.length}`} /><Metric label="Rooms" value={`${snapshot.normalized_model.rooms.length}`} /><Metric label="Doors" value={`${snapshot.normalized_model.doors.length}`} /></div></section>
      <section className="mt-8"><h2 className="text-lg font-bold">Requirement assessment</h2><p className="mt-1 text-xs text-slate-600">Results were recalculated by the server before this snapshot was stored.</p>
        <div className="mt-4 space-y-4">{metrics.assessments.map((assessment, index) => <section key={assessment.requirement.id} className="report-assessment break-inside-avoid rounded-lg border border-slate-300 p-4">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs text-slate-500">{index + 1}. {assessment.requirement.id}</p><h3 className="font-semibold">{assessment.requirement.title}</h3></div><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${assessment.outcome === "compliant" ? "bg-emerald-100 text-emerald-800" : assessment.outcome === "violation" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{outcomeLabel[assessment.outcome]}</span></div>
          <p className="mt-2 text-xs"><b>Severity:</b> {assessment.requirement.severity}</p>
          {assessment.results.length === 0 ? <p className="mt-3 text-sm text-slate-600">No deterministic result was produced for this requirement.</p> : assessment.results.map((result, resultIndex) => <div key={`${result.ruleId}-${resultIndex}`} className="mt-3 border-t border-slate-200 pt-3 text-sm"><p className="font-medium">{result.summary}</p>{result.affectedElementIds.length > 0 && <p className="mt-1 text-xs text-slate-600"><b>Affected:</b> {result.affectedElementIds.join(", ")}</p>}{result.evidence.map((item, evidenceIndex) => <p key={evidenceIndex} className="mt-1 text-xs text-slate-600">Evidence: {item.message}{item.observed !== undefined ? ` · observed ${String(item.observed)}` : ""}{item.expected !== undefined ? ` · expected ${String(item.expected)}` : ""}</p>)}</div>)}
        </section>)}</div>
      </section>
      <footer className="mt-8 border-t border-slate-300 pt-4 text-xs text-slate-500">Deterministic validation report generated from saved run {snapshot.id}. Unknown or incomplete source data requires human review.</footer>
    </article>
  </div>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-lg border border-slate-300 p-3"><p className="text-xs text-slate-600">{label}</p><p className={`mt-1 text-2xl font-bold ${danger ? "text-rose-700" : "text-slate-950"}`}>{value}</p></div>;
}
