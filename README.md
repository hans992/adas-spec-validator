# ADAS Spec Validator

ADAS Spec Validator is an evidence-first prototype for validating CAD/BIM model facts against explicit requirements. It accepts normalized model JSON or native IFC STEP files, runs a deterministic rule engine, exposes the evidence behind every result, and optionally uses Gemini or OpenAI to explain only server-verified findings.

This is not a generic BIM chatbot and the LLM is never the source of truth. Rules validate first; AI explains second.

## What works today

- Native IFC2x3 and IFC4 upload through a server-side `web-ifc` parser
- Normalized JSON model and requirement upload with Zod validation
- Deterministic `pass`, `fail`, `unknown`, and `not_applicable` outcomes
- Minimum/maximum ranges, `any`/`all` connected-door quantifiers, and composite `AND`/`OR` room rules
- Evidence records with observed values, expected values, and affected element IDs
- Requirement-level pass rate, evaluation coverage, unknown/N/A counts, violations, and critical failures
- Markdown evidence report export
- Role-aware ADAS chat with Gemini, OpenAI, or a deterministic local fallback
- Server-side revalidation of model data and requirements before any AI call
- Structured AI responses whose requirement and element citations are verified against generated evidence
- IFC diagnostics for units, extraction sources, containment, connectivity, and unsupported or missing data
- Unit/API tests plus a Chromium E2E test covering IFC upload through report export
- Authenticated project and validation-history API backed by Supabase Row Level Security

## Architecture

```text
IFC or normalized JSON
        |
        v
Validated normalized model + requirements
        |
        v
Deterministic rule engine
        |
        +--> evidence + compliance metrics + Markdown report
        |
        v
Server-verified evidence context
        |
        +--> Gemini / OpenAI explanation
        `--> deterministic fallback
```

The browser does not provide authoritative validation results to the chat layer. `/api/chat` validates the submitted model and requirements, reruns the rule engine on the server, and gives the provider only normalized BIM facts and generated evidence. Raw IFC files are not sent to AI providers.

## Deterministic rules

The current rule engine supports:

- `minimum_room_area` with a required minimum and optional maximum
- `minimum_door_width_for_room_type` with a required minimum, optional maximum, and `any`/`all` connected-door quantifier (`all` by default)
- `room_has_connected_door`
- `composite_room_rule`, combining two to ten room-area and connected-door-width conditions with `and` or `or`

For example, this requirement passes for each office whose area is within 12–20 m² **and** that has at least one connected door within 0.9–1.2 m:

```json
{
  "id": "office-access",
  "title": "Office area and accessible entrance",
  "type": "composite_room_rule",
  "severity": "critical",
  "roomType": "office",
  "operator": "and",
  "conditions": [
    {
      "type": "room_area_range",
      "minAreaSqm": 12,
      "maxAreaSqm": 20
    },
    {
      "type": "connected_door_width_range",
      "minDoorWidthM": 0.9,
      "maxDoorWidthM": 1.2,
      "quantifier": "any"
    }
  ]
}
```

Composite rules target one room type and produce one result per matching room. Each condition retains its own evidence inside the combined result. `AND` fails as soon as a condition fails; `OR` passes as soon as a condition passes. Otherwise, incomplete facts keep the combined result `unknown` when they could still change the outcome.

Every requirement produces structured outcomes. Missing facts remain `unknown`; non-applicable requirements remain `not_applicable`; neither is silently converted into a pass or failure.

Compliance is deliberately split into separate metrics:

- **Pass rate:** passed requirements divided by decided, applicable requirements
- **Evaluation coverage:** decided requirements divided by all applicable requirements
- **Unknown:** applicable requirements that could not be decided from available evidence
- **Not applicable:** excluded from both pass rate and coverage
- **Critical failures:** failed requirements with critical severity

Metrics are aggregated per requirement, so a rule affecting many elements cannot outweigh another requirement simply by producing more result rows.

## IFC ingestion

The `/api/ifc` route accepts IFC STEP files up to 20 MB and extracts a normalized model from:

- `IfcBuildingStorey`, `IfcSpace`, `IfcDoor`, and `IfcDoorType`
- containment through `IfcRelContainedInSpatialStructure` and direct `IfcRelAggregates`
- room areas from `IfcElementQuantity` or supported property-set values
- door widths from the door instance, instance property sets, or its `IfcDoorType`
- direct space-to-door boundaries
- indirect space-to-door boundaries through `IfcOpeningElement` and `IfcRelFillsElement`
- declared metre-based IFC units, including common SI prefixes, normalized to metres and square metres

When door containment is missing, its storey may be inferred from an evidence-backed connection to a contained room. Elements that still cannot be assigned remain on an explicit `Unassigned IFC storey` instead of being guessed.

The diagnostics panel reports:

- detected IFC schema and length unit
- storey, space, door, and boundary counts
- direct versus opening-mediated connections
- quantity/property area sources
- instance/property/type door-width sources
- inferred and unresolved storey assignments
- warnings for missing units, semantics, areas, widths, and relationships

Room classification currently uses a small English/German name heuristic for stockrooms, offices, meeting rooms, and corridors. Unrecognized spaces remain `unknown`.

## Evidence-constrained ADAS chat

ADAS chat works without an API key by using a deterministic fallback. If a provider is enabled, it must return structured JSON with evidence citations. The server rejects malformed output, unknown requirement IDs, invented element IDs, and citations not supported by deterministic results, then falls back safely.

Additional API protections include:

- a 1 MB chat request limit
- Zod validation of the model, requirements, role, and question
- 20 chat requests per client per minute with `429` and `Retry-After`
- a 15-second timeout for Gemini and OpenAI calls

Configure providers with:

```bash
# Preferred when both providers are configured
GOOGLE_GENERATIVE_AI_API_KEY=your_key

