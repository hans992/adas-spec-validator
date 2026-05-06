# ADAS Spec Validator

ADAS Spec Validator is a deterministic AI design automation prototype for CAD/BIM-style model validation. It demonstrates how Revit/AutoCAD model facts can be extracted through a C# integration boundary, normalized into structured data, validated against explicit requirements, and then explained by an evidence-constrained ADAS chat layer.

This is not a generic chatbot. Deterministic rules validate first, AI explains second.  
The repository includes a C# extractor prototype boundary and does **not** claim production-ready Autodesk integration.

## Highlights

- Deterministic rule engine for CAD/BIM-style requirements
- Evidence-backed validation results
- Explicit `pass` / `fail` / `unknown` status handling
- Role-aware ADAS chat constrained to validation evidence
- Anti-hallucination prompt design and fallback mode
- C#/.NET extractor prototype boundary for Revit/AutoCAD workflows
- Vitest coverage for rule engine and AI prompt/fallback behavior

## Architecture

`Revit/AutoCAD Extractor Prototype -> Normalized Model Data -> Deterministic Rule Engine -> Evidence -> Role-Aware ADAS Chat`

- **Normalized model data:** `levels`, `rooms`, `doors`, relationships, and parameters
- **Deterministic validation:** explicit rules evaluate requirements and return structured outcomes
- **Evidence model:** each result includes affected element IDs and observed vs expected facts
- **ADAS chat layer:** explains only what deterministic evidence supports

## Deterministic Validation Principle

- The LLM is not the source of truth.
- Missing data is never guessed.
- Unknown input stays `unknown`; it is never converted into `pass` or `fail`.
- AI explanations must not override deterministic rule results.

## Main Components

### Web App (`Next.js` + `TypeScript`)

- Deterministic validation dashboard
- Risk counters (pass/fail/unknown/critical)
- Evidence-first result display
- Role-aware ADAS chat panel with fallback/AI modes

### Rule Engine

- `MinimumRoomAreaRule`
- `MinimumDoorWidthForRoomTypeRule`
- `RoomHasConnectedDoorRule`

All rules produce structured evidence with affected element IDs.

### C# Extractor Prototype (`csharp-extractor-prototype`)

- Console-based prototype of Autodesk-side extraction boundary
- `RevitElementExtractor` and `AutoCadElementExtractor` boundary classes
- JSON export of normalized model payload

## C# / Revit / AutoCAD Boundary

This project does **not** include a production Revit or AutoCAD plugin.  
The C# prototype demonstrates where a real Revit API or AutoCAD .NET API extractor would connect, mapping model facts into the normalized contract consumed by the validator.

Run C# prototype (if .NET SDK is installed):

```bash
dotnet run --project csharp-extractor-prototype/Adas.SpecExtractor.csproj
```

## Evidence-Constrained ADAS Chat

ADAS chat runs after deterministic validation and is constrained to:

- normalized model facts
- validation results
- rule evidence items

If evidence is insufficient, the assistant must respond with:

`I cannot determine that from the available model evidence.`

No API key is required for local use: fallback mode is deterministic.  
Set provider keys to enable AI mode.

## AI Provider Configuration

ADAS Chat works without any AI key using deterministic fallback mode.

- **Gemini:** set `GOOGLE_GENERATIVE_AI_API_KEY`
- **Gemini model override (optional):** set `GOOGLE_GENERATION_MODEL` (default: `gemini-2.5-flash`)
- **OpenAI:** set `OPENAI_API_KEY`

Provider priority:

1. `GOOGLE_GENERATIVE_AI_API_KEY` (Gemini)
2. `OPENAI_API_KEY` (OpenAI)
3. deterministic fallback

AI responses remain evidence-constrained and do not override deterministic validation results.

## Known Limitations

- Not a production Autodesk plugin
- Uses normalized sample CAD/BIM model data
- C# extractor is a prototype integration boundary
- AI mode depends on external provider availability and API key
- Geometry/spatial reasoning is simplified
- No IFC/Revit file ingestion pipeline yet

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run Tests

```bash
npm test
```
