"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { NormalizedModel, ValidationResult } from "@/domain/types";

interface BimFloorPlanProps {
  model: NormalizedModel;
  validationResults: ValidationResult[];
  selectedElementId: string | null;
  hoveredElementId: string | null;
  onSelectElement: (id: string | null, type: "room" | "door" | null) => void;
  onHoverElement: (id: string | null) => void;
}

interface LayoutCoords {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DoorCoords {
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: boolean;
  angle?: number;
}

export function BimFloorPlan({
  model,
  validationResults,
  selectedElementId,
  hoveredElementId,
  onSelectElement,
  onHoverElement
}: BimFloorPlanProps) {
  
  // High-performance maps to get validation status of rooms and doors
  const validationMap = useMemo(() => {
    const map = new Map<string, { status: "pass" | "fail" | "unknown"; severity?: string }>();
    
    validationResults.forEach((result) => {
      result.affectedElementIds.forEach((id) => {
        const existing = map.get(id);
        if (!existing || existing.status === "pass" || (existing.status === "unknown" && result.status === "fail")) {
          map.set(id, { status: result.status, severity: result.severity });
        }
      });
    });
    
    return map;
  }, [validationResults]);

  // Static layout specifications for known models to make them look hand-drawn and beautiful
  const layoutData = useMemo(() => {
    const rooms: Record<string, LayoutCoords> = {
      // Original Sample Data
      "rm-stock-01": { x: 30, y: 30, w: 180, h: 130 },
      "rm-office-01": { x: 230, y: 30, w: 110, h: 130 },
      "rm-office-02": { x: 360, y: 30, w: 110, h: 130 },
      "rm-meet-01": { x: 30, y: 190, w: 220, h: 130 },
      "rm-stock-02": { x: 270, y: 190, w: 200, h: 130 },
      
      // IFC Mock Parser Data
      "rm-ifc-stock-01": { x: 30, y: 30, w: 180, h: 110 },
      "rm-ifc-office-01": { x: 230, y: 30, w: 110, h: 110 },
      "rm-ifc-meet-01": { x: 360, y: 30, w: 160, h: 110 },
      "rm-ifc-corr-01": { x: 30, y: 160, w: 490, h: 70 },
      "rm-ifc-stock-02": { x: 30, y: 250, w: 210, h: 100 }
    };

    const doors: Record<string, DoorCoords> = {
      // Original Sample Data
      "dr-01": { x: 210, y: 70, w: 6, h: 30, horizontal: false, angle: 45 },
      "dr-02": { x: 275, y: 160, w: 30, h: 6, horizontal: true, angle: -45 },
      "dr-03": { x: 400, y: 160, w: 30, h: 6, horizontal: true, angle: -45 },
      "dr-04": { x: 250, y: 230, w: 6, h: 30, horizontal: false, angle: 45 },
      "dr-05": { x: 100, y: 160, w: 30, h: 6, horizontal: true, angle: 45 },

      // IFC Mock Parser Data
      "dr-ifc-01": { x: 100, y: 140, w: 30, h: 6, horizontal: true, angle: 45 },
      "dr-ifc-02": { x: 210, y: 60, w: 6, h: 30, horizontal: false, angle: 45 },
      "dr-ifc-03": { x: 275, y: 140, w: 30, h: 6, horizontal: true, angle: -45 },
      "dr-ifc-04": { x: 420, y: 140, w: 30, h: 6, horizontal: true, angle: -45 },
      "dr-ifc-05": { x: 520, y: 180, w: 6, h: 30, horizontal: false, angle: 45 }
    };

    return { rooms, doors };
  }, []);

  // Compute final layouts for rooms, supporting dynamic layouts if the user uploads an unknown schema
  const roomsLayout = useMemo(() => {
    return model.rooms.map((room, idx) => {
      const staticCoord = layoutData.rooms[room.id];
      if (staticCoord) return { ...room, ...staticCoord };
      
      // Dynamic grid layout for random uploads
      const cols = 3;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        ...room,
        x: 30 + col * 170,
        y: 30 + row * 160,
        w: 140,
        h: 120
      };
    });
  }, [model.rooms, layoutData.rooms]);

