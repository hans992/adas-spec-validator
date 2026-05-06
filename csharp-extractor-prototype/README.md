# ADAS Spec Extractor Prototype (C#)

This folder is a prototype integration boundary for Autodesk-side extraction.

## What this is

- A simple .NET console app that emits normalized CAD/BIM-style model JSON.
- A contract-first extractor shape (`IModelExtractor`) with Revit/AutoCAD extractor stubs.
- A bridge between authoring tools and the existing TypeScript deterministic validator.

## What this is not

- Not a production Revit plugin.
- Not a production AutoCAD plugin.
- Not a complete Autodesk integration.

No Autodesk SDK packages are referenced here on purpose.

## Integration boundary

In production, this layer would use:

- **Revit API** to collect rooms, doors, parameters, and spatial relationships.
- **AutoCAD .NET API** to inspect entities/blocks/layers/attributes and derive mappings.

The extractor maps CAD/BIM model facts into normalized JSON (`levels`, `rooms`, `doors`).
That normalized payload is consumed by the TypeScript deterministic validation engine.

Core principle remains unchanged:

- Deterministic rules establish compliance truth first.
- AI (future step) may explain verified evidence afterward.
- Missing fields must remain null/unknown and are never guessed.

## Run (if .NET SDK is installed)

From this folder:

```bash
dotnet run --project Adas.SpecExtractor.csproj
```

Expected behavior:

- Prints normalized JSON to console.
- Attempts to write `sample-output/normalized-model.sample.json`.
