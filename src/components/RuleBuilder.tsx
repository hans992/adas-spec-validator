"use client";

import { useState } from "react";
import { PlusCircle, Shield, AlertCircle } from "lucide-react";
import type { Requirement, RoomType, ValidationSeverity } from "@/domain/types";
import { Button } from "@/components/ui/button";

interface RuleBuilderProps {
  onAddRequirement: (newReq: Requirement) => void;
}

export function RuleBuilder({ onAddRequirement }: RuleBuilderProps) {
  const [ruleType, setRuleType] = useState<"minimum_room_area" | "minimum_door_width_for_room_type" | "room_has_connected_door">("minimum_room_area");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<ValidationSeverity>("warning");
  const [roomType, setRoomType] = useState<RoomType>("stockroom");
  const [minArea, setMinArea] = useState(15);
  const [minDoorWidth, setMinDoorWidth] = useState(0.85);

  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (title.trim().length === 0) {
      setError("Please provide a descriptive rule name.");
      return;
    }

    const uniqueId = `req-custom-${Date.now().toString().slice(-6)}`;
    let newReq: Requirement;

    if (ruleType === "minimum_room_area") {
      newReq = {
        id: uniqueId,
        title,
        type: "minimum_room_area",
        severity,
        roomType,
        minAreaSqm: Number(minArea)
      };
    } else if (ruleType === "minimum_door_width_for_room_type") {
      newReq = {
        id: uniqueId,
        title,
        type: "minimum_door_width_for_room_type",
        severity,
        roomType,
        minDoorWidthM: Number(minDoorWidth)
      };
    } else {
      newReq = {
        id: uniqueId,
        title,
        type: "room_has_connected_door",
        severity
      };
    }

    onAddRequirement(newReq);

    // Reset Form
    setTitle("");
    setError("");
  }

  // Pre-fill fields when selecting preset types
  function handlePresetSelect(presetType: typeof ruleType) {
    setRuleType(presetType);
    if (presetType === "minimum_room_area") {
      setTitle(`Offices must be at least 10 sqm`);
      setSeverity("critical");
      setRoomType("office");
      setMinArea(10);
    } else if (presetType === "minimum_door_width_for_room_type") {
      setTitle(`Office doors must be at least 0.80m wide`);
      setSeverity("warning");
      setRoomType("office");
      setMinDoorWidth(0.8);
    } else {
      setTitle(`All corridors must be connected to doors`);
      setSeverity("warning");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mb-3">
        <h4 className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-indigo-500" />
          No-Code Spec Builder
        </h4>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Visually build and inject compliance rules directly into the deterministic validator.
        </p>
      </div>

      {/* Preset Rules */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Preset templates</p>
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => handlePresetSelect("minimum_room_area")}
            className={`rounded border p-1 text-center transition ${
              ruleType === "minimum_room_area"
                ? "border-indigo-400 bg-indigo-50/50 text-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/20 dark:text-indigo-400"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-850"
            }`}
          >
            Room Area
          </button>
          <button
            type="button"
            onClick={() => handlePresetSelect("minimum_door_width_for_room_type")}
            className={`rounded border p-1 text-center transition ${
              ruleType === "minimum_door_width_for_room_type"
                ? "border-indigo-400 bg-indigo-50/50 text-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/20 dark:text-indigo-400"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-850"
            }`}
          >
            Door Width
          </button>
          <button
            type="button"
            onClick={() => handlePresetSelect("room_has_connected_door")}
            className={`rounded border p-1 text-center transition ${
              ruleType === "room_has_connected_door"
                ? "border-indigo-400 bg-indigo-50/50 text-indigo-600 dark:border-indigo-500 dark:bg-indigo-950/20 dark:text-indigo-400"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-850"
            }`}
          >
            Door Connect
          </button>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
        {/* Title */}
        <div>
          <label htmlFor="rule-title" className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-0.5">
            Rule Description
          </label>
          <input
            id="rule-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Offices must be at least 10 sqm"
            className="w-full text-xs rounded border border-slate-350 bg-white/70 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Severity */}
          <div>
            <label htmlFor="rule-severity" className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-0.5">
              Severity
            </label>
            <select
              id="rule-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as ValidationSeverity)}
              className="w-full text-xs rounded border border-slate-350 bg-white/70 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>

          {/* Rule type parameters */}
          {ruleType !== "room_has_connected_door" && (
            <div>
              <label htmlFor="rule-room-type" className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-0.5">
                Target Room Type
              </label>
              <select
                id="rule-room-type"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as RoomType)}
                className="w-full text-xs rounded border border-slate-350 bg-white/70 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="office">Office</option>
                <option value="stockroom">Stockroom</option>
                <option value="meeting_room">Meeting Room</option>
                <option value="corridor">Corridor</option>
              </select>
            </div>
          )}
        </div>

        {/* Dynamic Inputs */}
        {ruleType === "minimum_room_area" && (
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
              <label htmlFor="rule-min-area">Minimum Area</label>
              <span className="text-indigo-500 dark:text-indigo-400 font-mono font-bold">{minArea} sqm</span>
            </div>
            <input
              id="rule-min-area"
              type="range"
              min={5}
              max={30}
              step={1}
              value={minArea}
              onChange={(e) => setMinArea(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        {ruleType === "minimum_door_width_for_room_type" && (
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
              <label htmlFor="rule-min-door-width">Minimum Door Width</label>
              <span className="text-indigo-500 dark:text-indigo-400 font-mono font-bold">{minDoorWidth}m</span>
            </div>
            <input
              id="rule-min-door-width"
              type="range"
              min={0.7}
              max={1.4}
              step={0.05}
              value={minDoorWidth}
              onChange={(e) => setMinDoorWidth(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        {error && (
          <p className="text-[10px] text-rose-500 flex items-center gap-1 font-semibold">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}

        <Button type="submit" size="sm" className="w-full h-8 gap-1.5">
          <PlusCircle className="h-3.5 w-3.5" /> Inject Rule
        </Button>
      </form>
    </div>
  );
}