  // Compute door layouts, matching them dynamically to their connected rooms if unknown
  const doorsLayout = useMemo(() => {
    return model.doors.map((door, idx) => {
      const staticCoord = layoutData.doors[door.id];
      if (staticCoord) return { ...door, ...staticCoord };

      // Try to place the door dynamically near its first room
      if (door.connectedRoomIds && door.connectedRoomIds.length > 0) {
        const primaryRoomId = door.connectedRoomIds[0];
        const roomLayout = roomsLayout.find(r => r.id === primaryRoomId);
        if (roomLayout) {
          return {
            ...door,
            x: roomLayout.x + roomLayout.w - 3,
            y: roomLayout.y + 30 + (idx * 20) % (roomLayout.h - 40),
            w: 6,
            h: 24,
            horizontal: false,
            angle: 45
          };
        }
      }

      // Absolute safety fallback
      return {
        ...door,
        x: 30 + idx * 40,
        y: 380,
        w: 24,
        h: 6,
        horizontal: true,
        angle: 45
      };
    });
  }, [model.doors, roomsLayout, layoutData.doors]);

  // Determine bounds of our SVG to keep it perfectly responsive
  const svgBounds = useMemo(() => {
    let maxX = 560;
    let maxY = 370;

    roomsLayout.forEach(r => {
      if (r.x + r.w + 40 > maxX) maxX = r.x + r.w + 40;
      if (r.y + r.h + 40 > maxY) maxY = r.y + r.h + 40;
    });

    return { w: maxX, h: maxY };
  }, [roomsLayout]);

