namespace Adas.SpecExtractor.Models;

public sealed class RequirementDto
{
    public string Id { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Type { get; init; } = string.Empty;
    public string Severity { get; init; } = string.Empty;
    public string? RoomType { get; init; }
    public double? MinAreaSqm { get; init; }
    public double? MinDoorWidthM { get; init; }
}
