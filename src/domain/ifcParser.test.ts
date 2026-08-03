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

  it("converts millimetre models and falls back to property-set dimensions", async () => {
    const bytes = await readFile(resolve(process.cwd(), "test/fixtures/millimetre-property-building.ifc"));
    const result = await parseIfcBytes(bytes);

    expect(result.diagnostics.lengthUnit).toBe("millimetre");
    expect(result.diagnostics.areaSources).toEqual({ quantities: 0, properties: 1 });
    expect(result.diagnostics.doorWidthSources).toEqual({ instances: 0, properties: 1 });
    expect(result.model.rooms[0]).toMatchObject({ roomType: "office", areaSqm: 12.5 });
    expect(result.model.doors[0]).toMatchObject({ widthM: 0.9 });
  });

  it("supports IFC2x3 coordination-view models", async () => {
    const bytes = await readFile(resolve(process.cwd(), "test/fixtures/ifc2x3-building.ifc"));
    const result = await parseIfcBytes(bytes);

    expect(result.diagnostics.schema).toContain("IFC2X3");
    expect(result.diagnostics.lengthUnit).toBe("metre");
    expect(result.model.rooms[0]).toMatchObject({ roomType: "meeting_room", areaSqm: 18.25 });
    expect(result.model.doors[0]).toMatchObject({ widthM: 1 });
    expect(result.diagnostics.boundariesFound).toBe(1);
  });

  it("assigns multiple storeys and resolves doors through IfcOpeningElement", async () => {
    const bytes = await readFile(resolve(process.cwd(), "test/fixtures/multistorey-opening-building.ifc"));
    const result = await parseIfcBytes(bytes);

    expect(result.diagnostics).toMatchObject({
      storeysFound: 2,
      spacesFound: 2,
      doorsFound: 2,
      boundariesFound: 2,
      boundarySources: { direct: 0, throughOpenings: 2 }
    });
    expect(result.model.levels.map((level) => level.name)).toEqual(["Ground Floor", "First Floor"]);

    const groundRoom = result.model.rooms.find((room) => room.name === "Ground Office");
    const firstRoom = result.model.rooms.find((room) => room.name === "First Meeting Room");
    const groundDoor = result.model.doors.find((door) => door.name === "Ground Door");
    const firstDoor = result.model.doors.find((door) => door.name === "First Door");

    expect(groundRoom?.levelId).toBe(result.model.levels[0].id);
    expect(firstRoom?.levelId).toBe(result.model.levels[1].id);
    expect(groundDoor?.levelId).toBe(result.model.levels[0].id);
    expect(firstDoor?.levelId).toBe(result.model.levels[1].id);
    expect(groundRoom?.connectedDoorIds).toEqual([groundDoor?.id]);
    expect(firstRoom?.connectedDoorIds).toEqual([firstDoor?.id]);
    expect(groundDoor?.connectedRoomIds).toEqual([groundRoom?.id]);
    expect(firstDoor?.connectedRoomIds).toEqual([firstRoom?.id]);
  });
});
