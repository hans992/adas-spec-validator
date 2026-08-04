import type { Requirement } from "@/domain/types";

export type RequirementChange = {
  id: string;
  title: string;
  kind: "added" | "changed" | "removed" | "unchanged";
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function compareSpecificationRequirements(before: Requirement[], after: Requirement[]): RequirementChange[] {
  const left = new Map(before.map((item) => [item.id, item]));
  const right = new Map(after.map((item) => [item.id, item]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().map((id) => {
    const previous = left.get(id);
    const current = right.get(id);
    if (!previous) return { id, title: current!.title, kind: "added" };
    if (!current) return { id, title: previous.title, kind: "removed" };
    return { id, title: current.title, kind: stable(previous) === stable(current) ? "unchanged" : "changed" };
  });
}
