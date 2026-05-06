import { sampleModelData, sampleRequirements } from "@/domain/sampleData";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import type { ValidationStatus } from "@/domain/types";
import { AdasChatPanel } from "@/components/AdasChatPanel";

function statusClass(status: ValidationStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-700 bg-emerald-50 text-emerald-900";
    case "fail":
      return "border-rose-700 bg-rose-50 text-rose-900";
    case "unknown":
      return "border-amber-700 bg-amber-50 text-amber-900";
    default:
      return "border-slate-300 bg-slate-50 text-slate-900";
  }
}

function statusBadgeClass(status: ValidationStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-300 bg-emerald-100 text-emerald-900";
    case "fail":
      return "border-rose-300 bg-rose-100 text-rose-900";
    case "unknown":
      return "border-amber-300 bg-amber-100 text-amber-900";
    default:
      return "border-slate-300 bg-slate-100 text-slate-900";
  }
}

function severityBadgeClass(severity: "info" | "warning" | "critical"): string {
  switch (severity) {
    case "critical":
      return "border-rose-300 bg-rose-100 text-rose-900";
    case "warning":
      return "border-amber-300 bg-amber-100 text-amber-900";
    case "info":
      return "border-sky-300 bg-sky-100 text-sky-900";
    default:
      return "border-slate-300 bg-slate-100 text-slate-900";
  }
}

export default function Home() {
  const { model, requirements, results } = validateWithDeterministicRules(
    sampleModelData,
    sampleRequirements
  );
  const passCount = results.filter((result) => result.status === "pass").length;
  const failCount = results.filter((result) => result.status === "fail").length;
  const unknownCount = results.filter((result) => result.status === "unknown").length;
  const criticalIssuesCount = results.filter(
    (result) => result.status === "fail" && result.severity === "critical"
  ).length;

  return (
    <main className="min-h-screen px-4 py-7 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-md border border-slate-300 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight">ADAS Spec Validator</h1>
          <p className="mt-1 text-sm text-slate-600">
            Deterministic validation for CAD/BIM model requirements
          </p>
          <p className="mt-3 border-l-2 border-slate-400 pl-3 text-sm font-medium text-slate-700">
            Rules validate first. AI explains second.
          </p>
        </header>

        <section className="rounded-md border border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-700 shadow-sm">
          Model Data <span className="px-2 text-slate-400">→</span> Rule Engine{" "}
          <span className="px-2 text-slate-400">→</span> Evidence{" "}
          <span className="px-2 text-slate-400">→</span> AI Explanation
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Why this matters</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>CAD/BIM model facts are validated deterministically before AI is used.</li>
              <li>Missing model data stays unknown rather than guessed.</li>
              <li>ADAS Chat is constrained to validation evidence and model facts.</li>
              <li>The C# extractor prototype shows the Revit/AutoCAD integration boundary.</li>
            </ul>
          </article>

          <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Source of Truth</h2>
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>Revit/AutoCAD Extractor Prototype</p>
              <p className="text-slate-400">↓</p>
              <p>Normalized Model Data</p>
              <p className="text-slate-400">↓</p>
              <p>Deterministic Rule Engine</p>
              <p className="text-slate-400">↓</p>
              <p>Evidence Store</p>
              <p className="text-slate-400">↓</p>
              <p>Role-Aware ADAS Chat</p>
            </div>
            <p className="mt-3 border-l-2 border-slate-500 pl-3 text-sm font-semibold text-slate-800">
              The LLM is not the source of truth.
            </p>
          </article>
        </section>

        <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="space-y-5">
            <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Model Data</h2>
              <pre className="max-h-52 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
                {JSON.stringify(model, null, 2)}
              </pre>
            </article>

            <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Requirements</h2>
              <pre className="max-h-52 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
                {JSON.stringify(requirements, null, 2)}
              </pre>
            </article>
          </section>

          <section className="space-y-5">
            <AdasChatPanel normalizedModel={model} validationResults={results} />

            <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Validation Results</h2>
              <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
                <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs">
                  <p className="uppercase tracking-wide text-emerald-800">Pass</p>
                  <p className="text-lg font-semibold text-emerald-900">{passCount}</p>
                </div>
                <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs">
                  <p className="uppercase tracking-wide text-rose-800">Fail</p>
                  <p className="text-lg font-semibold text-rose-900">{failCount}</p>
                </div>
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
                  <p className="uppercase tracking-wide text-amber-800">Unknown</p>
                  <p className="text-lg font-semibold text-amber-900">{unknownCount}</p>
                </div>
                <div className="rounded border border-slate-300 bg-slate-100 p-2 text-xs">
                  <p className="uppercase tracking-wide text-slate-700">Critical issues</p>
                  <p className="text-lg font-semibold text-slate-900">{criticalIssuesCount}</p>
                </div>
              </div>

              <ul className="space-y-4">
                {results.map((result, resultIndex) => (
                  <li
                    key={`${result.requirementId}-${resultIndex}`}
                    className={`rounded border p-4 ${statusClass(result.status)}`}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(
                          result.status
                        )}`}
                      >
                        {result.status}
                      </span>
                      <span
                        className={`rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${severityBadgeClass(
                          result.severity
                        )}`}
                      >
                        {result.severity}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-700">
                      <p>
                        Requirement ID: <span className="font-semibold">{result.requirementId}</span>
                      </p>
                      <p>
                        Affected element IDs:{" "}
                        <span className="font-semibold">
                          {result.affectedElementIds.length > 0
                            ? result.affectedElementIds.join(", ")
                            : "none"}
                        </span>
                      </p>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-relaxed text-slate-900">{result.summary}</p>
                    <div className="mt-3 rounded border border-slate-200 bg-white/80 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Evidence</p>
                      <ul className="mt-2 space-y-2">
                        {result.evidence.map((item, evidenceIndex) => (
                          <li
                            key={`${result.ruleId}-${resultIndex}-${evidenceIndex}`}
                            className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
                          >
                            <p className="leading-relaxed">{item.message}</p>
                            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                              <p>
                                Observed: <span className="font-semibold">{String(item.observed ?? "null")}</span>
                              </p>
                              <p>
                                Expected: <span className="font-semibold">{String(item.expected ?? "n/a")}</span>
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="mt-3 text-xs text-slate-600">
                      Requirement: <span className="font-semibold">{result.requirementTitle}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Evidence Store Note</h2>
              <p className="text-sm text-slate-700">
                All claims shown in ADAS Chat come from deterministic rule outputs above. Unknown states are preserved
                until model facts are completed.
              </p>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}
