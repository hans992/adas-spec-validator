"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type JobSummary = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  phase: "queued" | "parsing" | "validating" | "persisting" | "completed";
  progress_percent: number;
  input_file_name: string;
  attempts: number;
  max_attempts: number;
  last_error?: string | null;
  error_retryable?: boolean | null;
  dead_lettered_at?: string | null;
  validation_run_id?: string | null;
  created_at: string;
  finished_at?: string | null;
};

const PHASE_LABEL: Record<JobSummary["phase"], string> = {
  queued: "Waiting in queue",
  parsing: "Parsing model",
  validating: "Running validation",
  persisting: "Saving results",
  completed: "Completed"
};

const STATUS_STYLE: Record<JobSummary["status"], string> = {
  queued: "bg-slate-100 text-slate-700",
  processing: "bg-indigo-100 text-indigo-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  cancelled: "bg-amber-100 text-amber-800"
};

const ACTIVE_POLL_MS = 2_000;

/**
 * Background import & validate jobs. Progress survives page refreshes because
 * every state transition lives in the database; on mount the panel reloads the
 * job list and resumes polling any active job.
 */
export function JobsPanel({
  projectId,
  specifications,
  canEdit,
  api,
  onJobCompleted
}: {
  projectId: string;
  specifications: Array<{ id: string; name: string; revision: string }>;
  canEdit: boolean;
  api: (path: string, init?: RequestInit) => Promise<any>;
  onJobCompleted?: () => void;
}) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [specificationId, setSpecificationId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const completedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSpecificationId((current) =>
      specifications.some((item) => item.id === current) ? current : specifications[0]?.id ?? ""
    );
  }, [specifications]);

  const loadJobs = useCallback(async () => {
    if (!projectId) { setJobs([]); return; }
    const payload = await api(`/api/projects/${projectId}/jobs`);
    setJobs(payload.jobs);
  }, [api, projectId]);

  useEffect(() => {
    completedIdsRef.current = new Set();
    void loadJobs().catch((caught: Error) => setError(caught.message));
  }, [loadJobs]);

  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "processing");

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const timer = setInterval(() => {
      void (async () => {
        for (const active of activeJobs) {
          // Each poll also drives one worker step when the job is due.
          const payload = await api(`/api/projects/${projectId}/jobs/${active.id}`);
          const job = payload.job as JobSummary;
          setJobs((current) => current.map((item) => item.id === job.id ? { ...item, ...job } : item));
          if (job.status === "completed" && !completedIdsRef.current.has(job.id)) {
            completedIdsRef.current.add(job.id);
            onJobCompleted?.();
          }
        }
      })().catch(() => { /* transient poll errors resolve on the next interval */ });
    }, ACTIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [activeJobs, api, onJobCompleted, projectId]);

  async function enqueue(file: File) {
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("specificationId", specificationId);
      const payload = await api(`/api/projects/${projectId}/jobs`, { method: "POST", body: form });
      setJobs((current) => [payload.job as JobSummary, ...current.filter((item) => item.id !== payload.job.id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The job could not be enqueued.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function jobAction(jobId: string, action: "cancel" | "retry") {
    setError("");
    try {
      const payload = await api(`/api/projects/${projectId}/jobs/${jobId}`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      if (payload.job) {
        setJobs((current) => current.map((item) => item.id === payload.job.id ? { ...item, ...payload.job } : item));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The job action failed.");
    }
  }

  if (!projectId) return null;

  return <div className="space-y-2 rounded-lg border p-3 text-left">
    <p className="text-xs font-semibold">Background import &amp; validate</p>
    <p className="text-[10px] text-slate-500">
      Large IFC or model JSON files are processed in background steps (parse → validate → save), so nothing depends on one long request. Progress survives page refreshes.
    </p>
    {canEdit && <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <select aria-label="Job specification" value={specificationId} onChange={(event) => setSpecificationId(event.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-xs">
        {specifications.length === 0 && <option value="">Save a specification revision first</option>}
        {specifications.map((item) => <option key={item.id} value={item.id}>{item.name} · rev. {item.revision}</option>)}
      </select>
      <Button variant="outline" size="sm" disabled={uploading || !specificationId} onClick={() => fileInputRef.current?.click()}>
        {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Upload IFC / JSON as job"}
      </Button>
      <input ref={fileInputRef} type="file" accept=".ifc,.json" className="hidden" aria-label="Job model file" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void enqueue(file);
      }} />
    </div>}
    {jobs.length === 0
      ? <p className="text-[10px] text-slate-500">No background jobs yet.</p>
      : <div className="space-y-2">
        {jobs.slice(0, 8).map((job) => <div key={job.id} className="rounded border px-2 py-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="min-w-0 truncate font-medium">{job.input_file_name}</span>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[job.status]}`}>
              {job.dead_lettered_at ? "failed · dead letter" : job.status}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${job.status === "failed" ? "bg-rose-400" : job.status === "cancelled" ? "bg-amber-400" : "bg-indigo-500"}`}
              style={{ width: `${Math.max(4, job.progress_percent)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
            <span>
              {job.status === "failed"
                ? (job.last_error ?? "The job failed.")
                : job.status === "cancelled"
                  ? "Cancelled."
                  : PHASE_LABEL[job.phase]}
              {job.attempts > 0 && job.status !== "completed" ? ` · attempt ${job.attempts}/${job.max_attempts}` : ""}
            </span>
            <span className="flex gap-1">
              {canEdit && (job.status === "queued" || job.status === "processing") &&
                <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => void jobAction(job.id, "cancel")}>
                  <X className="mr-1 h-3 w-3" /> Cancel
                </Button>}
              {canEdit && job.status === "failed" &&
                <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => void jobAction(job.id, "retry")}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Retry
                </Button>}
            </span>
          </div>
        </div>)}
      </div>}
    {error && <p className="text-[10px] text-rose-700">{error}</p>}
  </div>;
}
