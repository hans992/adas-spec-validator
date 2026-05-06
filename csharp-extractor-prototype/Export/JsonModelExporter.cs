using System.Text.Json;
using Adas.SpecExtractor.Models;

namespace Adas.SpecExtractor.Export;

public static class JsonModelExporter
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public static string ToJson(NormalizedModelDto model)
    {
        return JsonSerializer.Serialize(model, SerializerOptions);
    }
}
