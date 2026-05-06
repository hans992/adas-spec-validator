"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Database,
  FileJson,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Workflow
} from "lucide-react";
import { AdasChatPanel } from "@/components/AdasChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { sampleModelData, sampleRequirements } from "@/domain/sampleData";
import {
  parseUploadedJson,
  validateUploadedModel,
  validateUploadedRequirements
} from "@/domain/uploadHelpers";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import type { NormalizedModel, Requirement, ValidationSeverity, ValidationStatus } from "@/domain/types";

type DataSourceStatus = "sample" | "uploaded";

function statusBackgroundClass(status: ValidationStatus): string {
  switch (status) {
    case "pass":
      return "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20";
    case "fail":
      return "border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20";
    case "unknown":
      return "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20";
    default:
      return "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900";
  }
}

function statusBadgeVariant(status: ValidationStatus): "success" | "warning" | "destructive" | "default" {
  if (status === "pass") return "success";
  if (status === "fail") return "destructive";
  if (status === "unknown") return "warning";
  return "default";
}

function severityBadgeVariant(severity: ValidationSeverity): "warning" | "destructive" | "default" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "warning";
  return "default";
}

export default function Home() {
  const [modelData, setModelData] = useState<NormalizedModel>(sampleModelData);
  const [requirementsData, setRequirementsData] = useState<Requirement[]>(sampleRequirements);
  const [modelSource, setModelSource] = useState<DataSourceStatus>("sample");
  const [requirementsSource, setRequirementsSource] = useState<DataSourceStatus>("sample");
  const [modelError, setModelError] = useState("");
  const [requirementsError, setRequirementsError] = useState("");
  const [modelFilename, setModelFilename] = useState("");
  const [requirementsFilename, setRequirementsFilename] = useState("");

  const { model, requirements, results } = useMemo(
    () => validateWithDeterministicRules(modelData, requirementsData),
    [modelData, requirementsData]
  );

  const passCount = results.filter((result) => result.status === "pass").length;
  const failCount = results.filter((result) => result.status === "fail").length;
  const unknownCount = results.filter((result) => result.status === "unknown").length;
  const criticalIssuesCount = results.filter(
    (result) => result.status === "fail" && result.severity === "critical"
  ).length;

  const dataSourceLabel =
    modelSource === "sample" && requirementsSource === "sample"
      ? "Sample data"
      : modelSource === "uploaded" && requirementsSource === "sample"
        ? "Uploaded model"
        : modelSource === "sample" && requirementsSource === "uploaded"
          ? "Uploaded requirements"
          : "Uploaded model + requirements";

  const handleModelFile = useCallback(async (file: File) => {
    const rawText = await file.text();
    const parseResult = parseUploadedJson(rawText);
    if (!parseResult.success) {
      setModelError(parseResult.error);
      return;
    }

    const validationResult = validateUploadedModel(parseResult.data);
    if (!validationResult.success) {
      setModelError(validationResult.error);
      return;
    }

    setModelData(validationResult.data);
    setModelSource("uploaded");
    setModelFilename(file.name);
    setModelError("");
  }, []);

  const handleRequirementsFile = useCallback(async (file: File) => {
    const rawText = await file.text();
    const parseResult = parseUploadedJson(rawText);
    if (!parseResult.success) {
      setRequirementsError(parseResult.error);
      return;
    }

    const validationResult = validateUploadedRequirements(parseResult.data);
    if (!validationResult.success) {
      setRequirementsError(validationResult.error);
      return;
    }

    setRequirementsData(validationResult.data);
    setRequirementsSource("uploaded");
    setRequirementsFilename(file.name);
    setRequirementsError("");
  }, []);

  const modelDropzone = useDropzone({
    accept: { "application/json": [".json"] },
    maxFiles: 1,
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file !== undefined) {
        void handleModelFile(file);
      }
    }
  });

  const requirementsDropzone = useDropzone({
    accept: { "application/json": [".json"] },
    maxFiles: 1,
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file !== undefined) {
        void handleRequirementsFile(file);
      }
    }
  });

  function resetToSampleData() {
    setModelData(sampleModelData);
    setRequirementsData(sampleRequirements);
    setModelSource("sample");
    setRequirementsSource("sample");
    setModelError("");
    setRequirementsError("");
    setModelFilename("");
    setRequirementsFilename("");
  }

  return (
    <main className="min-h-screen px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <Card className="backdrop-blur-sm">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-start justify-between gap-3">
              <Badge variant="outline" className="uppercase tracking-wide">
                AI Design Automation Prototype
              </Badge>
              <ThemeToggle />
            </div>
            <CardTitle className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
              ADAS Spec Validator
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Deterministic AI validation for CAD/BIM model requirements
            </CardDescription>
            <p className="border-l-2 border-slate-400 pl-3 text-sm font-medium text-slate-700 dark:text-slate-200">
              Rules validate first. AI explains second.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pb-5">
            <Badge variant="outline">C# Extractor Boundary</Badge>
            <Badge variant="outline">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              Deterministic Rules
            </Badge>
            <Badge variant="outline">
              <Brain className="mr-1 h-3.5 w-3.5" />
              Evidence-Constrained AI
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-3 text-xs font-medium sm:text-sm">
            <Badge variant="outline">
              <Database className="mr-1 h-3.5 w-3.5" />
              Model Data
            </Badge>
            <Workflow className="h-3.5 w-3.5 text-slate-400" />
            <Badge variant="outline">Rule Engine</Badge>
            <Workflow className="h-3.5 w-3.5 text-slate-400" />
            <Badge variant="outline">Evidence</Badge>
            <Workflow className="h-3.5 w-3.5 text-slate-400" />
            <Badge variant="outline">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              AI Explanation
            </Badge>
          </CardContent>
        </Card>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">System Context</p>
              <CardTitle>Why this matters</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
                <li>CAD/BIM model facts are validated deterministically before AI is used.</li>
                <li>Missing model data stays unknown rather than guessed.</li>
                <li>ADAS Chat is constrained to validation evidence and model facts.</li>
                <li>The C# extractor prototype shows the Revit/AutoCAD integration boundary.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Governance</p>
              <CardTitle>Source of Truth</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <p className="font-medium">Revit/AutoCAD Extractor Prototype</p>
                <p className="text-slate-400">↓</p>
                <p className="font-medium">Normalized Model Data</p>
                <p className="text-slate-400">↓</p>
                <p className="font-medium">Deterministic Rule Engine</p>
                <p className="text-slate-400">↓</p>
                <p className="font-medium">Evidence Store</p>
                <p className="text-slate-400">↓</p>
                <p className="font-medium">Role-Aware ADAS Chat</p>
              </div>
              <Alert className="font-semibold">The LLM is not the source of truth.</Alert>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Data Source</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Upload normalized JSON only. Files are parsed and validated client-side.
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={resetToSampleData}>
                Reset to sample data
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-xs md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-slate-500">Current source</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{dataSourceLabel}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-slate-500">Model</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {model.rooms.length} rooms / {model.doors.length} doors / {model.levels.length} levels
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-slate-500">Requirements</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{requirements.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-slate-500">Validation</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                  {passCount} pass / {failCount} fail / {unknownCount} unknown
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-2">
              <div
                {...modelDropzone.getRootProps()}
                className={`cursor-pointer rounded-lg border border-dashed p-4 transition ${
                  modelDropzone.isDragActive
                    ? "border-indigo-400 bg-indigo-50 dark:border-indigo-400/80 dark:bg-indigo-950/30"
                    : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                }`}
              >
                <input {...modelDropzone.getInputProps()} />
                <div className="flex items-start gap-3">
                  <UploadCloud className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Upload Model JSON</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Accepts normalized model format (`levels`, `rooms`, `doors`)
                    </p>
                    <p className="text-xs text-slate-500">
                      {modelDropzone.isDragActive
                        ? "Drop model JSON file here"
                        : modelFilename.length > 0
                          ? `Loaded: ${modelFilename}`
                          : "Drag and drop or click to select"}
                    </p>
                  </div>
                </div>
                {modelError.length > 0 ? (
                  <Alert variant="destructive" className="mt-3">
                    {modelError}
                  </Alert>
                ) : null}
              </div>

              <div
                {...requirementsDropzone.getRootProps()}
                className={`cursor-pointer rounded-lg border border-dashed p-4 transition ${
                  requirementsDropzone.isDragActive
                    ? "border-indigo-400 bg-indigo-50 dark:border-indigo-400/80 dark:bg-indigo-950/30"
                    : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                }`}
              >
                <input {...requirementsDropzone.getInputProps()} />
                <div className="flex items-start gap-3">
                  <FileJson className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Upload Requirements JSON</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Accepts requirement array for deterministic rule checks
                    </p>
                    <p className="text-xs text-slate-500">
                      {requirementsDropzone.isDragActive
                        ? "Drop requirements JSON file here"
                        : requirementsFilename.length > 0
                          ? `Loaded: ${requirementsFilename}`
                          : "Drag and drop or click to select"}
                    </p>
                  </div>
                </div>
                {requirementsError.length > 0 ? (
                  <Alert variant="destructive" className="mt-3">
                    {requirementsError}
                  </Alert>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Model Data</CardTitle>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    normalized-model.json
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="max-h-56 overflow-auto rounded-lg border border-slate-700/20 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                  {JSON.stringify(model, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Requirements</CardTitle>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    requirements.json
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="max-h-56 overflow-auto rounded-lg border border-slate-700/20 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                  {JSON.stringify(requirements, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-5">
            <AdasChatPanel normalizedModel={model} validationResults={results} />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Validation Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="uppercase tracking-wide text-slate-500">Pass</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{passCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="uppercase tracking-wide text-slate-500">Fail</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{failCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="uppercase tracking-wide text-slate-500">Unknown</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{unknownCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="uppercase tracking-wide text-slate-500">Critical issues</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{criticalIssuesCount}</p>
                  </div>
                </div>

                <ul className="space-y-4">
                  {results.map((result, resultIndex) => (
                    <li
                      key={`${result.requirementId}-${resultIndex}`}
                      className={`rounded-lg border p-4 shadow-sm ${statusBackgroundClass(result.status)}`}
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant={statusBadgeVariant(result.status)}>{result.status}</Badge>
                        <Badge variant={severityBadgeVariant(result.severity)}>{result.severity}</Badge>
                        {result.status !== "pass" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        )}
                      </div>
                      <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
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
                      <p className="mt-3 text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">
                        {result.summary}
                      </p>
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                          Evidence
                        </p>
                        <ul className="mt-2 space-y-2">
                          {result.evidence.map((item, evidenceIndex) => (
                            <li
                              key={`${result.ruleId}-${resultIndex}-${evidenceIndex}`}
                              className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
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
                      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                        Requirement: <span className="font-semibold">{result.requirementTitle}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Evidence Store Note</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  All ADAS Chat answers are constrained to deterministic validation evidence generated from the
                  currently loaded normalized model data and requirements.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