  function getStatusColor(id: string, opacity: number = 1, isBorder: boolean = false) {
    const val = validationMap.get(id);
    if (!val) {
      // Default slate colors
      return isBorder 
        ? `rgba(148, 163, 184, ${opacity})` 
        : `rgba(241, 245, 249, ${opacity})`;
    }

    if (val.status === "pass") {
      return isBorder 
        ? `rgba(16, 185, 129, ${opacity})` // Emerald-500
        : `rgba(16, 185, 129, ${opacity * 0.12})`;
    }
    if (val.status === "fail") {
      return isBorder 
        ? `rgba(244, 63, 94, ${opacity})` // Rose-500
        : `rgba(244, 63, 94, ${opacity * 0.12})`;
    }
    // Unknown status
    return isBorder 
      ? `rgba(245, 158, 11, ${opacity})` // Amber-500
      : `rgba(245, 158, 11, ${opacity * 0.12})`;
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-200">
            Interactive Model Floor Plan
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Click elements to inspect; validation errors glow dynamically.
          </p>
        </div>
        <div className="flex gap-2 text-[10px] font-medium">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pass
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Fail
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Unknown
          </span>
        </div>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-slate-950">
        <svg
          viewBox={`0 0 ${svgBounds.w} ${svgBounds.h}`}
          className="h-full w-full min-w-[500px] select-none"
        >
          {/* Grid Background */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-100 dark:text-slate-900/60" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Rooms */}
          {roomsLayout.map((room) => {
            const isSelected = selectedElementId === room.id;
            const isHovered = hoveredElementId === room.id;
            const status = validationMap.get(room.id)?.status;
            
            return (
              <g
                key={room.id}
                className="cursor-pointer"
                onClick={() => onSelectElement(room.id, "room")}
                onMouseEnter={() => onHoverElement(room.id)}
                onMouseLeave={() => onHoverElement(null)}
              >
                {/* Room space boundary box */}
                <motion.rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  rx={8}
                  fill={getStatusColor(room.id, isSelected || isHovered ? 1.4 : 1)}
                  stroke={getStatusColor(room.id, 1, true)}
                  strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
                  animate={{
                    scale: isSelected ? 1.01 : 1,
                    strokeWidth: isSelected ? 2.5 : isHovered ? 2 : 1.5
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="transition-colors duration-250"
                  style={{
                    filter: isSelected 
                      ? `drop-shadow(0 0 8px ${getStatusColor(room.id, 0.4, true)})`
                      : isHovered
                        ? `drop-shadow(0 0 4px ${getStatusColor(room.id, 0.35, true)})`
                        : "none"
                  }}
                />

                {/* Room label text */}
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 - 8}
                  textAnchor="middle"
                  className="fill-slate-800 text-xs font-bold dark:fill-slate-100"
                >
                  {room.name}
                </text>

                {/* Subtext with area size */}
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 + 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-mono dark:fill-slate-400"
                >
                  {room.areaSqm !== undefined ? `${room.areaSqm} sqm` : "Area: ?"}
                </text>

                {/* Tiny Badge Indicator inside room */}
                {status && (
                  <circle
                    cx={room.x + room.w - 15}
                    cy={room.y + 15}
                    r={5}
                    fill={
                      status === "pass"
                        ? "#10b981"
                        : status === "fail"
                          ? "#f43f5e"
                          : "#f59e0b"
                    }
                    className="animate-pulse"
                  />
                )}
              </g>
            );
          })}

          {/* Doors */}
          {doorsLayout.map((door) => {
            const isSelected = selectedElementId === door.id;
            const isHovered = hoveredElementId === door.id;
            const isHorizontal = door.horizontal;
            
            // Generate visual path for swinging door arc
            const swingRadius = Math.max(door.w, door.h) - 4;
            const arcPath = isHorizontal
              ? `M ${door.x} ${door.y} A ${swingRadius} ${swingRadius} 0 0 1 ${door.x + swingRadius} ${door.y - swingRadius}`
              : `M ${door.x} ${door.y} A ${swingRadius} ${swingRadius} 0 0 1 ${door.x + swingRadius} ${door.y + swingRadius}`;

            return (
              <g
                key={door.id}
                className="cursor-pointer"
                onClick={() => onSelectElement(door.id, "door")}
                onMouseEnter={() => onHoverElement(door.id)}
                onMouseLeave={() => onHoverElement(null)}
              >
                {/* Swinging Door Arc (Architectural notation) */}
                <path
                  d={arcPath}
                  fill="none"
                  stroke={getStatusColor(door.id, 0.4, true)}
                  strokeWidth={1}
                  strokeDasharray="2,2"
                  className="opacity-70"
                />

                {/* Swinging Leaf */}
                <line
                  x1={door.x}
                  y1={door.y}
                  x2={isHorizontal ? door.x + swingRadius : door.x + swingRadius}
                  y2={isHorizontal ? door.y - swingRadius : door.y + swingRadius}
                  stroke={getStatusColor(door.id, 1, true)}
                  strokeWidth={1.5}
                />

                {/* Door Frame/Threshold click area (invisible helper block for easier clicking) */}
                <rect
                  x={door.x - 5}
                  y={door.y - 5}
                  width={isHorizontal ? door.w + 10 : 16}
                  height={isHorizontal ? 16 : door.h + 10}
                  fill="transparent"
                />

                {/* Door Solid Rectangle Representation */}
                <motion.rect
                  x={door.x}
                  y={door.y}
                  width={door.w}
                  height={door.h}
                  rx={1}
                  fill={getStatusColor(door.id, isSelected || isHovered ? 1.4 : 1)}
                  stroke={getStatusColor(door.id, 1, true)}
                  strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 1}
                  animate={{
                    scale: isSelected ? 1.1 : 1
                  }}
                  style={{
                    filter: isSelected
                      ? `drop-shadow(0 0 6px ${getStatusColor(door.id, 0.6, true)})`
                      : "none"
                  }}
                />

                {/* Door tag name label */}
                <text
                  x={door.x + (isHorizontal ? door.w / 2 : 12)}
                  y={door.y + (isHorizontal ? -10 : door.h / 2 + 4)}
                  textAnchor="middle"
                  className="fill-slate-600 text-[8px] font-bold dark:fill-slate-400"
                >
                  {door.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
