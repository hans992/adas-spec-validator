import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseIfcBytes } from "@/domain/ifcParser";
import { sampleRequirements } from "@/domain/sampleData";
import { validateWithDeterministicRules } from "@/domain/validationPipeline";

describe("parseIfcBytes", () => {
  it("extracts real storeys, spaces, doors, quantities and boundaries from IFC", async () => {
    const bytes = await readFile(resolve(process.cwd(), "test/fixtures/minimal-building.ifc"));
    const result = await parseIfcBytes(bytes);

    expect(result.diagnostics.schema).toContain("IFC4");
    expect(result.diagnostics).toMatchObject({ storeysFound: 1, spacesFound: 1, doorsFound: 1, boundariesFound: 1 });
    expect(result.model.levels[0].name).toBe("Ground Floor");
    expect(result.model.rooms[0]).toMatchObject({ name: "Stockroom 01", roomType: "stockroom", areaSqm: 8.5 });
    expect(result.model.doors[0]).toMatchObject({ name: "Stockroom Door", widthM: 0.9 });
    expect(result.model.rooms[0].connectedDoorIds).toEqual([result.model.doors[0].id]);
    expect(result.model.doors[0].connectedRoomIds).toEqual([result.model.rooms[0].id]);

    const validation = validateWithDeterministicRules(result.model, sampleRequirements);
    expect(validation.results.find((item) => item.requirementId === "req-stockroom-min-area")?.status).toBe("fail");
    expect(validation.results.find((item) => item.requirementId === "req-stockroom-door-width")?.status).toBe("pass");
    expect(validation.results.find((item) => item.requirementId === "req-room-has-door")?.status).toBe("pass");
  });

  it("rejects renamed text and empty IFC files", async () => {
    await expect(parseIfcBytes(new TextEncoder().encode("not really an IFC"))).rejects.toThrow("not a valid IFC");
    await expect(parseIfcBytes(new Uint8Array())).rejects.toThrow("empty");
  });
});
