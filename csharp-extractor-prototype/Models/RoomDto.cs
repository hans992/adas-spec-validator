namespace Adas.SpecExtractor.Models;

public sealed class RoomDto
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string LevelId { get; init; } = string.Empty;
    public string RoomType { get; init; } = string.Empty;
    public double? AreaSqm { get; init; }
    public IReadOnlyList<string>? ConnectedDoorIds { get; init; }
}
