import {
  IFCBUILDINGSTOREY,
  IFCDOOR,
  IFCELEMENTQUANTITY,
  IFCQUANTITYAREA,
  IFCRELAGGREGATES,
  IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IFCRELDEFINESBYPROPERTIES,
  IFCRELSPACEBOUNDARY,
  IFCSPACE,
  IfcAPI
} from "web-ifc";

import { normalizedModelSchema } from "@/domain/schemas";
import type { Door, Level, NormalizedModel, Room, RoomType } from "@/domain/types";

export interface IfcParseDiagnostics {
  schema: string;
  storeysFound: number;
  spacesFound: number;
  doorsFound: number;
  boundariesFound: number;
  warnings: string[];
}

export interface IfcParseResult {
  model: NormalizedModel;
  diagnostics: IfcParseDiagnostics;
}

type IfcRef = { value?: number } | number | null | undefined;
type IfcValue = { value?: unknown; _representationValue?: unknown } | string | number | null | undefined;

const MAX_IFC_BYTES = 20 * 1024 * 1024;

function valueOf<T extends string | number>(value: IfcValue): T | undefined {
  if (typeof value === "string" || typeof value === "number") return value as T;
  if (value && typeof value === "object" && "value" in value) {
    const nested = value.value;
    if (typeof nested === "string" || typeof nested === "number") return nested as T;
  }
  if (value && typeof value === "object" && "_representationValue" in value) {
    const nested = value._representationValue;
    if (typeof nested === "string" || typeof nested === "number") return nested as T;
  }
  return undefined;
}

function refId(value: IfcRef): number | undefined {
  if (typeof value === "number") return value;
  return value?.value;
}

function refs(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => refId(item as IfcRef)).filter((id): id is number => id !== undefined);
}

function entityIds(api: IfcAPI, modelId: number, type: number, includeInherited = false): number[] {
  const vector = api.GetLineIDsWithType(modelId, type, includeInherited);
  const ids: number[] = [];
  for (let index = 0; index < vector.size(); index += 1) ids.push(vector.get(index));
  return ids;
}

function stableId(prefix: string, line: Record<string, unknown>, expressId: number): string {
  return `ifc:${prefix}:${valueOf<string>(line.GlobalId as IfcValue) ?? expressId}`;
}

function inferRoomType(line: Record<string, unknown>): RoomType {
  const text = [line.Name, line.LongName, line.ObjectType, line.PredefinedType]
    .map((value) => valueOf<string>(value as IfcValue)?.toLowerCase() ?? "")
    .join(" ");
  if (/stock|storage|store\s?room|lager/.test(text)) return "stockroom";
  if (/meeting|conference|besprech/.test(text)) return "meeting_room";
  if (/corridor|hallway|flur/.test(text)) return "corridor";
  if (/office|büro|buero/.test(text)) return "office";
  return "unknown";
}

function readAreaQuantities(api: IfcAPI, modelId: number): Map<number, number> {
  const areas = new Map<number, number>();
  const elementQuantities = new Map<number, Record<string, unknown>>();
  for (const id of entityIds(api, modelId, IFCELEMENTQUANTITY)) {
    elementQuantities.set(id, api.GetLine(modelId, id) as Record<string, unknown>);
  }

  for (const relationId of entityIds(api, modelId, IFCRELDEFINESBYPROPERTIES)) {
    const relation = api.GetLine(modelId, relationId) as Record<string, unknown>;
    const definitionId = refId(relation.RelatingPropertyDefinition as IfcRef);
    const definition = definitionId === undefined ? undefined : elementQuantities.get(definitionId);
    if (!definition) continue;

    let selectedArea: number | undefined;
    for (const quantityId of refs(definition.Quantities)) {
      const quantity = api.GetLine(modelId, quantityId) as Record<string, unknown>;
      if (quantity.type !== IFCQUANTITYAREA) continue;
      const name = valueOf<string>(quantity.Name as IfcValue)?.toLowerCase() ?? "";
      if (!/netfloorarea|grossfloorarea|floorarea|area/.test(name)) continue;
      const area = valueOf<number>(quantity.AreaValue as IfcValue);
      if (area !== undefined && area > 0) {
        selectedArea = area;
        if (name === "netfloorarea") break;
      }
    }

    if (selectedArea !== undefined) {
      for (const objectId of refs(relation.RelatedObjects)) areas.set(objectId, selectedArea);
    }
  }
  return areas;
}

