"use client";

import { useState } from "react";
import { Download, Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { calculateComplianceMetrics, type RequirementOutcome } from "@/domain/complianceMetrics";
import type { ValidationSnapshot } from "@/domain/validationComparison";

export type ValidationReview = {
  requirement_id: string;
  status: "open" | "acknowledged" | "resolved" | "waived";
  comment: string;
  updated_at: string;
  decision_id?: string;
  waiver_reason?: string | null;
  waiver_expires_at?: string | null;
  updated_by?: string | null;
};

export type FindingEvidenceRow = {
  id: string;
  requirement_id: string;
  rule_id?: string | null;
  finding_key: string;
  kind: "file" | "screenshot" | "model_element" | "comment" | "link" | "technical_note";
  title: string;
  comment: string;
  link_url?: string | null;
  technical_note?: string | null;
  model_element_id?: string | null;
  model_element_type?: "room" | "door" | "model" | null;
  file_name?: string | null;
  file_content_hash?: string | null;
  created_by: string;
  created_at: string;
};

export type ReviewHistoryRow = {
  decision_id: string;
  requirement_id: string;
  status: ValidationReview["status"];
  comment: string;
  waiver_reason?: string | null;
  waiver_expires_at?: string | null;
  reviewer_id: string;
  decided_at: string;
  superseded_at: string;
};

const outcomeLabel: Record<RequirementOutcome, string> = {
  compliant: "Compliant",
  violation: "Violation",
  unknown: "Needs review",
  not_applicable: "Not applicable"
};

type ReviewDecision = {
  requirementId: string;
  status: ValidationReview["status"];
  comment: string;
  waiverReason?: string;
  waiverExpiresAt?: string | null;
};

export function ValidationReport({
  projectName,
  snapshot,
  reviews,
  evidence = [],
  history = [],
  canEdit = true,
  onSaveReview,
  onAddEvidence,
  onDownloadAuditBundle,
  onClose
}: {
  projectName: string;
  snapshot: ValidationSnapshot;
  reviews: ValidationReview[];
  evidence?: FindingEvidenceRow[];
  history?: ReviewHistoryRow[];
  canEdit?: boolean;
  onSaveReview: (decision: ReviewDecision) => Promise<void>;
  onAddEvidence?: (payload: {
    requirementId: string;
    findingKey: string;
    ruleId?: string;
    kind: FindingEvidenceRow["kind"];
    title: string;
    comment: string;
    linkUrl?: string;
    technicalNote?: string;
    modelElementId?: string;
    modelElementType?: "room" | "door" | "model";
  }) => Promise<void>;
  onDownloadAuditBundle?: () => Promise<void>;
  onClose: () => void;
}) {
  const metrics = calculateComplianceMetrics(snapshot.requirements, snapshot.results);
  const [bundleBusy, setBundleBusy] = useState(false);

  return <div className="report-shell fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
    <article className="validation-report mx-auto max-w-5xl bg-white p-8 text-slate-950 shadow-2xl print:max-w-none print:p-0 print:shadow-none">
      <div className="report-controls mb-6 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}><X className="mr-2 h-4 w-4" /> Close</Button>
        {onDownloadAuditBundle && <Button variant="outline" disabled={bundleBusy} onClick={() => void (async () => {
          setBundleBusy(true);
          try { await onDownloadAuditBundle(); } finally { setBundleBusy(false); }
        })()}><Download className="mr-2 h-4 w-4" />{bundleBusy ? "Building…" : "Audit ZIP"}</Button>}
        <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print / Save PDF</Button>
      </div>
      <header className="border-b-2 border-slate-900 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-700">AEC Spec Validator</p>
        <h1 className="mt-2 text-3xl font-bold">Validation report</h1>
        <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          <p><b>Project:</b> {projectName}</p>
          <p><b>Model:</b> {snapshot.model_name}</p>
          <p><b>Validated:</b> {new Date(snapshot.created_at).toLocaleString()}</p>
          <p className="break-all"><b>Run ID:</b> {snapshot.id}</p>
        </div>
        <p className="mt-3 text-xs text-slate-600">Integrity is provided by an immutable run snapshot, SHA-256 checksums, and audit history. This report is not digitally signed.</p>
      </header>
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Pass rate" value={metrics.passRate === null ? "—" : `${metrics.passRate}%`} />
        <Metric label="Coverage" value={metrics.coverage === null ? "—" : `${metrics.coverage}%`} />
        <Metric label="Violations" value={`${metrics.violatedRequirements}`} danger={metrics.violatedRequirements > 0} />
        <Metric label="Critical failures" value={`${metrics.criticalFailures}`} danger={metrics.criticalFailures > 0} />
      </section>
      <section className="mt-7">
        <h2 className="text-lg font-bold">Model inventory</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Metric label="Levels" value={`${snapshot.normalized_model.levels.length}`} />
          <Metric label="Rooms" value={`${snapshot.normalized_model.rooms.length}`} />
          <Metric label="Doors" value={`${snapshot.normalized_model.doors.length}`} />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-bold">Requirement assessment</h2>
        <p className="mt-1 text-xs text-slate-600">Results were recalculated by the server before this snapshot was stored.</p>
        <div className="mt-4 space-y-4">{metrics.assessments.map((assessment, index) => {
          const requirementEvidence = evidence.filter((item) => item.requirement_id === assessment.requirement.id);
          const requirementHistory = history.filter((item) => item.requirement_id === assessment.requirement.id);
          return <section key={assessment.requirement.id} className="report-assessment break-inside-avoid rounded-lg border border-slate-300 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">{index + 1}. {assessment.requirement.id}</p>
                <h3 className="font-semibold">{assessment.requirement.title}</h3>
              </div>
              <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${assessment.outcome === "compliant" ? "bg-emerald-100 text-emerald-800" : assessment.outcome === "violation" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{outcomeLabel[assessment.outcome]}</span>
            </div>
            <p className="mt-2 text-xs"><b>Severity:</b> {assessment.requirement.severity}</p>
            {assessment.requirement.source && <p className="mt-1 text-xs text-slate-600"><b>Source:</b> {assessment.requirement.source.document} · {assessment.requirement.source.section}{assessment.requirement.source.revision ? ` · rev. ${assessment.requirement.source.revision}` : ""}</p>}
            {assessment.results.length === 0
              ? <p className="mt-3 text-sm text-slate-600">No deterministic result was produced for this requirement.</p>
              : assessment.results.map((result, resultIndex) => <div key={`${result.ruleId}-${resultIndex}`} className="mt-3 border-t border-slate-200 pt-3 text-sm">
                <p className="font-medium">{result.summary}</p>
                {result.affectedElementIds.length > 0 && <p className="mt-1 text-xs text-slate-600"><b>Affected:</b> {result.affectedElementIds.join(", ")}</p>}
                {result.evidence.map((item, evidenceIndex) => <p key={evidenceIndex} className="mt-1 text-xs text-slate-600">Engine evidence: {item.message}{item.observed !== undefined ? ` · observed ${String(item.observed)}` : ""}{item.expected !== undefined ? ` · expected ${String(item.expected)}` : ""}</p>)}
              </div>)}
            <EvidencePanel
              requirementId={assessment.requirement.id}
              findingKey={assessment.results[0]
                ? `${assessment.results[0].requirementId}|${assessment.results[0].ruleId}|${[...assessment.results[0].affectedElementIds].sort().join(",")}`
                : assessment.requirement.id}
              ruleId={assessment.results[0]?.ruleId}
              evidence={requirementEvidence}
              canEdit={canEdit}
              onAddEvidence={onAddEvidence}
            />
            <ReviewEditor
              requirementId={assessment.requirement.id}
              review={reviews.find((item) => item.requirement_id === assessment.requirement.id)}
              history={requirementHistory}
              canEdit={canEdit}
              onSave={onSaveReview}
            />
          </section>;
        })}</div>
      </section>
      <footer className="mt-8 border-t border-slate-300 pt-4 text-xs text-slate-500">
        Deterministic validation report generated from saved run {snapshot.id}. Unknown or incomplete source data requires human review.
        Download the audit ZIP for the checksummed package (manifest, findings, evidence, reviews, matrix, JSON/XLSX/PDF, audit log).
      </footer>
    </article>
  </div>;
}

function EvidencePanel({
  requirementId,
  findingKey,
  ruleId,
  evidence,
  canEdit,
  onAddEvidence
}: {
  requirementId: string;
  findingKey: string;
  ruleId?: string;
  evidence: FindingEvidenceRow[];
  canEdit: boolean;
  onAddEvidence?: (payload: {
    requirementId: string;
    findingKey: string;
    ruleId?: string;
    kind: FindingEvidenceRow["kind"];
    title: string;
    comment: string;
    linkUrl?: string;
    technicalNote?: string;
    modelElementId?: string;
    modelElementType?: "room" | "door" | "model";
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<FindingEvidenceRow["kind"]>("comment");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [technicalNote, setTechnicalNote] = useState("");
  const [modelElementId, setModelElementId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!onAddEvidence) return;
    setSaving(true); setError("");
    try {
      await onAddEvidence({
        requirementId,
        findingKey,
        ruleId,
        kind,
        title: title || `${kind} evidence`,
        comment,
        ...(kind === "link" ? { linkUrl } : {}),
        ...(kind === "technical_note" ? { technicalNote } : {}),
        ...(kind === "model_element" ? { modelElementId, modelElementType: "room" as const } : {})
      });
      setTitle(""); setComment(""); setLinkUrl(""); setTechnicalNote(""); setModelElementId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-4 border-t border-slate-200 pt-3">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Finding evidence</p>
    {evidence.length === 0
      ? <p className="mt-2 text-xs text-slate-500">No human-attached evidence yet.</p>
      : <ul className="mt-2 space-y-1 text-xs text-slate-700">
        {evidence.map((item) => <li key={item.id} className="rounded border px-2 py-1">
          <b className="capitalize">{item.kind}</b>: {item.title}
          {item.comment ? ` — ${item.comment}` : ""}
          {item.link_url ? ` · ${item.link_url}` : ""}
          {item.model_element_id ? ` · element ${item.model_element_id}` : ""}
          {item.file_content_hash ? ` · SHA-256 ${item.file_content_hash.slice(0, 12)}…` : ""}
          <span className="block text-[10px] text-slate-500">{item.created_by} · {new Date(item.created_at).toLocaleString()}</span>
        </li>)}
      </ul>}
    {canEdit && onAddEvidence && <div className="report-controls mt-3 grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]">
      <select aria-label={`Evidence kind for ${requirementId}`} value={kind} onChange={(event) => setKind(event.target.value as FindingEvidenceRow["kind"])} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">
        <option value="comment">Comment</option>
        <option value="link">Link</option>
        <option value="technical_note">Technical note</option>
        <option value="model_element">Model element</option>
      </select>
      <input aria-label={`Evidence title for ${requirementId}`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="h-9 rounded-md border border-slate-300 px-3 text-xs" />
      {kind === "link"
        ? <input aria-label={`Evidence link for ${requirementId}`} value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" className="h-9 rounded-md border border-slate-300 px-3 text-xs" />
        : kind === "technical_note"
          ? <input aria-label={`Technical note for ${requirementId}`} value={technicalNote} onChange={(event) => setTechnicalNote(event.target.value)} placeholder="Technical note" className="h-9 rounded-md border border-slate-300 px-3 text-xs" />
          : kind === "model_element"
            ? <input aria-label={`Model element for ${requirementId}`} value={modelElementId} onChange={(event) => setModelElementId(event.target.value)} placeholder="Element ID" className="h-9 rounded-md border border-slate-300 px-3 text-xs" />
            : <input aria-label={`Evidence comment for ${requirementId}`} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comment" className="h-9 rounded-md border border-slate-300 px-3 text-xs" />}
      <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Add"}</Button>
    </div>}
    {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
  </div>;
}

function ReviewEditor({
  requirementId,
  review,
  history,
  canEdit,
  onSave
}: {
  requirementId: string;
  review?: ValidationReview;
  history: ReviewHistoryRow[];
  canEdit: boolean;
  onSave: (decision: ReviewDecision) => Promise<void>;
}) {
  const [status, setStatus] = useState<ValidationReview["status"]>(review?.status ?? "open");
  const [comment, setComment] = useState(review?.comment ?? "");
  const [waiverReason, setWaiverReason] = useState(review?.waiver_reason ?? "");
  const [waiverExpiresAt, setWaiverExpiresAt] = useState(review?.waiver_expires_at?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError("");
    try {
      await onSave({
        requirementId,
        status,
        comment,
        ...(status === "waived"
          ? {
              waiverReason: waiverReason || undefined,
              waiverExpiresAt: waiverExpiresAt ? new Date(`${waiverExpiresAt}T23:59:59.000Z`).toISOString() : null
            }
          : {})
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-4 border-t border-slate-200 pt-3">
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Review decision</p>
      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize">{review?.status ?? status}</span>
    </div>
    {review?.comment && <p className="mt-2 text-sm text-slate-700">{review.comment}</p>}
    {review?.waiver_reason && <p className="mt-1 text-xs text-purple-800"><b>Waiver reason:</b> {review.waiver_reason}</p>}
    {review?.waiver_expires_at && <p className="mt-1 text-xs text-purple-800"><b>Waiver expires:</b> {new Date(review.waiver_expires_at).toLocaleString()}</p>}
    {review?.updated_by && <p className="mt-1 text-[10px] text-slate-500">Reviewer {review.updated_by}</p>}
    {review?.updated_at && <p className="mt-1 text-[10px] text-slate-500">Updated {new Date(review.updated_at).toLocaleString()}</p>}
    {history.length > 0 && <details className="mt-2 text-xs text-slate-600">
      <summary>Superseded decisions ({history.length})</summary>
      <ul className="mt-1 space-y-1">
        {history.map((item) => <li key={`${item.decision_id}-${item.superseded_at}`}>
          {item.status} · {item.reviewer_id} · {new Date(item.decided_at).toLocaleString()}
          {item.comment ? ` — ${item.comment}` : ""}
          {item.waiver_reason ? ` · waiver: ${item.waiver_reason}` : ""}
        </li>)}
      </ul>
    </details>}
    {canEdit ? <div className="report-controls mt-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
        <select aria-label={`Review status for ${requirementId}`} value={status} onChange={(event) => setStatus(event.target.value as ValidationReview["status"])} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="waived">Waived</option>
        </select>
        <input aria-label={`Review comment for ${requirementId}`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Decision rationale or follow-up note" className="h-9 rounded-md border border-slate-300 px-3 text-xs" />
        <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save review"}</Button>
      </div>
      {status === "waived" && <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label={`Waiver reason for ${requirementId}`} value={waiverReason} onChange={(event) => setWaiverReason(event.target.value)} placeholder="Waiver reason (required)" className="h-9 rounded-md border border-slate-300 px-3 text-xs" />
        <input aria-label={`Waiver expiry for ${requirementId}`} type="date" value={waiverExpiresAt} onChange={(event) => setWaiverExpiresAt(event.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-xs" />
      </div>}
    </div> : <p className="report-controls mt-3 text-xs text-slate-500">Viewer access · review decisions are read-only.</p>}
    {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
  </div>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-lg border border-slate-300 p-3"><p className="text-xs text-slate-600">{label}</p><p className={`mt-1 text-2xl font-bold ${danger ? "text-rose-700" : "text-slate-950"}`}>{value}</p></div>;
}
