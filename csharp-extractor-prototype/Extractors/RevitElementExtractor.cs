using Adas.SpecExtractor.Models;

namespace Adas.SpecExtractor.Extractors;

public sealed class RevitElementExtractor : IModelExtractor
{
    public string SourceSystem => "Revit (prototype)";

    public NormalizedModelDto ExtractModel()
    {
        // Production extractor notes:
        // - Use FilteredElementCollector on Document to collect levels, rooms, and door family instances.
        // - Read parameters (Name, Number, Area, Width, Level) from room/door elements.
        // - Resolve room-door relationships via geometry/spatial queries and host/opening relationships.
        // - Preserve null when parameters are absent; do not infer missing facts.

        return new NormalizedModelDto
        {
            Levels =
            [
                new LevelDto
                {
                    Id = "lvl-01",
                    Name = "Level 01"
                }
            ],
            Rooms =
            [
                new RoomDto
                {
                    Id = "rm-stock-01",
                    Name = "Stockroom A",
                    LevelId = "lvl-01",
                    RoomType = "stockroom",
                    AreaSqm = 18.2,
                    ConnectedDoorIds = ["dr-01", "dr-05"]
                },
                new RoomDto
                {
                    Id = "rm-office-01",
                    Name = "Office 101",
                    LevelId = "lvl-01",
                    RoomType = "office",
                    AreaSqm = 9.4,
                    ConnectedDoorIds = ["dr-02"]
                },
                new RoomDto
                {
                    Id = "rm-office-02",
                    Name = "Office 102",
                    LevelId = "lvl-01",
                    RoomType = "office",
                    AreaSqm = 6.1,
                    ConnectedDoorIds = ["dr-03"]
                },
                new RoomDto
                {
                    Id = "rm-meet-01",
                    Name = "Meeting Room A",
                    LevelId = "lvl-01",
                    RoomType = "meeting_room",
                    AreaSqm = null,
                    ConnectedDoorIds = ["dr-04"]
                },
                new RoomDto
                {
                    Id = "rm-stock-02",
                    Name = "Stockroom B",
                    LevelId = "lvl-01",
                    RoomType = "stockroom",
                    AreaSqm = null,
                    ConnectedDoorIds = null
                }
            ],
            Doors =
            [
                new DoorDto
                {
                    Id = "dr-01",
                    Name = "Door S1",
                    LevelId = "lvl-01",
                    WidthM = 0.9,
                    ConnectedRoomIds = ["rm-stock-01"]
                },
                new DoorDto
                {
                    Id = "dr-02",
                    Name = "Door O1",
                    LevelId = "lvl-01",
                    WidthM = 0.88,
                    ConnectedRoomIds = ["rm-office-01"]
                },
                new DoorDto
                {
                    Id = "dr-03",
                    Name = "Door O2",
                    LevelId = "lvl-01",
                    WidthM = 0.8,
                    ConnectedRoomIds = ["rm-office-02"]
                },
                new DoorDto
                {
                    Id = "dr-04",
                    Name = "Door M1",
                    LevelId = "lvl-01",
                    WidthM = 0.95,
                    ConnectedRoomIds = ["rm-meet-01"]
                },
                new DoorDto
                {
                    Id = "dr-05",
                    Name = "Door S2",
                    LevelId = "lvl-01",
                    WidthM = 0.8,
                    ConnectedRoomIds = ["rm-stock-01"]
                }
            ]
        };
    }
}
