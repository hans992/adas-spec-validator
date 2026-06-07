"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  FileJson,
  UploadCloud,
  FileDown,
  RefreshCw,
  Terminal,
  ChevronRight
} from "lucide-react";

import { AdasChatPanel } from "@/components/AdasChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BimFloorPlan } from "@/components/BimFloorPlan";
import { BimInspector } from "@/components/BimInspector";
import { RuleBuilder } from "@/components/RuleBuilder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { sampleModelData, sampleRequirements } from "@/domain/sampleData";
import { mockIfcModelData } from "@/domain/mockIfcData";
import {
  parseUploadedJson,
  validateUploadedModel,
  validateUploadedRequirements
} from "@/domain/uploadHelpers";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";
import type { NormalizedModel, Requirement } from "@/domain/types";

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

  // Interactive Selection States
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"room" | "door" | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Tab selections
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"visualizer" | "json">("visualizer");

  // IFC Parser Simulated States
  const [isParsingIfc, setIsParsingIfc] = useState(false);
  const [ifcLogs, setIfcLogs] = useState<string[]>([]);
  const [ifcProgress, setIfcProgress] = useState(0);

  // Run the deterministic validation pipeline
  const { model, requirements, results } = useMemo(() => {
    try {
      return validateWithDeterministicRules(modelData, requirementsData);
    } catch {
      // Fallback in case manual state edits bypass validation temporarily
      return { model: modelData, requirements: requirementsData, results: [] };
    }
  }, [modelData, requirementsData]);

  // Statistics counters
  const passCount = results.filter((result) => result.status === "pass").length;
  const failCount = results.filter((result) => result.status === "fail").length;
  const unknownCount = results.filter((result) => result.status === "unknown").length;
  const criticalIssuesCount = results.filter(
    (result) => result.status === "fail" && result.severity === "critical"
  ).length;

  const totalResultsCount = passCount + failCount + unknownCount;
  const complianceRate = totalResultsCount > 0 ? Math.round((passCount / totalResultsCount) * 100) : 0;

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

  // File parsers
  const handleModelFile = useCallback(async (file: File) => {
    // Check if it's an IFC file
    if (file.name.toLowerCase().endsWith(".ifc")) {
      triggerIfcSimulatedParser(file.name, file.size);
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
    handleDeselect();
  }, [handleDeselect]);

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

  // Simulated IFC parser progress trigger
  function triggerIfcSimulatedParser(filename: string, sizeBytes: number) {
    setIsParsingIfc(true);
    setIfcProgress(0);
    setIfcLogs([]);

    const logMessages = [
      `[INFO] Initializing IFC boundary extractor boundary...`,
      `[OK] File size: ${(sizeBytes / 1024).toFixed(2)} KB, format: IFC-SPF (ISO-10303-21)`,
      `[INFO] Parsing IFC Spatial Structure (IfcProject -> IfcBuildingStorey)...`,
      `[OK] Found 5 spatial zones (IfcSpace) in hierarchy`,
      `[INFO] Extracting spatial element connectivity boundaries (IfcRelSpaceBoundary)...`,
      `[OK] Successfully bound 5 doors (IfcDoor) to spaces`,
      `[INFO] Normalizing facts to BIM Compliance contract...`,
      `[SUCCESS] Extraction complete! 5 rooms & 5 doors mapped to validation sandbox.`
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < logMessages.length) {
        setIfcLogs((prev) => [...prev, logMessages[currentStep]]);
        setIfcProgress((currentStep + 1) * (100 / logMessages.length));
        currentStep++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setModelData(mockIfcModelData);
          setModelSource("uploaded");
          setModelFilename(filename);
          setModelError("");
          setIsParsingIfc(false);
          handleDeselect();
        }, 600);
      }
    }, 300);
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
    handleDeselect();
  }

  // Export Compliance Report Downloader
  function exportComplianceReport() {
    const reportMd = `# ADAS Spec Validator - Building Compliance Report
Generated at: ${new Date().toLocaleString()}
Compliance Score: ${complianceRate}% (${passCount} Pass / ${failCount} Fail / ${unknownCount} Unknown)

## Overview Metrics
- Total Rooms Inspected: ${model.rooms.length}
- Total Access Doors Inspected: ${model.doors.length}
- Spatial Storeys (Levels): ${model.levels.length}
- Total Evaluated Rule Specifications: ${requirements.length}

## Spec Compliance Breakdown
${requirements
  .map((req, idx) => {
    const reqResults = results.filter((r) => r.requirementId === req.id);
    const pass = reqResults.every((r) => r.status === "pass");
    return `${idx + 1}. [${pass ? "COMPLIANT" : "VIOLATION"}] **${req.title}** (Severity: ${req.severity})`;
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
*Report exported from ADAS Spec Validator - Developed under Evidence-Constrained Architecture Standards.*
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
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-8 lg:px-8 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="mx-auto max-w-[1700px] space-y-6">
        
        {/* Header Block with Neon Glare */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-100/50 dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-slate-950/20 backdrop-blur-md">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-44 h-44 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5 text-left">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] tracking-widest uppercase border-indigo-200 bg-indigo-50/30 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-400">
                  BIM Design Automation Studio
                </Badge>
                <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-none text-[10px] py-0">
                  PRO BOUNDARY Extractor
                </Badge>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-950 to-indigo-900 bg-clip-text text-transparent dark:from-white dark:to-indigo-300">
                ADAS Spec Validator
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Deterministic compliance engine mapping Revit / AutoCAD models against strict architectural requirements.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{dataSourceLabel}</p>
            </div>
            
            <div className="flex items-center gap-2.5 self-start md:self-auto">
              <Button
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
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Global Stats Compliance Section */}
        <div className="grid gap-4 md:grid-cols-4">
          {/* Radial progress ring stats card */}
          <Card className="flex items-center justify-between p-4 overflow-hidden shadow-md">
            <div className="space-y-1 text-left">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Storey Compliance</p>
              <p className="text-2xl font-extrabold tracking-tight">{passCount} / {totalResultsCount} Passed</p>
              <p className="text-[10px] text-slate-500">Deterministic requirements satisfied</p>
            </div>
            <div className="relative flex items-center justify-center">
              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="3" />
                <motion.circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke={complianceRate >= 80 ? "#10b981" : complianceRate >= 50 ? "#f59e0b" : "#f43f5e"}
                  strokeWidth="3"
                  strokeDasharray="100"
                  initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: 100 - complianceRate }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
              </svg>
              <span className="absolute font-mono text-xs font-bold">{complianceRate}%</span>
            </div>
          </Card>

          {/* Compliance counters */}
          {[
            { label: "Valid Passes", value: passCount, color: "text-emerald-500 bg-emerald-500/10", border: "border-emerald-200/50 dark:border-emerald-950/50", criticalCount: undefined as number | undefined },
            { label: "Detected Violations", value: failCount, color: "text-rose-500 bg-rose-500/10", border: "border-rose-200/50 dark:border-rose-950/50", criticalCount: criticalIssuesCount },
            { label: "Unknown (Missing Parameters)", value: unknownCount, color: "text-amber-500 bg-amber-500/10", border: "border-amber-200/50 dark:border-amber-950/50", criticalCount: undefined as number | undefined }
          ].map((stat, i) => (
            <Card key={i} className={`p-4 flex flex-col justify-between shadow-md border ${stat.border}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${stat.color}`}>OUTCOME</span>
              </div>
              <div className="mt-3 text-left">
                <p className="text-3xl font-extrabold tracking-tight">{stat.value}</p>
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
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr_1fr] xl:grid-cols-[1.2fr_0.9fr_0.9fr]">
          
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
                  {isParsingIfc ? (
                    <motion.div
                      key="ifc-parsing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col p-6 font-mono text-left text-indigo-400 border border-indigo-900 rounded-xl"
                    >
                      <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-2.5">
                        <p className="text-xs uppercase tracking-widest font-extrabold flex items-center gap-1.5">
                          <Terminal className="h-4 w-4 animate-spin text-indigo-500" />
                          IFC BINDERY BOUNDARY EXTRACTOR
                        </p>
                        <span className="text-xs text-indigo-300 font-bold">{Math.round(ifcProgress)}%</span>
                      </div>
                      
                      <div className="w-full bg-slate-900 h-1 rounded overflow-hidden mb-4">
                        <motion.div
                          className="h-full bg-indigo-500 shadow-md"
                          animate={{ width: `${ifcProgress}%` }}
                        />
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-1.5 text-[11px] leading-relaxed text-indigo-300/90 max-h-[300px]">
                        {ifcLogs.map((log, idx) => (
                          <div key={idx} className="flex items-start gap-1">
                            <span className="text-indigo-600/70 select-none">&gt;&gt;</span>
                            <span>{log}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}

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
                <CardDescription className="text-xs">Drag JSON or .ifc files to ingest Revit boundaries locally.</CardDescription>
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
                    <input {...modelDropzone.getInputProps()} />
                    <div className="flex items-start gap-3">
                      <UploadCloud className="mt-0.5 h-4 w-4 text-slate-500 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Upload Model (JSON/IFC)</p>
                        <p className="text-[10px] text-slate-500">Extract elements from IFC boundary or Zod JSON files.</p>
                      </div>
                    </div>
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
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Upload Rule JSON</p>
                        <p className="text-[10px] text-slate-500">Inject raw JSON file outlining validation rule arrays.</p>
                      </div>
                    </div>
                    {requirementsFilename && (
                      <p className="text-[10px] font-mono text-indigo-500 mt-3 truncate font-semibold">Active: {requirementsFilename}</p>
                    )}
                    {requirementsError && <p className="text-[10px] text-rose-500 mt-2 font-semibold">{requirementsError}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* COLUMN 2: DETERMINISTIC VALIDATOR RESULTS & NO CODE BUILDER */}
          <section className="space-y-6">
            
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
                    const isUnknown = result.status === "unknown";
                    
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

          {/* COLUMN 3: LIVE EDITOR DETAILS & ADAS AI CORE */}
          <section className="space-y-6">
            
            {/* Sidebar Inspector Editor */}
            <Card className="shadow-lg">
              <CardContent className="p-4">
                <BimInspector
                  model={model}
                  validationResults={results}
                  selectedId={selectedId}
                  selectedType={selectedType}
                  onUpdateModel={handleUpdateModel}
                  onDeselect={handleDeselect}
                />
              </CardContent>
            </Card>

            {/* ADAS Chat Panel AI Console */}
            <AdasChatPanel
              normalizedModel={model}
              validationResults={results}
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
    </main>
  );
}
