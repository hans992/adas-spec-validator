"use client";

import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { requirementSchema, requirementsSchema } from "@/domain/schemas";
import type { Requirement } from "@/domain/types";
import { Button } from "@/components/ui/button";

const starter: Requirement = { id: "new-requirement", title: "New requirement", type: "room_has_connected_door", severity: "warning" };

export function RequirementEditor({ requirements, onChange }: { requirements: Requirement[]; onChange: (requirements: Requirement[]) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const editing = useMemo(() => requirements.find((item) => item.id === editingId), [editingId, requirements]);

  function begin(requirement: Requirement) { setEditingId(requirement.id); setDraft(JSON.stringify(requirement, null, 2)); setError(""); }
  function commit() {
    try {
      const parsed = requirementSchema.parse(JSON.parse(draft));
      const next = requirements.map((item) => item.id === editingId ? parsed : item);
      onChange(requirementsSchema.parse(next)); setEditingId(null); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid requirement."); }
  }
  function add() {
    let suffix = 1; let id = starter.id;
    while (requirements.some((item) => item.id === id)) id = `${starter.id}-${++suffix}`;
    const item = { ...starter, id }; onChange([...requirements, item]); begin(item);
  }
  function duplicate(item: Requirement) {
    let suffix = 2; let id = `${item.id}-copy`;
    while (requirements.some((candidate) => candidate.id === id)) id = `${item.id}-copy-${suffix++}`;
    onChange(requirementsSchema.parse([...requirements, { ...item, id, title: `${item.title} (copy)` }]));
  }

  return <div className="space-y-2 rounded-lg border p-3 text-left">
    <div className="flex items-center justify-between"><div><p className="text-xs font-semibold">Requirement editor</p><p className="text-[10px] text-slate-500">Edit the active draft, then save it as a new immutable revision.</p></div><Button variant="outline" size="sm" onClick={add} disabled={requirements.length >= 1000}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button></div>
    <div className="max-h-64 space-y-1 overflow-y-auto">{requirements.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"><div className="min-w-0"><p className="truncate text-[11px] font-semibold">{item.title}</p><p className="truncate font-mono text-[9px] text-slate-500">{item.id} · {item.type} · {item.severity}</p></div><div className="flex gap-1"><Button aria-label={`Edit ${item.id}`} variant="outline" size="sm" onClick={() => begin(item)}><Pencil className="h-3 w-3" /></Button><Button aria-label={`Duplicate ${item.id}`} variant="outline" size="sm" onClick={() => duplicate(item)}><Copy className="h-3 w-3" /></Button><Button aria-label={`Delete ${item.id}`} variant="outline" size="sm" disabled={requirements.length === 1} onClick={() => onChange(requirements.filter((candidate) => candidate.id !== item.id))}><Trash2 className="h-3 w-3" /></Button></div></div>)}</div>
    {editing && <div className="space-y-2 rounded border bg-slate-50 p-2 dark:bg-slate-900"><p className="text-[10px] font-semibold">Editing {editing.id}</p><textarea aria-label="Requirement JSON" value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-52 w-full rounded border bg-transparent p-2 font-mono text-[10px]" />{error && <p className="text-[10px] text-rose-500">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button><Button size="sm" onClick={commit}>Apply draft</Button></div></div>}
  </div>;
}