export async function parseIfcBytes(bytes: Uint8Array): Promise<IfcParseResult> {
  if (bytes.byteLength === 0) throw new Error("The IFC file is empty.");
  if (bytes.byteLength > MAX_IFC_BYTES) throw new Error("The IFC file exceeds the 20 MB prototype limit.");

  const header = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 4096))).toUpperCase();
  if (!header.includes("ISO-10303-21") || !header.includes("FILE_SCHEMA")) {
    throw new Error("The uploaded file is not a valid IFC STEP document.");
  }

  const api = new IfcAPI();
  await api.Init();
  let modelId: number | undefined;

  try {
    modelId = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
    const schema = api.GetModelSchema(modelId);
    const warnings: string[] = [];
    const storeyIds = entityIds(api, modelId, IFCBUILDINGSTOREY);
    const spaceIds = entityIds(api, modelId, IFCSPACE, true);
    const doorIds = entityIds(api, modelId, IFCDOOR, true);
    if (storeyIds.length === 0) throw new Error("No IfcBuildingStorey entities were found.");
    if (spaceIds.length === 0) throw new Error("No IfcSpace entities were found.");

    const levelsByExpressId = new Map<number, Level>();
    for (const id of storeyIds) {
      const line = api.GetLine(modelId, id) as Record<string, unknown>;
      levelsByExpressId.set(id, {
        id: stableId("level", line, id),
        name: valueOf<string>(line.Name as IfcValue) ?? `Storey ${id}`
      });
    }

    const containerByElement = new Map<number, number>();
    for (const relationType of [IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELAGGREGATES]) {
      for (const relationId of entityIds(api, modelId, relationType)) {
        const relation = api.GetLine(modelId, relationId) as Record<string, unknown>;
        const parentId = refId((relation.RelatingStructure ?? relation.RelatingObject) as IfcRef);
        if (parentId === undefined || !levelsByExpressId.has(parentId)) continue;
        for (const childId of refs(relation.RelatedElements ?? relation.RelatedObjects)) {
          containerByElement.set(childId, parentId);
        }
      }
    }

    let unassignedLevel: Level | undefined;
    const levelForElement = (expressId: number): Level => {
      const mapped = levelsByExpressId.get(containerByElement.get(expressId) ?? -1);
      if (mapped) return mapped;
      if (levelsByExpressId.size === 1) return [...levelsByExpressId.values()][0];
      unassignedLevel ??= { id: "ifc:level:unassigned", name: "Unassigned IFC storey" };
      return unassignedLevel;
    };

    const areaByElement = readAreaQuantities(api, modelId);
    const roomsByExpressId = new Map<number, Room>();
    for (const id of spaceIds) {
      const line = api.GetLine(modelId, id) as Record<string, unknown>;
      const roomType = inferRoomType(line);
      if (roomType === "unknown") warnings.push(`IfcSpace #${id} has no recognized semantic room type.`);
      roomsByExpressId.set(id, {
        id: stableId("space", line, id),
        name: valueOf<string>(line.LongName as IfcValue) ?? valueOf<string>(line.Name as IfcValue) ?? `Space ${id}`,
        levelId: levelForElement(id).id,
        roomType,
        areaSqm: areaByElement.get(id),
        connectedDoorIds: []
      });
    }

    const doorsByExpressId = new Map<number, Door>();
    for (const id of doorIds) {
      const line = api.GetLine(modelId, id) as Record<string, unknown>;
      const width = valueOf<number>(line.OverallWidth as IfcValue);
      if (width === undefined) warnings.push(`IfcDoor #${id} has no OverallWidth value.`);
      doorsByExpressId.set(id, {
        id: stableId("door", line, id),
        name: valueOf<string>(line.Name as IfcValue) ?? `Door ${id}`,
        levelId: levelForElement(id).id,
        widthM: width,
        connectedRoomIds: []
      });
    }

    let boundariesFound = 0;
    for (const relationId of entityIds(api, modelId, IFCRELSPACEBOUNDARY, true)) {
      const relation = api.GetLine(modelId, relationId) as Record<string, unknown>;
      const space = roomsByExpressId.get(refId(relation.RelatingSpace as IfcRef) ?? -1);
      const door = doorsByExpressId.get(refId(relation.RelatedBuildingElement as IfcRef) ?? -1);
      if (!space || !door) continue;
      if (!space.connectedDoorIds?.includes(door.id)) space.connectedDoorIds?.push(door.id);
      if (!door.connectedRoomIds?.includes(space.id)) door.connectedRoomIds?.push(space.id);
      boundariesFound += 1;
    }
    if (doorsByExpressId.size > 0 && boundariesFound === 0) {
      warnings.push("No direct IfcRelSpaceBoundary relationships between spaces and doors were found.");
    }

    const levels = [...levelsByExpressId.values()];
    if (unassignedLevel) levels.push(unassignedLevel);
    const model = normalizedModelSchema.parse({
      levels,
      rooms: [...roomsByExpressId.values()],
      doors: [...doorsByExpressId.values()]
    });

    return {
      model,
      diagnostics: {
        schema,
        storeysFound: storeyIds.length,
        spacesFound: spaceIds.length,
        doorsFound: doorIds.length,
        boundariesFound,
        warnings
      }
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("The IFC parser could not read this model.");
  } finally {
    if (modelId !== undefined) api.CloseModel(modelId);
  }
}
