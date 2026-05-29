import type { NormalizedModel } from "./types";

export const mockIfcModelData: NormalizedModel = {
  levels: [{ id: "lvl-02", name: "IFC Ground Level 02" }],
  rooms: [
    {
      id: "rm-ifc-stock-01",
      name: "IFC Stockroom A",
      levelId: "lvl-02",
      roomType: "stockroom",
      areaSqm: 22.4,
      connectedDoorIds: ["dr-ifc-01", "dr-ifc-02"]
    },
    {
      id: "rm-ifc-office-01",
      name: "IFC Office 101",
      levelId: "lvl-02",
      roomType: "office",
      areaSqm: 7.2, // FAILS (under 8 sqm)
      connectedDoorIds: ["dr-ifc-03"]
    },
    {
      id: "rm-ifc-meet-01",
      name: "IFC Conference Room",
      levelId: "lvl-02",
      roomType: "meeting_room",
      areaSqm: 28.5,
      connectedDoorIds: ["dr-ifc-04"]
    },
    {
      id: "rm-ifc-corr-01",
      name: "IFC Main Corridor",
      levelId: "lvl-02",
      roomType: "corridor",
      areaSqm: 14.0,
      connectedDoorIds: ["dr-ifc-01", "dr-ifc-03", "dr-ifc-04", "dr-ifc-05"]
    },
    {
      id: "rm-ifc-stock-02",
      name: "IFC Storage B",
      levelId: "lvl-02",
      roomType: "stockroom",
      areaSqm: 12.8, // FAILS (under 15 sqm)
      connectedDoorIds: [] // FAILS (no doors connected)
    }
  ],
  doors: [
    {
      id: "dr-ifc-01",
      name: "IFC Door D1",
      levelId: "lvl-02",
      widthM: 0.95,
      connectedRoomIds: ["rm-ifc-stock-01", "rm-ifc-corr-01"]
    },
    {
      id: "dr-ifc-02",
      name: "IFC Door D2",
      levelId: "lvl-02",
      widthM: 0.82, // FAILS stockroom min-width 0.85m limit
      connectedRoomIds: ["rm-ifc-stock-01"]
    },
    {
      id: "dr-ifc-03",
      name: "IFC Door D3",
      levelId: "lvl-02",
      widthM: 0.80,
      connectedRoomIds: ["rm-ifc-office-01", "rm-ifc-corr-01"]
    },
    {
      id: "dr-ifc-04",
      name: "IFC Door D4",
      levelId: "lvl-02",
      widthM: 0.90,
      connectedRoomIds: ["rm-ifc-meet-01", "rm-ifc-corr-01"]
    },
    {
      id: "dr-ifc-05",
      name: "IFC Door D5",
      levelId: "lvl-02",
      widthM: 0.75,
      connectedRoomIds: ["rm-ifc-corr-01"]
    }
  ]
};
