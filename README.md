# ADAS Spec Validator

ADAS Spec Validator is a deterministic AI design automation prototype for CAD/BIM-style model validation. It demonstrates how Revit/AutoCAD model facts could be extracted through a C# integration boundary, normalized into structured data, validated against explicit requirements, and then explained by an evidence-constrained ADAS chat layer.

This is not a generic chatbot. Deterministic rules validate first, AI explains second.  
This repository includes a C# extractor prototype boundary and does **not** claim production-ready Autodesk integration.

## Repository Highlights

- Deterministic rule engine for CAD/BIM-style requirements
- Evidence-backed validation results
- Pass/fail/unknown status handling
- Role-aware ADAS chat
- Anti-hallucination prompt design
- C# Revit/AutoCAD extractor prototype boundary
- Vitest coverage for rule engine and AI prompt/fallback behavior

## How to review this project in 2 minutes

1. Open the homepage and inspect the validation summary counters.
2. Review evidence under failed and unknown requirements.
3. Ask ADAS Chat: `What are the highest-risk issues?`
4. Switch roles between Design Engineer and Project Manager.
5. Open `csharp-extractor-prototype` to inspect the C# integration boundary.
6. Read the Demo Script section below.

## What this project demonstrates

- How to normalize CAD/BIM-like model data into a predictable structure (`rooms`, `doors`, `levels`, relationships).
- How to enforce engineering requirements with deterministic rule logic instead of language-model guesses.
- How to produce explicit validation evidence and affected element IDs for every result.
- How to keep the architecture ready for later AI-assisted explanation without coupling truth to AI.

## Why deterministic validation comes before AI

For safety, auditability, and engineering credibility, model checks must be deterministic first.  
The validator computes pass/fail/unknown from structured data and explicit thresholds. Missing data is never inferred.  
AI can later explain these verified outcomes, but it must not fabricate or decide compliance.

## Architecture

`Model Data -> Zod Validation -> Rule Engine -> Evidence -> (Future) AI Explanation`

- **Model Data:** normalized CAD/BIM-style entities and relationships.
- **Zod Validation:** schema validation gates malformed input before rules run.
- **Rule Engine:** deterministic requirement checks (`MinimumRoomAreaRule`, `MinimumDoorWidthForRoomTypeRule`, `RoomHasConnectedDoorRule`).
- **Evidence:** observed vs expected values plus affected element IDs.
- **Future AI Explanation:** narrative layer over already-verified evidence.

## Current scope

- Next.js App Router + TypeScript + Tailwind UI for an enterprise-style validation dashboard.
- Sample normalized model with passing, failing, and unknown cases.
- Sample requirement set for area, door width, and connectivity.
- Vitest coverage for key deterministic behaviors and missing-data handling.
- No AI implementation yet by design.

## Next steps

- Add API route for uploading/validating external normalized model JSON payloads.
- Add rule trace metadata and exportable validation reports (JSON/CSV).
- Add requirement versioning and grouped rule bundles by discipline (architectural, fire, accessibility).
- Add AI explanation layer that only consumes deterministic evidence objects.

## C# / Revit / AutoCAD integration plan

This first step uses normalized sample CAD/BIM model data.  
A future C# extractor layer would use Revit API or AutoCAD .NET API to extract rooms, doors, parameters, geometry, and relationships into this normalized format.

The current repository does **not** include a working Revit or AutoCAD plugin yet.

## C# Extractor Prototype

The `csharp-extractor-prototype` folder demonstrates how Autodesk-side extraction would connect to the validation system.
It is a .NET console prototype that maps source model facts into normalized JSON (`levels`, `rooms`, `doors`) for the TypeScript deterministic validation engine.
This is an integration boundary demo, not a complete Autodesk plugin implementation.

If .NET SDK is installed:

```bash
cd csharp-extractor-prototype
dotnet run --project Adas.SpecExtractor.csproj
```

## Evidence-Constrained ADAS Chat

The ADAS chat layer runs **after** deterministic validation and is constrained to:

- normalized model facts
- deterministic validation results
- rule-engine evidence items

The assistant does not replace deterministic validation, does not reinterpret pass/fail/unknown outcomes, and keeps missing data as unknown.
Role-aware response styles are supported for Design Engineer, Stockroom Personnel, and Project Manager.

