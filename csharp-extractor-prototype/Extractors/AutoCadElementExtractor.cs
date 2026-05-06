using Adas.SpecExtractor.Models;

namespace Adas.SpecExtractor.Extractors;

public sealed class AutoCadElementExtractor : IModelExtractor
{
    public string SourceSystem => "AutoCAD (prototype)";

    public NormalizedModelDto ExtractModel()
    {
        // Production extractor notes:
        // - Open drawing Database and start Transaction scope.
        // - Walk BlockTableRecord(s) in model space/paper space.
        // - Inspect entities, layers, and attributes for room/door semantics.
        // - Derive connectivity using geometry, block references, and topology rules.
        // - Map extracted facts to NormalizedModelDto and keep unknown fields null.
        throw new NotImplementedException(
            "AutoCAD extraction is not implemented in this prototype. " +
            "This class defines the integration boundary only."
        );
    }
}
