using Aec.SpecExtractor.Models;

namespace Aec.SpecExtractor.Extractors;

public interface IModelExtractor
{
    string SourceSystem { get; }
    NormalizedModelDto ExtractModel();
}