No AI key is required for local use: fallback mode provides deterministic evidence-based summaries.
Set `OPENAI_API_KEY` to enable AI mode through the chat API route.

This project is still **not** a production Autodesk plugin.
The Revit/AutoCAD integration boundary remains in `csharp-extractor-prototype`.

## Portfolio Card Copy

**Title**  
ADAS Spec Validator

**Subtitle**  
Deterministic AI validation for CAD/BIM model requirements

**Description**  
A focused AI design automation prototype showing how CAD/BIM model facts can be extracted, normalized, validated with deterministic rules, and explained through an evidence-constrained ADAS chat assistant. Includes a C# extractor prototype representing the future Revit/AutoCAD integration boundary.

**Tech**  
Next.js, TypeScript, Zod, Vitest, OpenAI-compatible API, C#/.NET prototype

## LinkedIn Project Description

Built ADAS Spec Validator, a small AI design automation prototype for CAD/BIM-style validation workflows. The system validates normalized model facts with deterministic rules before any AI response is generated. The ADAS chat layer is constrained to validation evidence and supports role-aware explanations for design engineers, project managers, and operational users. Added a C#/.NET extractor prototype to show the Revit/AutoCAD integration boundary.

## Interview Talking Points

- Demonstrates AI systems engineering where deterministic validation is the compliance source of truth.
- Uses spec-driven CAD/BIM rule checks with explicit pass/fail/unknown outcomes.
- Constrains LLM behavior to evidence and normalized model facts, avoiding free-form hallucinated answers.
- Normalizes CAD/BIM entities (`levels`, `rooms`, `doors`) into a portable validation contract.
- Shows a C# integration boundary for future Revit API / AutoCAD .NET extraction workflows.
- Handles missing model parameters safely by preserving unknown states instead of guessing values.
- Separates validation logic from AI explanation logic for auditability and safer production evolution.

## Demo Script

This is a small ADAS-style validation prototype for AI design automation workflows.
The C# layer represents the Autodesk-side extraction boundary, where Revit API or AutoCAD .NET API would map model facts into normalized JSON.
The TypeScript layer validates those normalized CAD/BIM facts deterministically using explicit engineering requirements and outputs evidence.
The AI chat layer runs only after validation and is constrained to deterministic evidence, so it explains rather than decides compliance.
Unknown data is never guessed, and unknown states remain unknown until model facts are completed.
This mirrors how I would approach a production Revit/AutoCAD AI design automation system: deterministic core first, evidence-constrained AI second.

## Interview Q&A

**Q: Is this a real Revit or AutoCAD plugin?**  
**A:** No. The current version uses normalized sample CAD/BIM data. The C# prototype demonstrates the integration boundary where a production Revit API or AutoCAD .NET API extractor would connect.

**Q: Why use TypeScript for the validator if the role requires C#?**  
**A:** TypeScript allowed fast iteration on the validation/AI workflow and UI. The C# prototype shows how Autodesk-side extraction would produce the normalized data consumed by the validator. In production, more logic could move into C# depending on deployment architecture.

**Q: How do you prevent AI hallucinations?**  
**A:** The LLM is not the source of truth. Deterministic validation runs first, every result includes evidence, missing data becomes unknown, and the ADAS prompt instructs the model to answer only from evidence.

**Q: What would you build next?**  
**A:** A real Revit add-in using the Revit API, AutoCAD .NET extraction, IFC import, visual element highlighting, richer geometry/spatial validation, and exportable validation reports.

**Q: What does this demonstrate about you?**  
**A:** It shows AI systems engineering, spec-driven development, evidence-constrained LLM design, and the ability to map an unfamiliar CAD/BIM domain into a reliable software architecture.

## Known Limitations

- Not a production Autodesk plugin.
- Uses normalized sample CAD/BIM model data for the validation demo.
- C# extractor is a prototype integration boundary, not a full live extractor.
- AI mode depends on external provider availability and API key configuration.
- Geometry/spatial reasoning is simplified in this prototype.
- No IFC/Revit file ingestion pipeline yet.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run tests

```bash
npm test
```