# Optional; defaults to gemini-2.5-flash
GOOGLE_GENERATION_MODEL=gemini-2.5-flash

# Used when Gemini is not configured; defaults to gpt-4o-mini
OPENAI_API_KEY=your_key

# Required only for persisted projects and validation history
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Provider priority is Gemini, then OpenAI, then deterministic fallback.

Apply `supabase/migrations/202608030001_projects_and_validation_runs.sql` before using persistence. The project APIs accept a Supabase access token through `Authorization: Bearer <token>`. Validation snapshots are never accepted as client-authored results: the server validates the submitted model and requirements, reruns the deterministic engine, calculates metrics, and only then writes the snapshot. RLS and a composite foreign key enforce that a run belongs to both the authenticated owner and that owner's project.

The browser workspace supports email/password registration, sign-in, password recovery, and automatic access-token refresh. Add the application's production origin and local development origin to the Supabase Auth redirect URL allowlist so recovery links can return to the workspace. Whether a newly registered account receives an immediate session or must confirm its email follows the Supabase project's Auth settings.

## Run locally

Requirements:

- Node.js 22
- npm

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables are required for deterministic validation and fallback chat.

## Tests

Run unit and API tests:

```bash
npm test
```

Run a production build:

```bash
npm run build
```

The browser E2E suite expects `@playwright/test` and Chromium. CI installs the pinned Playwright version without adding it to the production dependency tree:

```bash
npm install --no-save --package-lock=false @playwright/test@1.62.1
npx playwright install chromium
npm run build
npm run test:e2e
```

The E2E test uploads a real IFC fixture, checks parser diagnostics and compliance metrics, downloads the Markdown report, and verifies its evidence content.

## C# extractor boundary

`csharp-extractor-prototype` demonstrates where a future Revit API or AutoCAD .NET integration can map Autodesk model facts into the normalized contract. It is a console prototype, not a production Autodesk plugin.

If the .NET SDK is installed:

```bash
dotnet run --project csharp-extractor-prototype/Adas.SpecExtractor.csproj
```

See [`csharp-extractor-prototype/README.md`](csharp-extractor-prototype/README.md) for details.

## Known limitations

- This is a functional prototype, not a certified compliance product.
- There is no production Revit or AutoCAD add-in yet.
- The IFC parser extracts a targeted semantic subset; it is not a full geometry engine.
- Room-type inference is heuristic and intentionally leaves uncertain classifications unknown.
- Composite rules currently target one room type and support room-area and connected-door-width conditions only; arbitrary nesting, cross-room aggregation, and additional BIM element types are not yet supported.
- Rate limiting is in-memory and therefore instance-local; production deployment should use a shared store.
- Browser email/password registration, sign-in, recovery, token refresh, project creation, validation history, and save/open controls are implemented. OAuth/SSO and multi-factor authentication are not yet implemented.
- Persisted snapshots currently store normalized facts, requirements, evidence, and metrics; raw IFC object storage and model-version diffs are not yet implemented.
- External AI availability and output quality remain provider-dependent; invalid responses fall back to deterministic explanations.

## Validation philosophy

- Never treat an LLM response as a validation result.
- Never guess missing BIM facts.
- Keep `unknown` distinct from `fail`.
- Keep coverage distinct from pass rate.
- Preserve evidence and affected element IDs for every conclusion.
- Prefer a deterministic fallback over an unsupported explanation.
