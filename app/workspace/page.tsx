"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  Building2,
  CheckCircle2,
  FileJson,
  FileText,
  FolderKanban,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  UploadCloud,
  FileDown,
  RefreshCw,
  ChevronRight,
  Users
} from "lucide-react";
import Link from "next/link";

import { AecChatPanel } from "@/components/AecChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BimFloorPlan } from "@/components/BimFloorPlan";
import { BimInspector } from "@/components/BimInspector";
import { RuleBuilder } from "@/components/RuleBuilder";
import { ProjectWorkspace, type ProjectTarget } from "@/components/ProjectWorkspace";
import { RequirementEditor } from "@/components/RequirementEditor";
import { XlsxImportWizard } from "@/components/XlsxImportWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { sampleModelData, sampleRequirements } from "@/domain/sampleData";
import {
  parseUploadedJson,
  parseUploadedSpecificationCsv,
  validateUploadedModel,
  validateUploadedSpecification
} from "@/domain/uploadHelpers";
import type { UploadParseResult } from "@/domain/uploadHelpers";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import { calculateComplianceMetrics } from "@/domain/complianceMetrics";
import type { IfcParseDiagnostics } from "@/domain/ifcParser";
import { exportSpecificationXlsx } from "@/domain/specificationXlsx";
import type { NormalizedModel, Requirement, SpecificationPackage } from "@/domain/types";
import { authenticatedBrowserApi } from "@/persistence/browserApi";

type DataSourceStatus = "sample" | "uploaded";

