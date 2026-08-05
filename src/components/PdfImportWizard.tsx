"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  extractSpecificationPdf,
  renderPdfPagePreview,
  type PdfExtraction,
  type PdfLanguage
} from "@/domain/specificationPdf";
import {
  approvePdfDraftSource,
  confirmationBlockers,
  createInitialPdfDrafts,
  finalizePdfImport,
  type RequirementDraft
} from "@/domain/specificationPdfDrafts";
import type { SpecificationPackage } from "@/domain/types";

type ConfirmMeta = {
  fileName: string;
  includedRows: number;
  excludedRows: Array<{ sourceRow: number; reason: string }>;
};

type FilterKey = "all" | "unreviewed" | "blocked" | "candidates" | "sparse" | "excluded";

export function PdfImportWizard({
  onConfirm,
  onClose,
  initialFile,
  sessionActor = "session-user"
}: {
  onConfirm: (specification: SpecificationPackage, meta: ConfirmMeta) => Promise<void> | void;
  onClose: () => void;
  initialFile?: File | null;
  sessionActor?: string;
}) {
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [extraction, setExtraction] = useState<PdfExtraction | null>(null);
  const [drafts, setDrafts] = useState<RequirementDraft[]>([]);
  const [name, setName] = useState("Imported PDF specification");
  const [revision, setRevision] = useState("Draft");
  const [language, setLanguage] = useState<PdfLanguage>("unknown");
  const [filter, setFilter] = useState<FilterKey>("candidates");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [loadedInitialFile, setLoadedInitialFile] = useState(false);
  const [dirty, setDirty] = useState(false);
  const previewRequest = useRef(0);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function loadPreview(buffer: ArrayBuffer, pageNumber: number) {
    const requestId = ++previewRequest.current;
    setPreviewError("");
    const result = await renderPdfPagePreview(buffer, pageNumber);
    if (requestId !== previewRequest.current) return;
    if (!result.success) {
      setPreviewUrl(null);
      setPreviewError(result.error);
      return;
    }
    setPreviewUrl(result.dataUrl);
  }

  async function loadFile(file: File, languageOverride?: PdfLanguage) {
    setBusy(true);
    setError("");
    setConfirmError("");
    try {
      const buffer = await file.arrayBuffer();
      const result = await extractSpecificationPdf(
        buffer,
        file.name,
        file.type,
        languageOverride && languageOverride !== "unknown" ? { language: languageOverride } : undefined
      );
      if (!result.success) throw new Error(result.error);
      setFileBuffer(buffer);
      setExtraction(result.data);
      setLanguage(result.data.language);
      setName(result.data.metadata.title || result.data.safeFileName.replace(/\.pdf$/i, "") || "Imported PDF specification");
      const initial = createInitialPdfDrafts(result.data);
      setDrafts(initial);
      setDirty(true);
      const first = initial.find((draft) => draft.kind === "candidate" && !draft.superseded);
      setSelectedDraftId(first?.draftId ?? null);
      const page = first?.pageNumber ?? 1;
      setPreviewPage(page);
      await loadPreview(buffer, page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "PDF import failed.");
      setExtraction(null);
      setDrafts([]);
      setFileBuffer(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!initialFile || loadedInitialFile) return;
    setLoadedInitialFile(true);
    void loadFile(initialFile);
  }, [initialFile, loadedInitialFile]);

  const activeDrafts = useMemo(
    () => drafts.filter((draft) => !draft.superseded && draft.kind !== "structural"),
    [drafts]
  );

  const filteredDrafts = useMemo(() => activeDrafts.filter((draft) => {
    if (filter === "unreviewed") return !draft.reviewed || draft.decision === "pending";
    if (filter === "blocked") return draft.included && draft.sourceApproval.status !== "approved";
    if (filter === "candidates") return draft.kind === "candidate" || draft.included;
    if (filter === "sparse") return draft.warnings.some((warning) => /Sparse|heuristic|low/i.test(warning));
    if (filter === "excluded") return !draft.included || draft.kind === "excluded";
    return true;
  }), [activeDrafts, filter]);

  const blockers = useMemo(() => confirmationBlockers(drafts), [drafts]);
  const selectedDraft = drafts.find((draft) => draft.draftId === selectedDraftId) ?? null;
  const selectedFragment = extraction?.fragments.find((fragment) =>
    selectedDraft?.fragmentIds.includes(fragment.fragmentId)
  ) ?? null;

  function updateDraft(draftId: string, patch: Partial<RequirementDraft>) {
    setDrafts((current) => current.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)));
    setDirty(true);
  }

  function selectDraft(draft: RequirementDraft) {
    setSelectedDraftId(draft.draftId);
    if (draft.pageNumber && fileBuffer) {
      setPreviewPage(draft.pageNumber);
      void loadPreview(fileBuffer, draft.pageNumber);
    }
  }

  async function confirm() {
    if (!extraction) return;
    setConfirmError("");
    const result = finalizePdfImport(name, revision, extraction, drafts);
    if (!result.success) {
      setConfirmError(result.errors.join(" "));
      return;
    }
    setBusy(true);
    try {
      await onConfirm(result.data, {
        fileName: extraction.safeFileName,
        includedRows: result.data.requirements.length,
        excludedRows: activeDrafts
          .filter((draft) => !draft.included)
          .map((draft, index) => ({ sourceRow: index + 1, reason: draft.kind }))
      });
      setDirty(false);
    } catch (confirmErr) {
      setConfirmError(confirmErr instanceof Error ? confirmErr.message : "Confirmation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-200 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> PDF import review
          </CardTitle>
          <CardDescription>
            Extract candidate requirements from project documents, verify them, and preserve the source.
            Digital text only — OCR for scanned pages is not applied in this version.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          if (dirty && !window.confirm("Discard the unsaved PDF import session?")) return;
          onClose();
        }}><X className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file, language);
            }}
          />
          <label className="text-xs">Language
            <select
              className="ml-2 h-8 rounded border px-2"
              value={language}
              onChange={(event) => {
                const next = event.target.value as PdfLanguage;
                setLanguage(next);
                if (initialFile) void loadFile(initialFile, next);
              }}
            >
              <option value="unknown">Auto</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="hr">Hrvatski</option>
            </select>
          </label>
          <input className="h-8 rounded border px-2 text-xs" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="h-8 w-28 rounded border px-2 text-xs" value={revision} onChange={(event) => setRevision(event.target.value)} />
        </div>

        {busy && <p className="flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</p>}
        {error && <p className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}

        {extraction && (
          <>
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <p className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Conservative PDF import</p>
              <ul className="list-disc pl-4">
                {extraction.warnings.slice(0, 8).map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-slate-100 px-2 py-1">{extraction.pageCount} pages</span>
              <span className="rounded bg-slate-100 px-2 py-1">Hash {extraction.contentHash.slice(0, 12)}…</span>
              <span className="rounded bg-slate-100 px-2 py-1">{extraction.fragments.length} fragments</span>
              <span className="rounded bg-slate-100 px-2 py-1">{activeDrafts.filter((draft) => draft.included).length} included</span>
              <span className="rounded bg-slate-100 px-2 py-1">{blockers.length} blockers</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold">Source page preview</span>
                  <select
                    className="h-8 rounded border px-2"
                    value={previewPage}
                    onChange={(event) => {
                      const page = Number(event.target.value);
                      setPreviewPage(page);
                      if (fileBuffer) void loadPreview(fileBuffer, page);
                    }}
                  >
                    {Array.from({ length: extraction.pageCount }, (_, index) => index + 1).map((page) => {
                      const summary = extraction.pages.find((item) => item.pageNumber === page);
                      return (
                        <option key={page} value={page}>
                          Page {page}{summary ? ` (${summary.quality})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="max-h-[32rem] overflow-auto rounded border bg-slate-100 p-2">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt={`PDF page ${previewPage}`} className="mx-auto max-w-full shadow" />
                  ) : (
                    <p className="p-4 text-xs text-slate-600">{previewError || "Preview unavailable."}</p>
                  )}
                </div>
                {selectedFragment && (selectedFragment.sourceAnchor.kind === "pdf_text_block" || selectedFragment.sourceAnchor.kind === "pdf_table_cell") && (
                  <p className="text-[11px] text-slate-600">
                    Selected bbox page {selectedFragment.sourceAnchor.pageNumber}:
                    x={selectedFragment.sourceAnchor.bbox.x.toFixed(1)},
                    y={selectedFragment.sourceAnchor.bbox.y.toFixed(1)},
                    w={selectedFragment.sourceAnchor.bbox.width.toFixed(1)},
                    h={selectedFragment.sourceAnchor.bbox.height.toFixed(1)}
                    {selectedFragment.extractionQuality ? ` · quality ${selectedFragment.extractionQuality}` : ""}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {(["candidates", "unreviewed", "blocked", "sparse", "excluded", "all"] as FilterKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`rounded px-2 py-1 ${filter === key ? "bg-amber-700 text-white" : "bg-slate-100"}`}
                      onClick={() => setFilter(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>

                <div className="max-h-48 overflow-auto rounded border">
                  <ul className="divide-y text-xs">
                    {filteredDrafts.map((draft) => (
                      <li key={draft.draftId}>
                        <button
                          type="button"
                          className={`w-full p-2 text-left hover:bg-amber-50 ${selectedDraftId === draft.draftId ? "bg-amber-50" : ""}`}
                          onClick={() => selectDraft(draft)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px]">{draft.requirementId}</span>
                            <span className="text-[10px] uppercase text-slate-500">
                              p.{draft.pageNumber ?? "?"} · {draft.sourceApproval.status}
                            </span>
                          </div>
                          <p className="font-medium">{draft.title}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {selectedDraft && (
                  <div className="space-y-2 rounded border p-3 text-xs">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label>ID<input className="mt-1 h-8 w-full rounded border px-2" value={selectedDraft.requirementId} onChange={(event) => updateDraft(selectedDraft.draftId, { requirementId: event.target.value })} /></label>
                      <label>Severity
                        <select className="mt-1 h-8 w-full rounded border px-2" value={selectedDraft.severity} onChange={(event) => updateDraft(selectedDraft.draftId, { severity: event.target.value as RequirementDraft["severity"] })}>
                          <option value="info">info</option>
                          <option value="warning">warning</option>
                          <option value="critical">critical</option>
                        </select>
                      </label>
                    </div>
                    <label>Title<input className="mt-1 h-8 w-full rounded border px-2" value={selectedDraft.title} onChange={(event) => updateDraft(selectedDraft.draftId, { title: event.target.value })} /></label>
                    <label>Derived requirement text
                      <textarea className="mt-1 min-h-24 w-full rounded border px-2 py-1" value={selectedDraft.description} onChange={(event) => updateDraft(selectedDraft.draftId, { description: event.target.value })} />
                    </label>
                    {selectedDraft.warnings.length > 0 && (
                      <ul className="list-disc pl-4 text-amber-800">{selectedDraft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedDraft.included}
                          onChange={(event) => updateDraft(selectedDraft.draftId, {
                            included: event.target.checked,
                            kind: event.target.checked ? "candidate" : "excluded",
                            status: event.target.checked ? "requires_rule_configuration" : "excluded",
                            decision: event.target.checked ? selectedDraft.decision : "accepted",
                            reviewed: true
                          })}
                        /> Include
                      </label>
                      <Button size="sm" onClick={() => {
                        setDrafts((current) => current.map((draft) =>
                          draft.draftId === selectedDraft.draftId ? approvePdfDraftSource(draft, sessionActor, true) : draft
                        ));
                        setDirty(true);
                      }}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve source</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setDrafts((current) => current.map((draft) =>
                          draft.draftId === selectedDraft.draftId ? approvePdfDraftSource(draft, sessionActor, false) : draft
                        ));
                        setDirty(true);
                      }}>Reject</Button>
                      <Button size="sm" variant="outline" onClick={() => updateDraft(selectedDraft.draftId, {
                        included: true,
                        kind: "informational",
                        status: "informational",
                        decision: "accepted",
                        reviewed: true,
                        sourceApproval: selectedDraft.sourceApproval.status === "approved"
                          ? selectedDraft.sourceApproval
                          : { status: "approved", approvedBy: sessionActor, approvedAt: new Date().toISOString() }
                      })}>Mark informational</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {confirmError && <p className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{confirmError}</p>}
            {blockers.length > 0 && (
              <details className="text-xs text-slate-600">
                <summary>{blockers.length} confirmation blockers</summary>
                <ul className="mt-1 list-disc pl-5">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
              </details>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                if (dirty && !window.confirm("Discard the unsaved PDF import session?")) return;
                onClose();
              }}>Cancel</Button>
              <Button disabled={busy || blockers.length > 0} onClick={() => void confirm()}>
                Confirm import
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
