"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export type OnboardingStepId =
  | "project"
  | "model"
  | "specification"
  | "mapping"
  | "validate"
  | "findings"
  | "review"
  | "export";

const STEPS: Array<{ id: OnboardingStepId; title: string; detail: string }> = [
  { id: "project", title: "Create or open a project", detail: "Projects keep models, specifications, runs and reviews together." },
  { id: "model", title: "Upload a model", detail: "IFC or normalized JSON — the design package you want to check." },
  { id: "specification", title: "Upload a specification", detail: "JSON, CSV, or a reviewed XLSX / DOCX / PDF package." },
  { id: "mapping", title: "Map and review requirements", detail: "Confirm rule types, units and source clauses before validation." },
  { id: "validate", title: "Run the first validation", detail: "The server re-runs deterministic rules and stores an immutable snapshot." },
  { id: "findings", title: "Inspect findings", detail: "Open the report to see pass, fail and unknown outcomes with evidence." },
  { id: "review", title: "Record a review decision", detail: "Acknowledge, resolve or waive with a reason and optional expiry." },
  { id: "export", title: "Export an audit package", detail: "Download the checksummed ZIP for the saved run." }
];

/**
 * Guided first-run checklist. Progress is derived from real workspace state so
 * it survives refresh and never claims a step the product cannot do.
 */
export function OnboardingChecklist({
  completed,
  busy,
  onLoadDemo,
  onDismiss,
  visible
}: {
  completed: Partial<Record<OnboardingStepId, boolean>>;
  busy?: boolean;
  onLoadDemo: () => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const doneCount = useMemo(
    () => STEPS.filter((step) => completed[step.id]).length,
    [completed]
  );

  useEffect(() => {
    if (doneCount === STEPS.length) setCollapsed(true);
  }, [doneCount]);

  if (!visible) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-left dark:border-indigo-900 dark:bg-indigo-950/30">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-100">
            <Sparkles className="h-3.5 w-3.5" /> First project checklist
          </p>
          <p className="mt-0.5 text-[10px] text-indigo-800/80 dark:text-indigo-200/70">
            {doneCount}/{STEPS.length} complete · Load the demo project to see a finished example with passes, failures, an unknown finding, a waiver and two revisions for regression.
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "Show" : "Hide"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onDismiss}>Dismiss</Button>
        </div>
      </div>
      {!collapsed && (
        <>
          <ol className="mt-2 space-y-1">
            {STEPS.map((step) => {
              const done = Boolean(completed[step.id]);
              return (
                <li key={step.id} className="flex items-start gap-2 text-[10px]">
                  {done
                    ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  <span>
                    <span className={`font-semibold ${done ? "text-emerald-800 dark:text-emerald-300" : ""}`}>{step.title}</span>
                    <span className="block text-slate-500">{step.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-8 text-[11px]"
            disabled={busy}
            onClick={onLoadDemo}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            {busy ? "Creating demo…" : "Load demo project"}
          </Button>
        </>
      )}
    </div>
  );
}
