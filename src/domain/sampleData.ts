import type { NormalizedModel, Requirement } from "@/domain/types";

export const sampleModelData: NormalizedModel = {
  levels: [{ id: "lvl-01", name: "Level 01" }],
  rooms: [
    {
      id: "rm-stock-01",
      name: "Stockroom A",
      levelId: "lvl-01",
      roomType: "stockroom",
      areaSqm: 18.2,
      connectedDoorIds: ["dr-01", "dr-05"]
    },
    {
      id: "rm-office-01",
      name: "Office 101",
      levelId: "lvl-01",
      roomType: "office",
      areaSqm: 9.4,
      connectedDoorIds: ["dr-02"]
    },
    {
      id: "rm-office-02",
      name: "Office 102",
      levelId: "lvl-01",
      roomType: "office",
      areaSqm: 6.1,
      connectedDoorIds: ["dr-03"]
    },
    {
      id: "rm-meet-01",
      name: "Meeting Room A",
      levelId: "lvl-01",
      roomType: "meeting_room",
      connectedDoorIds: ["dr-04"]
    },
    {
      id: "rm-stock-02",
      name: "Stockroom B",
      levelId: "lvl-01",
      roomType: "stockroom"
    }
  ],
  doors: [
    {
      id: "dr-01",
      name: "Door S1",
      levelId: "lvl-01",
      widthM: 0.9,
      connectedRoomIds: ["rm-stock-01"]
    },
    {
      id: "dr-02",
      name: "Door O1",
      levelId: "lvl-01",
      widthM: 0.88,
      connectedRoomIds: ["rm-office-01"]
    },
    {
      id: "dr-03",
      name: "Door O2",
      levelId: "lvl-01",
      widthM: 0.8,
      connectedRoomIds: ["rm-office-02"]
    },
    {
      id: "dr-04",
      name: "Door M1",
      levelId: "lvl-01",
      widthM: 0.95,
      connectedRoomIds: ["rm-meet-01"]
    },
    {
      id: "dr-05",
      name: "Door S2",
      levelId: "lvl-01",
      widthM: 0.8,
      connectedRoomIds: ["rm-stock-01"]
    }
  ]
};

export const sampleRequirements: Requirement[] = [
  {
    id: "req-stockroom-min-area",
    title: "Stockrooms must be at least 15 sqm",
    type: "minimum_room_area",
    severity: "critical",
    roomType: "stockroom",
    minAreaSqm: 15
  },
  {
    id: "req-office-min-area",
    title: "Offices must be at least 8 sqm",
    type: "minimum_room_area",
    severity: "critical",
    roomType: "office",
    minAreaSqm: 8
  },
  {
    id: "req-stockroom-door-width",
    title: "Stockroom doors must be at least 0.85m wide",
    type: "minimum_door_width_for_room_type",
    severity: "warning",
    roomType: "stockroom",
    minDoorWidthM: 0.85
  },
  {
    id: "req-room-has-door",
    title: "Every room must have at least one connected door",
    type: "room_has_connected_door",
    severity: "warning"
  }
];
