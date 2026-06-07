"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit2, Layout, Sliders, Trash2, Plus, DoorOpen } from "lucide-react";
import type { NormalizedModel, ValidationResult, RoomType, Room, Door } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-400";

interface BimInspectorProps {
  model: NormalizedModel;
  validationResults: ValidationResult[];
  selectedId: string | null;
  selectedType: "room" | "door" | null;
  onUpdateModel: (newModel: NormalizedModel) => void;
  onDeselect: () => void;
}

export function BimInspector({
  model,
  validationResults,
  selectedId,
  selectedType,
  onUpdateModel,
  onDeselect
}: BimInspectorProps) {
  
  // Creation States
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [isAddingDoor, setIsAddingDoor] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomType, setNewRoomType] = useState<RoomType>("office");
  const [newRoomArea, setNewRoomArea] = useState(10);
  const [newDoorName, setNewDoorName] = useState("");
  const [newDoorWidth, setNewDoorWidth] = useState(0.8);

  // Retrieve current entity details
  const activeRoom = useMemo(() => {
    if (selectedType !== "room") return null;
    return model.rooms.find((r) => r.id === selectedId) || null;
  }, [model.rooms, selectedId, selectedType]);

  const activeDoor = useMemo(() => {
    if (selectedType !== "door") return null;
    return model.doors.find((d) => d.id === selectedId) || null;
  }, [model.doors, selectedId, selectedType]);

  // Find validation issues associated with this specific element
  const entityIssues = useMemo(() => {
    if (!selectedId) return [];
    return validationResults.filter(
      (r) => r.affectedElementIds.includes(selectedId) && r.status !== "pass"
    );
  }, [validationResults, selectedId]);

  const isEntityCompliant = useMemo(() => {
    if (!selectedId) return true;
    const failingIssues = validationResults.filter(
      (r) => r.affectedElementIds.includes(selectedId) && r.status === "fail"
    );
    return failingIssues.length === 0;
  }, [validationResults, selectedId]);

  // Update room facts
  function handleRoomAreaChange(newArea: number) {
    if (!activeRoom) return;
    const updatedRooms = model.rooms.map((r) =>
      r.id === activeRoom.id ? { ...r, areaSqm: Number(newArea.toFixed(1)) } : r
    );
    onUpdateModel({ ...model, rooms: updatedRooms });
  }

  function handleRoomNameChange(newName: string) {
    if (!activeRoom) return;
    const updatedRooms = model.rooms.map((r) =>
      r.id === activeRoom.id ? { ...r, name: newName } : r
    );
    onUpdateModel({ ...model, rooms: updatedRooms });
  }

  function handleRoomTypeChange(type: RoomType) {
    if (!activeRoom) return;
    const updatedRooms = model.rooms.map((r) =>
      r.id === activeRoom.id ? { ...r, roomType: type } : r
    );
    onUpdateModel({ ...model, rooms: updatedRooms });
  }

  // Update door facts
  function handleDoorWidthChange(newWidth: number) {
    if (!activeDoor) return;
    const updatedDoors = model.doors.map((d) =>
      d.id === activeDoor.id ? { ...d, widthM: Number(newWidth.toFixed(2)) } : d
    );
    onUpdateModel({ ...model, doors: updatedDoors });
  }

  function handleDoorNameChange(newName: string) {
    if (!activeDoor) return;
    const updatedDoors = model.doors.map((d) =>
      d.id === activeDoor.id ? { ...d, name: newName } : d
    );
    onUpdateModel({ ...model, doors: updatedDoors });
  }

  // Add Room or Door
  function createRoom() {
    if (newRoomName.trim() === "") return;
    const newId = `rm-${newRoomType}-${Date.now().toString().slice(-4)}`;
    const newRoom: Room = {
      id: newId,
      name: newRoomName,
      levelId: model.levels[0]?.id || "lvl-01",
      roomType: newRoomType,
      areaSqm: newRoomArea,
      connectedDoorIds: []
    };
    onUpdateModel({
      ...model,
      rooms: [...model.rooms, newRoom]
    });
    setNewRoomName("");
    setIsAddingRoom(false);
  }

  function createDoor() {
    if (newDoorName.trim() === "") return;
    const newId = `dr-${Date.now().toString().slice(-4)}`;
    const newDoor: Door = {
      id: newId,
      name: newDoorName,
      levelId: model.levels[0]?.id || "lvl-01",
      widthM: newDoorWidth,
      connectedRoomIds: []
    };
    onUpdateModel({
      ...model,
      doors: [...model.doors, newDoor]
    });
    setNewDoorName("");
    setIsAddingDoor(false);
  }

  // Delete Entity
  function deleteEntity() {
    if (selectedType === "room" && activeRoom) {
      const updatedRooms = model.rooms.filter((r) => r.id !== activeRoom.id);
      // Clean door references
      const updatedDoors = model.doors.map((d) => ({
        ...d,
        connectedRoomIds: d.connectedRoomIds?.filter((id) => id !== activeRoom.id)
      }));
      onUpdateModel({ ...model, rooms: updatedRooms, doors: updatedDoors });
      onDeselect();
    } else if (selectedType === "door" && activeDoor) {
      const updatedDoors = model.doors.filter((d) => d.id !== activeDoor.id);
      // Clean room references
      const updatedRooms = model.rooms.map((r) => ({
        ...r,
        connectedDoorIds: r.connectedDoorIds?.filter((id) => id !== activeDoor.id)
      }));
      onUpdateModel({ ...model, rooms: updatedRooms, doors: updatedDoors });
      onDeselect();
    }
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Sliders className="h-4 w-4 text-indigo-500" />
          BIM Model Studio
        </h3>
        {selectedId && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDeselect}>
            Clear
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!selectedId ? (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-5 text-center dark:border-slate-800 dark:bg-slate-900/30"
          >
            <div className="py-6">
              <Layout className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No element selected
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">
                Select any room or door on the floor plan to inspect details and edit parameters in real-time.
              </p>
            </div>

            {/* Quick Creation Block */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex flex-col space-y-2">
              <p className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Model Builder
              </p>
              
              {/* Add Room Trigger */}
              {!isAddingRoom && !isAddingDoor ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1"
                    onClick={() => setIsAddingRoom(true)}
                  >
                    <Plus className="h-3 w-3" /> Add Room
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1"
                    onClick={() => setIsAddingDoor(true)}
                  >
                    <Plus className="h-3 w-3" /> Add Door
                  </Button>
                </div>
              ) : null}

              {/* Add Room Form */}
              {isAddingRoom && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-2 text-left bg-white p-3 rounded-lg border border-slate-200 dark:bg-slate-950 dark:border-slate-800"
                >
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">New Room Space</p>
                  <div>
                    <label className="text-[10px] text-slate-500">Name</label>
                    <input
                      type="text"
                      value={newRoomName}
                      placeholder="e.g. Office 103"
                      onChange={(e) => setNewRoomName(e.target.value)}
                      className={`w-full text-xs rounded border border-slate-300 px-2 py-1 bg-transparent dark:border-slate-800 ${focusRing}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Room Type</label>
                    <select
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value as RoomType)}
                      className={`w-full text-xs rounded border border-slate-300 px-2 py-1 bg-transparent dark:border-slate-800 dark:bg-slate-950 ${focusRing}`}
                    >
                      <option value="office">Office</option>
                      <option value="stockroom">Stockroom</option>
                      <option value="meeting_room">Meeting Room</option>
                      <option value="corridor">Corridor</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Area ({newRoomArea} sqm)</label>
                    <input
                      type="range"
                      min={4}
                      max={35}
                      step={0.5}
                      value={newRoomArea}
                      onChange={(e) => setNewRoomArea(Number(e.target.value))}
                      className={`w-full ${focusRing}`}
                    />
                  </div>
                  <div className="flex gap-2 pt-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setIsAddingRoom(false)}>Cancel</Button>
                    <Button size="sm" onClick={createRoom}>Create</Button>
                  </div>
                </motion.div>
              )}

              {/* Add Door Form */}
              {isAddingDoor && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-2 text-left bg-white p-3 rounded-lg border border-slate-200 dark:bg-slate-950 dark:border-slate-800"
                >
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">New Access Door</p>
                  <div>
                    <label className="text-[10px] text-slate-500">Name</label>
                    <input
                      type="text"
                      value={newDoorName}
                      placeholder="e.g. Door D6"
                      onChange={(e) => setNewDoorName(e.target.value)}
                      className={`w-full text-xs rounded border border-slate-300 px-2 py-1 bg-transparent dark:border-slate-800 ${focusRing}`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Door Width ({newDoorWidth}m)</label>
                    <input
                      type="range"
                      min={0.6}
                      max={1.5}
                      step={0.05}
                      value={newDoorWidth}
                      onChange={(e) => setNewDoorWidth(Number(e.target.value))}
                      className={`w-full ${focusRing}`}
                    />
                  </div>
                  <div className="flex gap-2 pt-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setIsAddingDoor(false)}>Cancel</Button>
                    <Button size="sm" onClick={createDoor}>Create</Button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="inspector-active"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`rounded-xl border p-4 bg-white/80 shadow-md backdrop-blur-sm dark:bg-slate-900/80 ${
              isEntityCompliant
                ? "border-emerald-200 dark:border-emerald-950"
                : "border-rose-200 dark:border-rose-950"
            }`}
          >
            {/* Inspector Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedType === "room" ? "outline" : "outline"} className="capitalize">
                    {selectedType === "room" ? <Layout className="h-3 w-3 mr-1" /> : <DoorOpen className="h-3 w-3 mr-1" />}
                    {selectedType}
                  </Badge>
                  <Badge variant={isEntityCompliant ? "success" : "destructive"}>
                    {isEntityCompliant ? "Compliant" : "Violations"}
                  </Badge>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1.5">
                  {selectedType === "room" ? activeRoom?.name : activeDoor?.name}
                </h4>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">{selectedId}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={deleteEntity}
                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Inspector Form Editor Body */}
            <div className="py-4 space-y-4 text-left">
              {selectedType === "room" && activeRoom && (
                <>
                  {/* Name field */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Label Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={activeRoom.name}
                        onChange={(e) => handleRoomNameChange(e.target.value)}
                        className={`w-full text-sm rounded-md border border-slate-200 bg-white/70 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950 ${focusRing}`}
                      />
                    </div>
                  </div>

                  {/* Room Type */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Function Type
                    </label>
                    <select
                      value={activeRoom.roomType}
                      onChange={(e) => handleRoomTypeChange(e.target.value as RoomType)}
                      className={`w-full text-sm rounded-md border border-slate-200 bg-white/70 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950 ${focusRing}`}
                    >
                      <option value="office">Office Space</option>
                      <option value="stockroom">Stockroom Store</option>
                      <option value="meeting_room">Meeting Hub</option>
                      <option value="corridor">Corridor Zone</option>
                    </select>
                  </div>

                  {/* Range Slider for Area sqm */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Floor Area Size
                      </label>
                      <span className="font-mono text-sm font-bold text-indigo-500 dark:text-indigo-400">
                        {activeRoom.areaSqm !== undefined ? `${activeRoom.areaSqm} sqm` : "Not defined"}
                      </span>
                    </div>
                    {activeRoom.areaSqm !== undefined ? (
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={2}
                          max={40}
                          step={0.1}
                          value={activeRoom.areaSqm}
                          onChange={(e) => handleRoomAreaChange(Number(e.target.value))}
                          className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-800 ${focusRing}`}
                        />
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => handleRoomAreaChange(12)}
                      >
                        Initialize Area Fact (12 sqm)
                      </Button>
                    )}
                  </div>

                  {/* Connected doors details */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Access Boundary Connectivity
                    </label>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-950/20 text-xs">
                      {activeRoom.connectedDoorIds && activeRoom.connectedDoorIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activeRoom.connectedDoorIds.map((doorId) => (
                            <Badge key={doorId} variant="outline" className="font-mono text-[10px]">
                              {model.doors.find((d) => d.id === doorId)?.name || doorId}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">No doors connected. Space is isolated.</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {selectedType === "door" && activeDoor && (
                <>
                  {/* Name field */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Door Label
                    </label>
                    <input
                      type="text"
                      value={activeDoor.name}
                      onChange={(e) => handleDoorNameChange(e.target.value)}
                      className={`w-full text-sm rounded-md border border-slate-200 bg-white/70 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950 ${focusRing}`}
                    />
                  </div>

                  {/* Slider for Width M */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Clear Opening Width
                      </label>
                      <span className="font-mono text-sm font-bold text-indigo-500 dark:text-indigo-400">
                        {activeDoor.widthM !== undefined ? `${activeDoor.widthM}m` : "Not defined"}
                      </span>
                    </div>
                    {activeDoor.widthM !== undefined ? (
                      <input
                        type="range"
                        min={0.5}
                        max={2.0}
                        step={0.01}
                        value={activeDoor.widthM}
                        onChange={(e) => handleDoorWidthChange(Number(e.target.value))}
                        className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-800 ${focusRing}`}
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => handleDoorWidthChange(0.85)}
                      >
                        Initialize Width Fact (0.85m)
                      </Button>
                    )}
                  </div>

                  {/* Connected Rooms */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Connected Spaces
                    </label>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-950/20 text-xs">
                      {activeDoor.connectedRoomIds && activeDoor.connectedRoomIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activeDoor.connectedRoomIds.map((roomId) => (
                            <Badge key={roomId} variant="outline" className="font-mono text-[10px]">
                              {model.rooms.find((r) => r.id === roomId)?.name || roomId}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 italic">Unconnected door panel.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Entity specific validation issue messages */}
            {entityIssues.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-[11px] font-bold text-rose-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  Active Violations ({entityIssues.length})
                </p>
                <div className="space-y-2">
                  {entityIssues.map((issue, idx) => (
                    <div
                      key={idx}
                      className="text-xs border border-rose-100 bg-rose-50/30 p-2 rounded-md dark:border-rose-950 dark:bg-rose-950/10 text-rose-800 dark:text-rose-400"
                    >
                      <p className="font-semibold">{issue.requirementTitle}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{issue.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
