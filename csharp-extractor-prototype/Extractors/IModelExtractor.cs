using Adas.SpecExtractor.Models;

namespace Adas.SpecExtractor.Extractors;

public interface IModelExtractor
{
    string SourceSystem { get; }
    NormalizedModelDto ExtractModel();
}
