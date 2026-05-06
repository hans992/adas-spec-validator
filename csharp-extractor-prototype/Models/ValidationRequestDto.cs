namespace Adas.SpecExtractor.Models;

public sealed class ValidationRequestDto
{
    public required NormalizedModelDto Model { get; init; }
    public IReadOnlyList<RequirementDto> Requirements { get; init; } = [];
}
