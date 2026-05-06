namespace Adas.SpecExtractor.Models;

public sealed class NormalizedModelDto
{
    public IReadOnlyList<LevelDto> Levels { get; init; } = [];
    public IReadOnlyList<RoomDto> Rooms { get; init; } = [];
    public IReadOnlyList<DoorDto> Doors { get; init; } = [];
}