export default function Home() {
  // Central Data States
  const [modelData, setModelData] = useState<NormalizedModel>(sampleModelData);
  const [requirementsData, setRequirementsData] = useState<Requirement[]>(sampleRequirements);
  const [modelSource, setModelSource] = useState<DataSourceStatus>("sample");
  const [requirementsSource, setRequirementsSource] = useState<DataSourceStatus>("sample");
  const [modelError, setModelError] = useState("");
  const [requirementsError, setRequirementsError] = useState("");
  const [modelFilename, setModelFilename] = useState("");
  const [requirementsFilename, setRequirementsFilename] = useState("");
  const [specificationName, setSpecificationName] = useState("Sample architectural requirements");
  const [specificationRevision, setSpecificationRevision] = useState("Demo");
  const [isParsingIfc, setIsParsingIfc] = useState(false);
  const [ifcDiagnostics, setIfcDiagnostics] = useState<IfcParseDiagnostics | null>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [showXlsxImporter, setShowXlsxImporter] = useState(false);
  const [projectTarget, setProjectTarget] = useState<ProjectTarget | null>(null);
  const [specificationRefreshKey, setSpecificationRefreshKey] = useState(0);
  const [importSummary, setImportSummary] = useState<{
    message: string;
    excludedRows: Array<{ sourceRow: number; reason: string }>;
  } | null>(null);

  // Interactive Selection States
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"room" | "door" | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Tab selections
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"visualizer" | "json">("visualizer");

  // Run the deterministic validation pipeline
  const { model, requirements, results } = useMemo(() => {
    try {
      return validateWithDeterministicRules(modelData, requirementsData);
    } catch {
      // Fallback in case manual state edits bypass validation temporarily
      return { model: modelData, requirements: requirementsData, results: [] };
    }
  }, [modelData, requirementsData]);

  const metrics = useMemo(
    () => calculateComplianceMetrics(requirements, results),
    [requirements, results]
  );
  const passRateDisplay = metrics.passRate === null ? "—" : `${metrics.passRate}%`;
  const coverageDisplay = metrics.coverage === null ? "—" : `${metrics.coverage}%`;

  const dataSourceLabel =
    modelSource === "sample" && requirementsSource === "sample"
      ? "Sample model + standard requirements"
      : modelSource === "uploaded" && requirementsSource === "sample"
        ? `Uploaded: ${modelFilename || "Model"}`
        : modelSource === "sample" && requirementsSource === "uploaded"
          ? `Uploaded Requirements`
          : "Custom workspace model + requirements";

  // Bi-directional selection sync
  const handleSelectElement = useCallback((id: string | null, type: "room" | "door" | null) => {
    setSelectedId(id);
    setSelectedType(type);
  }, []);

  const handleHoverElement = useCallback((id: string | null) => {
    setHoveredId(id);
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
    setSelectedType(null);
  }, []);

  // Update central model data (triggered from live sidebar editor)
  const handleUpdateModel = useCallback((newModel: NormalizedModel) => {
    setModelData(newModel);
  }, []);

  // Visual Rule Injector
  const handleAddRequirement = useCallback((newReq: Requirement) => {
    setRequirementsData((prev) => [newReq, ...prev]);
    setRequirementsSource("uploaded");
  }, []);

  const handleRequirementsChange = useCallback((next: Requirement[]) => {
    setRequirementsData(next);
    setRequirementsSource("uploaded");
    setRequirementsFilename("Edited requirement draft");
  }, []);

  // File parsers
  const handleModelFile = useCallback(async (file: File) => {
    if (file.name.toLowerCase().endsWith(".ifc")) {
      setIsParsingIfc(true);
      setModelError("");
      setIfcDiagnostics(null);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/ifc", { method: "POST", body });
        const payload = await response.json() as {
          model?: unknown;
          diagnostics?: IfcParseDiagnostics;
          error?: string;
        };
        if (!response.ok || payload.model === undefined || payload.diagnostics === undefined) {
          throw new Error(payload.error ?? "The IFC model could not be parsed.");
        }
        const validationResult = validateUploadedModel(payload.model);
        if (!validationResult.success) throw new Error(validationResult.error);

        setModelData(validationResult.data);
        setModelSource("uploaded");
        setModelFilename(file.name);
        setIfcDiagnostics(payload.diagnostics);
        handleDeselect();
      } catch (error) {
        setModelError(error instanceof Error ? error.message : "The IFC model could not be parsed.");
      } finally {
        setIsParsingIfc(false);
      }
      return;
    }

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
    setIfcDiagnostics(null);
    handleDeselect();
  }, [handleDeselect]);

  const handleRequirementsFile = useCallback(async (file: File) => {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      setXlsxFile(file);
      setShowXlsxImporter(true);
      setRequirementsError("");
      return;
    }
    const rawText = await file.text();
    let validationResult: UploadParseResult<SpecificationPackage>;
    if (file.name.toLowerCase().endsWith(".csv")) {
      validationResult = parseUploadedSpecificationCsv(rawText);
    } else {
      const parseResult = parseUploadedJson(rawText);
      if (!parseResult.success) {
        setRequirementsError(parseResult.error);
        return;
      }
      validationResult = validateUploadedSpecification(parseResult.data);
    }
    if (!validationResult.success) {
      setRequirementsError(validationResult.error);
      return;
    }

    setRequirementsData(validationResult.data.requirements);
    setRequirementsSource("uploaded");
    setRequirementsFilename(file.name);
    setSpecificationName(validationResult.data.name);
    setSpecificationRevision(validationResult.data.revision);
    setRequirementsError("");
  }, []);

  // Drag and drop zone configurations
  const modelDropzone = useDropzone({
    accept: {
      "application/json": [".json"],
      "application/octet-stream": [".ifc"],
      "text/plain": [".ifc"]
    },
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
    accept: {
      "application/json": [".json"],
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]
    },
    maxFiles: 1,
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file !== undefined) {
        void handleRequirementsFile(file);
      }
    }
  });

  async function confirmXlsxImport(
    specification: SpecificationPackage,
    meta: { fileName: string; includedRows: number; excludedRows: Array<{ sourceRow: number; reason: string }> }
  ) {
    if (projectTarget && !projectTarget.canEdit) throw new Error("Viewers cannot create specification revisions.");
    if (projectTarget) {
      await authenticatedBrowserApi(`/api/projects/${projectTarget.projectId}/specifications`, {
        method: "POST",
        body: JSON.stringify(specification)
      });
      setSpecificationRefreshKey((current) => current + 1);
    }
    setRequirementsData(specification.requirements);
    setRequirementsSource("uploaded");
    setRequirementsFilename(meta.fileName);
    setSpecificationName(specification.name);
    setSpecificationRevision(specification.revision);
    setRequirementsError("");
    setImportSummary({
      message: `${meta.includedRows} requirements confirmed; ${meta.excludedRows.length} rows excluded` +
        (projectTarget ? ` and revision saved to ${projectTarget.projectName}.` : ". Session-only draft: refresh will discard it."),
      excludedRows: meta.excludedRows
    });
    setShowXlsxImporter(false);
    setXlsxFile(null);
  }

  async function exportActiveSpecification() {
    const bytes = await exportSpecificationXlsx({
      name: specificationName,
      revision: specificationRevision,
      requirements
    });
    const blob = new Blob([Uint8Array.from(bytes).buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${specificationName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "specification"}-${specificationRevision}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  function resetToSampleData() {
    setModelData(sampleModelData);
    setRequirementsData(sampleRequirements);
    setModelSource("sample");
    setRequirementsSource("sample");
    setModelError("");
    setRequirementsError("");
    setModelFilename("");
    setRequirementsFilename("");
    setSpecificationName("Sample architectural requirements");
    setSpecificationRevision("Demo");
    setIfcDiagnostics(null);
    handleDeselect();
  }

  function openSavedValidation(snapshot: {
    model_name: string;
    normalized_model: NormalizedModel;
    requirements: Requirement[];
  }) {
    setModelData(snapshot.normalized_model);
    setRequirementsData(snapshot.requirements);
    setModelSource("uploaded");
    setRequirementsSource("uploaded");
    setModelFilename(snapshot.model_name);
    setRequirementsFilename("Saved requirement snapshot");
    setSpecificationName("Saved requirement snapshot");
    setSpecificationRevision("Stored with validation run");
    setIfcDiagnostics(null);
    setModelError("");
    setRequirementsError("");
    handleDeselect();
  }

  function openSavedSpecification(specification: SpecificationPackage) {
    setRequirementsData(specification.requirements);
    setRequirementsSource("uploaded");
    setRequirementsFilename("Project specification library");
    setSpecificationName(specification.name);
    setSpecificationRevision(specification.revision);
    setRequirementsError("");
  }

  // Export Compliance Report Downloader
  function exportComplianceReport() {
    const reportMd = `# AEC Spec Validator - Building Compliance Report
Generated at: ${new Date().toLocaleString()}
Requirement Pass Rate: ${passRateDisplay} (${metrics.compliantRequirements} Compliant / ${metrics.violatedRequirements} Violated among determined requirements)
Evaluation Coverage: ${coverageDisplay} (${metrics.determinedRequirements} Determined / ${metrics.applicableRequirements} Applicable)
Critical Failed Requirements: ${metrics.criticalFailures}
Not Applicable Requirements: ${metrics.notApplicableRequirements}

## Overview Metrics
- Total Rooms Inspected: ${model.rooms.length}
- Total Access Doors Inspected: ${model.doors.length}
- Spatial Storeys (Levels): ${model.levels.length}
- Total Evaluated Rule Specifications: ${requirements.length}
- Specification: ${specificationName}
- Specification Revision: ${specificationRevision}

## Spec Compliance Breakdown
${metrics.assessments
  .map((assessment, idx) => {
    const source = assessment.requirement.source;
    return `${idx + 1}. [${assessment.outcome.toUpperCase().replace("_", " ")}] **${assessment.requirement.title}** (Severity: ${assessment.requirement.severity})${source ? ` — Source: ${source.document}, ${source.section}${source.revision ? `, rev. ${source.revision}` : ""}` : ""}`;
  })
  .join("\n")}

## Detailed Evidence Records
${results
  .map(
    (res, idx) => `
### [${res.status.toUpperCase()}] ${res.requirementTitle}
- Requirement ID: \`${res.requirementId}\`
- Severity Level: **${res.severity}**
- Element Type: **${res.elementType}**
- Affected Elements: ${res.affectedElementIds.length > 0 ? res.affectedElementIds.join(", ") : "None"}
- Summary Record: ${res.summary}
- Structured Evidence Logs:
${res.evidence
  .map(
    (e) =>
      `  - *${e.message}* (Field: ${e.field || "N/A"} | Observed: ${
        e.observed ?? "null"
      } | Expected: ${e.expected ?? "n/a"})`
  )
  .join("\n")}
`
  )
  .join("\n")}

---
*Report exported from AEC Spec Validator - Developed under Evidence-Constrained Architecture Standards.*
`;

    const blob = new Blob([reportMd], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BIM-Compliance-Report-${Date.now().toString().slice(-5)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace-app min-h-screen text-[var(--aec-ink)] transition-colors duration-200">
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <Link href="/" className="workspace-brand" aria-label="AEC home">
            <span className="workspace-brand-mark"><Building2 className="h-4 w-4" /></span>
            <span><strong>AEC</strong><small>Spec Validator</small></span>
          </Link>
          <div className="workspace-project-switcher">
            <span className="tech-label">Active project</span>
            <strong>Riverside Office</strong>
            <small>Sample workspace</small>
          </div>
          <nav className="workspace-nav" aria-label="Workspace navigation">
            <a href="#overview" className="is-active"><LayoutDashboard />Overview</a>
            <a href="#project"><FolderKanban />Project</a>
            <a href="#requirements"><FileText />Requirements</a>
            <a href="#validation"><ListChecks />Validation</a>
            <a href="#traceability"><GitCompareArrows />Traceability</a>
            <a href="#team"><Users />Team review</a>
          </nav>
          <div className="workspace-sidebar-footer">
            <Link href="/"><ArrowLeft />Back to website</Link>
          </div>
        </aside>

        <div className="workspace-stage">
          <div className="workspace-topbar">
            <div>
              <span className="tech-label">Architecture & construction</span>
              <span className="workspace-crumb">Projects / Riverside Office / Overview</span>
            </div>
            <div className="workspace-topbar-actions">
              <a href="#requirements" className="workspace-search"><FileText />Open requirements</a>
              <ThemeToggle />
            </div>
          </div>

          <div className="workspace-content mx-auto max-w-[1700px] space-y-6">

        <div id="overview" className="workspace-hero relative overflow-hidden p-5 sm:p-7">

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5 text-left">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="workspace-eyebrow">
                  Project validation workspace
                </Badge>
                <Badge className="workspace-status-badge">
                  Live deterministic checks
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Riverside Office validation
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Review model facts against architectural requirements, evidence and revision history in one traceable workspace.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{dataSourceLabel}</p>
              <p className="text-[11px] text-slate-400">Specification: {specificationName} · revision {specificationRevision}</p>
            </div>

            <div className="flex items-center gap-2.5 self-start md:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportActiveSpecification()}
                className="gap-1.5 font-semibold shadow-sm h-9"
              >
                <FileDown className="h-4 w-4" /> Export XLSX
              </Button>
              <Button
                data-testid="export-report"
                variant="outline"
                size="sm"
                onClick={exportComplianceReport}
                className="gap-1.5 font-semibold shadow-sm h-9 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FileDown className="h-4 w-4" /> Export Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetToSampleData}
                className="gap-1.5 font-semibold text-slate-700 dark:text-slate-300 h-9 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reset Demo
              </Button>
            </div>
          </div>
        </div>

        {showXlsxImporter && <section id="xlsx-import"><XlsxImportWizard
          initialFile={xlsxFile}
          onConfirm={confirmXlsxImport}
          onClose={() => { setShowXlsxImporter(false); setXlsxFile(null); }}
        /></section>}

        {importSummary && <div className="rounded border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          <p>{importSummary.message}</p>
          {importSummary.excludedRows.length > 0 && <details className="mt-2"><summary>Excluded-row audit</summary><ul className="mt-1 list-disc pl-5">{importSummary.excludedRows.map((row) => <li key={row.sourceRow}>Row {row.sourceRow}: {row.reason}</li>)}</ul></details>}
        </div>}

        <section id="project"><ProjectWorkspace
          model={model}
          requirements={requirements}
          modelName={modelFilename || "workspace-model.json"}
          specificationName={specificationName}
          specificationRevision={specificationRevision}
          onOpenSpecification={openSavedSpecification}
          onOpen={openSavedValidation}
          onProjectTargetChange={setProjectTarget}
          specificationRefreshKey={specificationRefreshKey}
        /></section>

        <section id="requirements"><RequirementEditor requirements={requirementsData} onChange={handleRequirementsChange} /></section>

        {/* Global Stats Compliance Section */}
        <div id="traceability" className="grid gap-4 md:grid-cols-4">
          {/* Radial progress ring stats card */}
          <Card className="flex items-center justify-between p-4 overflow-hidden shadow-md">
            <div className="space-y-1 text-left">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Requirement Pass Rate</p>
              <p data-testid="pass-rate" className="text-2xl font-extrabold tracking-tight">{passRateDisplay}</p>
              <p className="text-[10px] text-slate-500">{metrics.compliantRequirements} of {metrics.determinedRequirements} determined requirements pass</p>
            </div>
            <div className="relative flex items-center justify-center">
              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="3" />
                <motion.circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke={(metrics.passRate ?? 0) >= 80 ? "#10b981" : (metrics.passRate ?? 0) >= 50 ? "#f59e0b" : "#f43f5e"}
                  strokeWidth="3"
                  strokeDasharray="100"
                  initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: 100 - (metrics.passRate ?? 0) }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
              </svg>
              <span className="absolute font-mono text-xs font-bold">{passRateDisplay}</span>
            </div>
          </Card>

          {/* Compliance counters */}
          {[
            { label: "Evaluation Coverage", value: coverageDisplay, detail: `${metrics.unknownRequirements} unknown`, color: "text-indigo-500 bg-indigo-500/10", border: "border-indigo-200/50 dark:border-indigo-950/50", criticalCount: undefined as number | undefined },
            { label: "Violated Requirements", value: metrics.violatedRequirements, detail: `${metrics.criticalFailures} critical`, color: "text-rose-500 bg-rose-500/10", border: "border-rose-200/50 dark:border-rose-950/50", criticalCount: metrics.criticalFailures },
            { label: "Not Applicable", value: metrics.notApplicableRequirements, detail: "Excluded from rates", color: "text-amber-500 bg-amber-500/10", border: "border-amber-200/50 dark:border-amber-950/50", criticalCount: undefined as number | undefined }
          ].map((stat, i) => (
            <Card key={i} data-testid={stat.label === "Evaluation Coverage" ? "evaluation-coverage" : undefined} className={`p-4 flex flex-col justify-between shadow-md border ${stat.border}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${stat.color}`}>OUTCOME</span>
              </div>
              <div className="mt-3 text-left">
                <p className="text-3xl font-extrabold tracking-tight">{stat.value}</p>
                <p className="mt-1 text-[10px] text-slate-500">{stat.detail}</p>
                {stat.criticalCount !== undefined && (
                  <Badge variant="destructive" className="mt-2 text-[10px] py-0 font-semibold">
                    {stat.criticalCount} critical
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Workspace Layout */}
        <div id="validation" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr_1fr] xl:grid-cols-[1.2fr_0.9fr_0.9fr]">

          {/* COLUMN 1: FLOOR PLAN VISUALIZER & IFC LOGGER */}
          <section className="space-y-6 flex flex-col">

            {/* Main Interactive Map Card */}
            <Card className="shadow-lg flex-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">CAD / BIM Spatial Map</CardTitle>
                    <CardDescription className="text-xs">Interactive visual rendering of model boundaries and corridors</CardDescription>
                  </div>
                  <div className="flex bg-slate-100 rounded-md p-0.5 dark:bg-slate-800 text-xs">
                    <button
                      onClick={() => setActiveWorkspaceTab("visualizer")}
                      className={`px-2.5 py-1 rounded-sm font-semibold transition ${
                        activeWorkspaceTab === "visualizer"
                          ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-slate-50"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      }`}
                    >
                      Floor Plan
                    </button>
                    <button
                      onClick={() => setActiveWorkspaceTab("json")}
                      className={`px-2.5 py-1 rounded-sm font-semibold transition ${
                        activeWorkspaceTab === "json"
                          ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-slate-50"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      }`}
                    >
                      JSON Facts
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col relative justify-center bg-slate-50/10 dark:bg-slate-950/10">

                {/* SVG/JSON Tab Panel */}
                <AnimatePresence mode="wait">
                  {activeWorkspaceTab === "visualizer" ? (
                    <motion.div
                      key="map-tab"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full"
                    >
                      <BimFloorPlan
                        model={model}
                        validationResults={results}
                        selectedElementId={selectedId}
                        hoveredElementId={hoveredId}
                        onSelectElement={handleSelectElement}
                        onHoverElement={handleHoverElement}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="json-tab"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full flex flex-col space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-500">Contract Payload Fact Explorer</span>
                        <Badge variant="outline" className="font-mono">normalized-bim.json</Badge>
                      </div>
                      <pre className="max-h-[380px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-[10px] leading-normal text-indigo-400 dark:border-slate-800 text-left">
                        {JSON.stringify(model, null, 2)}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* Custom Boundary Model File Ingestion Module */}
            <Card className="shadow-md">
              <CardHeader className="pb-2 text-left">
                <CardTitle className="text-sm">BIM / CAD Extract Connector</CardTitle>
                <CardDescription className="text-xs">Parse native IFC models server-side or upload the normalized BIM JSON contract.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 text-xs md:grid-cols-2">
                  <div
                    {...modelDropzone.getRootProps()}
                    className={`cursor-pointer rounded-xl border border-dashed p-4 transition text-left flex flex-col justify-between ${
                      modelDropzone.isDragActive
                        ? "border-indigo-400 bg-indigo-50/50 dark:border-indigo-500/20 dark:bg-indigo-950/20"
                        : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700"
                    }`}
                  >
                    <input {...modelDropzone.getInputProps({ "aria-label": "Upload BIM model" })} />
                    <div className="flex items-start gap-3">
                      <UploadCloud className="mt-0.5 h-4 w-4 text-slate-500 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Upload Model (IFC / JSON)</p>
                        <p className="text-[10px] text-slate-500">Extract real storeys, spaces, doors, quantities and boundaries from IFC.</p>
                      </div>
                    </div>
                    {isParsingIfc && (
                      <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-indigo-500">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Parsing IFC with web-ifc…
                      </p>
                    )}
                    {modelFilename && (
                      <p className="text-[10px] font-mono text-indigo-500 mt-3 truncate font-semibold">Active: {modelFilename}</p>
                    )}
                    {modelError && <p className="text-[10px] text-rose-500 mt-2 font-semibold">{modelError}</p>}
                  </div>

                  <div
                    {...requirementsDropzone.getRootProps()}
                    className={`cursor-pointer rounded-xl border border-dashed p-4 transition text-left flex flex-col justify-between ${
                      requirementsDropzone.isDragActive
                        ? "border-indigo-400 bg-indigo-50/50 dark:border-indigo-500/20 dark:bg-indigo-950/20"
                        : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700"
                    }`}
                  >
                    <input {...requirementsDropzone.getInputProps()} />
                    <div className="flex items-start gap-3">
                      <FileJson className="mt-0.5 h-4 w-4 text-slate-500 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Upload Specification</p>
                        <p className="text-[10px] text-slate-500">Import JSON/CSV directly or open the reviewed, atomic XLSX workflow.</p>
                      </div>
                    </div>
                    {requirementsFilename && (
                      <p className="text-[10px] font-mono text-indigo-500 mt-3 truncate font-semibold">Active: {requirementsFilename}</p>
                    )}
                    {requirementsError && <p className="text-[10px] text-rose-500 mt-2 font-semibold">{requirementsError}</p>}
                  </div>
                </div>
                {ifcDiagnostics && (
                  <div data-testid="ifc-diagnostics" className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-left text-[10px] dark:border-emerald-950/50 dark:bg-emerald-950/10">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {ifcDiagnostics.schema}: {ifcDiagnostics.storeysFound} storeys · {ifcDiagnostics.spacesFound} spaces · {ifcDiagnostics.doorsFound} doors · {ifcDiagnostics.boundariesFound} resolved boundaries
                    </p>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      Units: {ifcDiagnostics.lengthUnit} · Areas: {ifcDiagnostics.areaSources.quantities} quantities + {ifcDiagnostics.areaSources.properties} properties · Door widths: {ifcDiagnostics.doorWidthSources.instances} instances + {ifcDiagnostics.doorWidthSources.properties} properties + {ifcDiagnostics.doorWidthSources.types} types
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Door links: {ifcDiagnostics.boundarySources.direct} direct + {ifcDiagnostics.boundarySources.throughOpenings} through openings
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Storeys: {ifcDiagnostics.containment.inferredDoorStoreys} door assignments inferred · {ifcDiagnostics.containment.unassignedSpaces} spaces + {ifcDiagnostics.containment.unassignedDoors} doors unassigned
                    </p>
                    {ifcDiagnostics.warnings.map((warning) => (
                      <p key={warning} className="mt-1 text-amber-700 dark:text-amber-400">Warning: {warning}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* COLUMN 2: DETERMINISTIC VALIDATOR RESULTS & NO CODE BUILDER */}
          <section id="team" className="space-y-6">

            {/* Visual Rule Builder Block */}
            <RuleBuilder onAddRequirement={handleAddRequirement} />

            {/* Validation Detailed Results */}
            <Card className="shadow-lg border-slate-200 dark:border-slate-800/80">
              <CardHeader className="pb-2 text-left">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Engine Validation Log</span>
                  <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                    {results.length} specs checked
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">Deterministic rules evaluate parameters instantly with strict evidence outputs.</CardDescription>
              </CardHeader>
              <CardContent className="p-3">
                <div className="max-h-[500px] overflow-y-auto pr-1 space-y-3">
                  {results.map((result, resultIndex) => {
                    const isFailing = result.status === "fail";
                    const isUnknown = result.status === "unknown" || result.status === "not_applicable";

                    return (
                      <div
                        key={`${result.requirementId}-${resultIndex}`}
                        className={`rounded-xl border p-3.5 transition text-left relative ${
                          isFailing
                            ? "border-rose-100 bg-rose-50/20 dark:border-rose-950/20 dark:bg-rose-950/5"
                            : isUnknown
                              ? "border-amber-100 bg-amber-50/20 dark:border-amber-950/20 dark:bg-amber-950/5"
                              : "border-emerald-100 bg-emerald-50/20 dark:border-emerald-950/20 dark:bg-emerald-950/5"
                        }`}
                      >
                        {/* Status bar indicators */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={
                                result.status === "pass"
                                  ? "success"
                                  : result.status === "fail"
                                    ? "destructive"
                                    : "warning"
                              }
                              className="uppercase text-[10px] font-bold py-0"
                            >
                              {result.status}
                            </Badge>
                            <Badge
                              variant={result.severity === "critical" ? "destructive" : "default"}
                              className="text-[10px] py-0 font-medium opacity-80"
                            >
                              {result.severity}
                            </Badge>
                          </div>
                          {isFailing ? (
                            <AlertTriangle className="h-4 w-4 text-rose-500" />
                          ) : isUnknown ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          )}
                        </div>

                        {/* Summary Description */}
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                          {result.summary}
                        </p>

                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          Rule: <span className="font-semibold">{result.requirementTitle}</span>
                        </p>

                        {/* Expandable Evidence items */}
                        <div className="mt-3 bg-white/70 rounded-lg p-2.5 border border-slate-100 dark:bg-slate-900/60 dark:border-slate-800">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <ChevronRight className="h-3 w-3" /> Technical Evidence Fact
                          </p>
                          {result.evidence.map((item, evidenceIndex) => (
                            <div key={evidenceIndex} className="space-y-1 font-mono text-[10px] text-slate-600 dark:text-slate-400">
                              <p className="leading-tight">{item.message}</p>
                              <div className="grid grid-cols-2 gap-1 bg-slate-50/50 p-1.5 rounded dark:bg-slate-950/40 mt-1">
                                <div>
                                  <span className="text-slate-400">Observed:</span>{" "}
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{String(item.observed ?? "null")}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Expected:</span>{" "}
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{String(item.expected ?? "n/a")}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Interactive Click to Highlight button */}
                        {result.affectedElementIds.length > 0 && (
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
                              Refs: {result.affectedElementIds.join(", ")}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectElement(result.affectedElementIds[0], result.elementType === "room" ? "room" : "door")}
                              className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              Show on floor plan &gt;
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* COLUMN 3: LIVE EDITOR DETAILS & AEC AI CORE */}
          <section className="space-y-6">

            {/* Sidebar Inspector Editor */}
            <Card className="shadow-lg">
              <CardContent className="p-4">
                <BimInspector
                  model={model}
                  validationResults={results}
                  requirements={requirements}
                  selectedId={selectedId}
                  selectedType={selectedType}
                  onUpdateModel={handleUpdateModel}
                  onDeselect={handleDeselect}
                />
              </CardContent>
            </Card>

            {/* AEC Chat Panel AI Console */}
            <AecChatPanel
              normalizedModel={model}
              requirements={requirements}
              onSelectElement={handleSelectElement}
            />

            {/* Evidence Note card */}
            <Card className="border border-indigo-950/20 bg-indigo-50/10 p-4 shadow-sm dark:bg-indigo-950/5">
              <h5 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <Brain className="h-3.5 w-3.5" /> Deterministic Compliance Policy
              </h5>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-normal text-left">
                The chatbot answers are strictly grounded in active spatial facts. Missing properties default to `unknown`, eliminating any AI-hallucinated certification passes.
              </p>
            </Card>
          </section>

        </div>

          </div>
        </div>
      </div>
    </main>
  );
}
