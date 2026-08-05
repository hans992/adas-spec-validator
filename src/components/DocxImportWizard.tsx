"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitMerge,
  Loader2,
  Scissors,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  extractSpecificationDocx,
  type DocxExtraction,
  type DocxLanguage
} from "@/domain/specificationDocx";
import {
  approveDraftSource,
  confirmationBlockers,
  createInitialDrafts,
  finalizeDocxImport,
  mergeDrafts,
  splitDraft,
  type RequirementDraft
} from "@/domain/specificationDocxDrafts";
import type { SpecificationPackage } from "@/domain/types";

type ConfirmMeta = {
  fileName: string;
  includedRows: number;
  excludedRows: Array<{ sourceRow: number; reason: string }>;
};

type FilterKey = "all" | "unreviewed" | "blocked" | "ai" | "informational" | "excluded" | "candidates";

export function DocxImportWizard({
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
  const [extraction, setExtraction] = useState<DocxExtraction | null>(null);
  const [drafts, setDrafts] = useState<RequirementDraft[]>([]);
  const [history, setHistory] = useState<RequirementDraft[][]>([]);
  const [future, setFuture] = useState<RequirementDraft[][]>([]);
  const [name, setName] = useState("Imported DOCX specification");
  const [revision, setRevision] = useState("Draft");
  const [language, setLanguage] = useState<DocxLanguage>("unknown");
  const [filter, setFilter] = useState<FilterKey>("candidates");
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [loadedInitialFile, setLoadedInitialFile] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function pushHistory(next: RequirementDraft[]) {
    setHistory((current) => [...current.slice(-40), drafts]);
    setFuture([]);
    setDrafts(next);
    setDirty(true);
  }

  function undo() {
    setHistory((current) => {
      if (current.length === 0) return current;
      const previous = current[current.length - 1];
      setFuture((ahead) => [drafts, ...ahead]);
      setDrafts(previous);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setFuture((current) => {
      if (current.length === 0) return current;
      const [next, ...rest] = current;
      setHistory((past) => [...past, drafts]);
      setDrafts(next);
      return rest;
    });
  }

  async function loadFile(file: File, languageOverride?: DocxLanguage) {
    setBusy(true);
    setError("");
    setConfirmError("");
    try {
      const result = await extractSpecificationDocx(
        await file.arrayBuffer(),
        file.name,
        file.type,
        languageOverride && languageOverride !== "unknown" ? { language: languageOverride } : undefined
      );
      if (!result.success) throw new Error(result.error);
      setExtraction(result.data);
      setLanguage(result.data.language);
      setName(result.data.metadata.title || result.data.safeFileName.replace(/\.docx$/i, "") || "Imported DOCX specification");
      const initialDrafts = createInitialDrafts(result.data);
      setDrafts(initialDrafts);
      setHistory([]);
      setFuture([]);
      setDirty(true);
      const firstCandidate = initialDrafts.find((draft) => draft.kind === "candidate" && !draft.superseded);
      setSelectedDraftId(firstCandidate?.draftId ?? null);
      setSelectedFragmentId(firstCandidate?.fragmentIds[0] ?? result.data.fragments[0]?.fragmentId ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "DOCX import failed.");
      setExtraction(null);
      setDrafts([]);
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

  const filteredDrafts = useMemo(() => {
    return activeDrafts.filter((draft) => {
      if (filter === "unreviewed") return !draft.reviewed || draft.decision === "pending";
      if (filter === "blocked") return draft.included && draft.sourceApproval.status !== "approved";
      if (filter === "ai") return draft.kind === "ai_suggestion";
      if (filter === "informational") return draft.kind === "informational" || draft.status === "informational";
      if (filter === "excluded") return !draft.included || draft.kind === "excluded";
      if (filter === "candidates") return draft.kind === "candidate" || draft.included;
      return true;
    });
  }, [activeDrafts, filter]);

  const fragmentList = useMemo(() => {
    if (!extraction) return [];
    const query = search.trim().toLowerCase();
    return extraction.fragments.filter((fragment) => {
      if (!query) return true;
      return fragment.exactText.toLowerCase().includes(query)
        || fragment.headingPath.join(" ").toLowerCase().includes(query)
        || (fragment.numberingLabel?.toLowerCase().includes(query) ?? false);
    });
  }, [extraction, search]);

  const sectionProgress = useMemo(() => {
    const map = new Map<string, { total: number; approved: number }>();
    for (const draft of activeDrafts.filter((item) => item.included || item.kind === "candidate")) {
      const section = draft.textRanges[0]
        ? extraction?.fragments.find((fragment) => fragment.fragmentId === draft.fragmentIds[0])?.headingPath[0] ?? "Document"
        : "Document";
      const current = map.get(section) ?? { total: 0, approved: 0 };
      current.total += 1;
      if (draft.sourceApproval.status === "approved" && draft.decision !== "pending") current.approved += 1;
      map.set(section, current);
    }
    return [...map.entries()];
  }, [activeDrafts, extraction]);

  const blockers = useMemo(() => confirmationBlockers(drafts), [drafts]);
  const selectedDraft = drafts.find((draft) => draft.draftId === selectedDraftId) ?? null;
  const selectedFragment = extraction?.fragments.find((fragment) => fragment.fragmentId === selectedFragmentId) ?? null;

  function updateDraft(draftId: string, patch: Partial<RequirementDraft>) {
    pushHistory(drafts.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)));
  }

  function approveSelected(approved = true) {
    if (!selectedDraft) return;
    pushHistory(drafts.map((draft) => (
      draft.draftId === selectedDraft.draftId ? approveDraftSource(draft, sessionActor, approved) : draft
    )));
  }

  function approveAllDeterministicInSection(section: string) {
    pushHistory(drafts.map((draft) => {
      if (draft.superseded || draft.origin !== "deterministic" || !draft.included) return draft;
      const fragment = extraction?.fragments.find((item) => item.fragmentId === draft.fragmentIds[0]);
      const draftSection = fragment?.headingPath[0] ?? "Document";
      if (draftSection !== section) return draft;
      return approveDraftSource(draft, sessionActor, true);
    }));
  }

  function mergeSelected() {
    if (!selectedDraft) return;
    const siblings = activeDrafts.filter((draft) => draft.included && draft.draftId !== selectedDraft.draftId);
    const partner = siblings.find((draft) => draft.fragmentIds.some((id) => selectedDraft.fragmentIds.includes(id)))
      ?? siblings[0];
    if (!partner) return;
    pushHistory(mergeDrafts(drafts, [selectedDraft.draftId, partner.draftId], sessionActor));
  }

  function splitSelected() {
    if (!selectedDraft || selectedDraft.textRanges.length !== 1) return;
    const midpoint = Math.floor(selectedDraft.textRanges[0].exactText.length / 2);
    const splitAt = selectedDraft.textRanges[0].exactText.indexOf(". ", midpoint);
    const offset = splitAt > 0 ? splitAt + 1 : midpoint;
    pushHistory(splitDraft(drafts, selectedDraft.draftId, offset, sessionActor));
  }

  async function confirm() {
    if (!extraction) return;
    setConfirmError("");
    const result = finalizeDocxImport(name, revision, extraction, drafts);
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
    <Card className="border-indigo-200 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> DOCX import review
          </CardTitle>
          <CardDescription>
            Reconstructed document structure on the left; editable requirement drafts on the right.
            Nothing is saved until you confirm.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          if (dirty && !window.confirm("Discard the unsaved DOCX import session?")) return;
          onClose();
        }}><X className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                const next = event.target.value as DocxLanguage;
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
          <input className="h-8 rounded border px-2 text-xs" value={name} onChange={(event) => setName(event.target.value)} placeholder="Package name" />
          <input className="h-8 w-28 rounded border px-2 text-xs" value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="Revision" />
          <Button variant="outline" size="sm" disabled={history.length === 0} onClick={undo}>Undo</Button>
          <Button variant="outline" size="sm" disabled={future.length === 0} onClick={redo}>Redo</Button>
        </div>

        {busy && <p className="flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</p>}
        {error && <p className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}

        {extraction && (
          <>
            {extraction.warnings.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Extraction warnings</p>
                <ul className="list-disc pl-4">{extraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-slate-100 px-2 py-1">Hash {extraction.contentHash.slice(0, 12)}…</span>
              <span className="rounded bg-slate-100 px-2 py-1">Parser {extraction.parserVersion}</span>
              <span className="rounded bg-slate-100 px-2 py-1">{extraction.fragments.length} fragments</span>
              <span className="rounded bg-slate-100 px-2 py-1">{activeDrafts.filter((draft) => draft.included).length} included</span>
              <span className="rounded bg-slate-100 px-2 py-1">{blockers.length} blockers</span>
            </div>

            {sectionProgress.length > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {sectionProgress.map(([section, progress]) => (
                  <button
                    key={section}
                    type="button"
                    className="rounded border px-2 py-1 hover:bg-slate-50"
                    onClick={() => approveAllDeterministicInSection(section)}
                    title="Approve all deterministic candidates in this section"
                  >
                    {section}: {progress.approved}/{progress.total}
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="max-h-[32rem] overflow-auto rounded border">
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-slate-50 p-2">
                  <p className="text-xs font-semibold">Document structure</p>
                  <input
                    className="h-7 flex-1 rounded border px-2 text-xs"
                    placeholder="Search source text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <ul className="divide-y text-xs">
                  {fragmentList.map((fragment) => {
                    const linked = drafts.filter((draft) => !draft.superseded && draft.fragmentIds.includes(fragment.fragmentId));
                    return (
                      <li key={fragment.fragmentId}>
                        <button
                          type="button"
                          className={`w-full p-2 text-left hover:bg-indigo-50 ${selectedFragmentId === fragment.fragmentId ? "bg-indigo-50" : ""}`}
                          onClick={() => {
                            setSelectedFragmentId(fragment.fragmentId);
                            const linkedDraft = linked[0];
                            if (linkedDraft) setSelectedDraftId(linkedDraft.draftId);
                          }}
                        >
                          <div className="mb-1 flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-slate-500">
                            <span>{fragment.kind}</span>
                            {fragment.numberingLabel && <span>{fragment.numberingLabel}</span>}
                            {fragment.revisionContent && <span className="text-amber-700">revision</span>}
                            {linked.length > 0 && <span className="text-indigo-700">{linked.length} req</span>}
                          </div>
                          {fragment.headingPath.length > 0 && (
                            <p className="mb-1 text-[10px] text-slate-500">{fragment.headingPath.join(" / ")}</p>
                          )}
                          <p className="whitespace-pre-wrap text-slate-800">{fragment.exactText}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {(["candidates", "unreviewed", "blocked", "informational", "excluded", "ai", "all"] as FilterKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`rounded px-2 py-1 ${filter === key ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
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
                          className={`w-full p-2 text-left hover:bg-slate-50 ${selectedDraftId === draft.draftId ? "bg-slate-100" : ""}`}
                          onClick={() => {
                            setSelectedDraftId(draft.draftId);
                            setSelectedFragmentId(draft.fragmentIds[0] ?? null);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px]">{draft.requirementId}</span>
                            <span className="text-[10px] uppercase text-slate-500">{draft.sourceApproval.status}</span>
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
                    {selectedFragment && (
                      <div className="rounded bg-slate-50 p-2">
                        <p className="mb-1 font-semibold">Linked source fragment</p>
                        <p className="whitespace-pre-wrap text-slate-700">{selectedFragment.exactText}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Ranges: {selectedDraft.textRanges.map((range) => `${range.startOffset}-${range.endOffset}`).join(", ")}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={selectedDraft.included} onChange={(event) => updateDraft(selectedDraft.draftId, {
                          included: event.target.checked,
                          kind: event.target.checked ? "candidate" : "excluded",
                          status: event.target.checked ? "requires_rule_configuration" : "excluded",
                          decision: event.target.checked ? selectedDraft.decision : "accepted",
                          reviewed: true
                        })} /> Include
                      </label>
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
                      <Button size="sm" onClick={() => approveSelected(true)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve source</Button>
                      <Button size="sm" variant="outline" onClick={() => approveSelected(false)}>Reject source</Button>
                      <Button size="sm" variant="outline" onClick={mergeSelected}><GitMerge className="mr-1 h-3.5 w-3.5" /> Merge</Button>
                      <Button size="sm" variant="outline" onClick={splitSelected}><Scissors className="mr-1 h-3.5 w-3.5" /> Split</Button>
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
                if (dirty && !window.confirm("Discard the unsaved DOCX import session?")) return;
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
