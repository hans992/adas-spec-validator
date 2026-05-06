namespace Adas.SpecExtractor.Models;

public sealed class DoorDto
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string LevelId { get; init; } = string.Empty;
    public double? WidthM { get; init; }
    public IReadOnlyList<string>? ConnectedRoomIds { get; init; }
}
