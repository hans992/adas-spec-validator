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
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
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

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Why this matters</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>- CAD/BIM model facts are validated deterministically before AI is used.</li>
              <li>- Missing model data stays unknown rather than guessed.</li>
              <li>- ADAS Chat is constrained to validation evidence and model facts.</li>
              <li>- The C# extractor prototype shows the Revit/AutoCAD integration boundary.</li>
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

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-6">
            <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Model Data</h2>
              <pre className="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(model, null, 2)}
              </pre>
            </article>

            <article className="rounded-md border border-slate-300 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Requirements</h2>
              <pre className="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(requirements, null, 2)}
              </pre>
            </article>
          </section>

          <section className="space-y-6">
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

              <ul className="space-y-3">
                {results.map((result, resultIndex) => (
                  <li
                    key={`${result.requirementId}-${resultIndex}`}
                    className={`rounded border p-3 ${statusClass(result.status)}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-widest">status: {result.status}</span>
                      <span className="text-xs uppercase tracking-wide">severity: {result.severity}</span>
                    </div>
                    <p className="text-xs text-slate-700">
                      requirement id: <span className="font-semibold">{result.requirementId}</span>
                    </p>
                    <p className="text-xs text-slate-700">
                      requirement: <span className="font-semibold">{result.requirementTitle}</span>
                    </p>
                    <p className="mt-2 text-sm font-medium">{result.summary}</p>
                    <p className="mt-2 text-xs">
                      affected element ids:{" "}
                      <span className="font-semibold">
                        {result.affectedElementIds.length > 0
                          ? result.affectedElementIds.join(", ")
                          : "none"}
                      </span>
                    </p>
                    <div className="mt-3 rounded border border-slate-200 bg-white/70 p-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">evidence items</p>
                      <ul className="mt-1 space-y-2 text-xs text-slate-700">
                        {result.evidence.map((item, evidenceIndex) => (
                          <li key={`${result.ruleId}-${resultIndex}-${evidenceIndex}`}>
                            <p>message: {item.message}</p>
                            <p>observed: {String(item.observed ?? "null")}</p>
                            <p>expected: {String(item.expected ?? "n/a")}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
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
