import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Shared empty / guidance panel used across modules. Always answers:
 * what the user does here, which format is expected, an example, the next
 * step, and — when provided — a concrete error message.
 */
export function EmptyState({
  title,
  what,
  format,
  example,
  nextStep,
  error,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary
}: {
  title: string;
  what: string;
  format?: string;
  example?: string;
  nextStep: string;
  error?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className={`rounded-lg border p-3 text-left ${error ? "border-rose-200 bg-rose-50/40" : "border-dashed bg-slate-50/60 dark:bg-slate-900/40"}`}>
      <p className={`text-xs font-semibold ${error ? "text-rose-800" : ""}`}>{title}</p>
      <dl className="mt-2 space-y-1.5 text-[10px] text-slate-600 dark:text-slate-400">
        <Row label="What you do here" value={what} />
        {format && <Row label="Format" value={format} />}
        {example && <Row label="Example" value={example} />}
        <Row label="Next step" value={nextStep} />
        {error && <Row label="Error" value={error} tone="error" />}
      </dl>
      {(actionLabel || secondaryLabel) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actionLabel && onAction && (
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: "error" }) {
  return (
    <div>
      <dt className="font-semibold text-slate-700 dark:text-slate-300">{label}</dt>
      <dd className={tone === "error" ? "text-rose-700" : ""}>{value}</dd>
    </div>
  );
}
