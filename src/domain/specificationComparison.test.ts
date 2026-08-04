import { describe, expect, it } from "vitest";
import { sampleRequirements } from "@/domain/sampleData";
import { compareSpecificationRequirements } from "@/domain/specificationComparison";

describe("specification comparison", () => {
  it("classifies stable ids across immutable revisions", () => {
    const before = sampleRequirements.slice(0, 2);
    const changed = { ...before[0], title: `${before[0].title} updated` };
    const added = { ...before[1], id: "new-rule" };
    const result = compareSpecificationRequirements(before, [changed, added]);
    expect(result.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "new-rule", kind: "added" },
      { id: before[0].id, kind: "changed" },
      { id: before[1].id, kind: "removed" }
    ].sort((a, b) => a.id.localeCompare(b.id)));
  });
});
