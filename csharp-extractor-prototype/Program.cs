using Adas.SpecExtractor.Export;
using Adas.SpecExtractor.Extractors;

IModelExtractor extractor = new RevitElementExtractor();
var model = extractor.ExtractModel();
var json = JsonModelExporter.ToJson(model);

Console.WriteLine($"Extractor Source: {extractor.SourceSystem}");
Console.WriteLine("Normalized model payload:");
Console.WriteLine(json);

var outputDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "sample-output");
outputDir = Path.GetFullPath(outputDir);
var outputPath = Path.Combine(outputDir, "normalized-model.sample.json");

try
{
    Directory.CreateDirectory(outputDir);
    await File.WriteAllTextAsync(outputPath, json);
    Console.WriteLine($"Saved sample output: {outputPath}");
}
catch (Exception ex)
{
    Console.WriteLine($"Could not write sample output file: {ex.Message}");
}
