# AEC Spec Validator

AEC Spec Validator is an evidence-first prototype for validating CAD/BIM model facts against explicit requirements. It accepts normalized model JSON or native IFC STEP files, runs a deterministic rule engine, exposes the evidence behind every result, and optionally uses Gemini or OpenAI to explain only server-verified findings.

This is not a generic BIM chatbot and the LLM is never the source of truth. Rules validate first; AI explains second.

## What works today

- Native IFC2x3 and IFC4 upload through a server-side `web-ifc` parser
- Normalized JSON model and versioned specification-package upload with Zod validation
- Deterministic `pass`, `fail`, `unknown`, and `not_applicable` outcomes
- Minimum/maximum ranges, `any`/`all` connected-door quantifiers, and composite `AND`/`OR` room rules
- Evidence records with observed values, expected values, and affected element IDs
- Requirement-level pass rate, evaluation coverage, unknown/N/A counts, violations, and critical failures
- Markdown evidence report export
- Role-aware AEC chat with Gemini, OpenAI, or a deterministic local fallback
- Server-side revalidation of model data and requirements before any AI call
- Structured AI responses whose requirement and element citations are verified against generated evidence
- IFC diagnostics for units, extraction sources, containment, connectivity, and unsupported or missing data
- Unit/API tests plus a Chromium E2E test covering IFC upload through report export
- Authenticated project and validation-history API backed by Supabase Row Level Security
- Version-to-version validation comparison with requirement and model deltas
- Baseline validation runs with deterministic regression gates and per-project release policy
- Per-requirement review decisions and audit notes on saved validation runs
- Stable requirement IDs and document/section/revision traceability in findings and reports
- Project specification library with immutable, reusable requirement revisions
- Reviewed XLSX import/export with atomic confirmation
- Reviewed DOCX import with OOXML provenance, source approval, and durable fragment snapshots
- Reviewed text-based PDF import with page anchors, source-page preview, and no OCR mixing
- Full traceability matrix (source clause → requirement → rule → evidence → finding → review) with gap filters, six separate coverage metrics, and CSV/XLSX export
- Finding evidence attachments (file, screenshot, model element, comment, link, technical note) with author, timestamp, and SHA-256 file hashes
- Review decisions with waiver reason/expiry and append-only superseded history
- Server-built audit ZIP (immutable snapshot + SHA-256 checksum manifest — not a digital signature)
- Production hardening: brute-force-throttled auth proxy, magic-byte upload guards, shared Redis rate limits with `Retry-After`, per-project validation job slots, soft delete + retention purge, account export, RLS test matrix, and redacted structured logging (see `SECURITY.md`)
- Background job system for large imports: step-based `validation_jobs` (queued → parsing → validating → persisting) with idempotent enqueue, safe-error-only retries, cancellation, timeouts, lease-based crash recovery, dead-letter marking, and temp payload cleanup; the UI shows per-phase progress that survives page refreshes

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

### Versioned specification packages

The requirements upload accepts the original JSON array for backwards compatibility and a traceable package with a specification name, revision, and up to 1,000 uniquely identified requirements:

```json
{
  "name": "AEC Building Specification",
  "revision": "C",
  "requirements": [
    {
      "id": "AEC-DOOR-0042",
      "title": "Office doors provide the specified clear width",
      "type": "minimum_door_width_for_room_type",
      "severity": "critical",
      "roomType": "office",
      "minDoorWidthM": 0.85,
      "source": {
        "document": "AEC Building Specification",
        "section": "4.2.1",
        "revision": "C"
      }
    }
  ]
}
```

Duplicate requirement IDs are rejected before validation. Source references remain attached to the requirement through server revalidation and persisted snapshots, and are shown in element findings, Markdown exports, and printable reports.

The workspace also accepts CSV specifications with one requirement per row. Required columns are `id`, `title`, `type`, and `severity`. Optional package columns are `specification_name` and `specification_revision`; traceability uses `source_document`, `source_section`, and `source_revision`. Rule-specific values use snake-case columns such as `room_type`, `min_area_sqm`, `max_area_sqm`, `min_door_width_m`, `max_door_width_m`, and `quantifier`. Composite rule conditions can be supplied as JSON in `conditions_json`. Package metadata must be consistent across rows, and the imported result passes the same schema and duplicate-ID validation as JSON uploads.

### Reviewed DOCX import

DOCX import does **not** convert Word to HTML. It reads OOXML (`word/document.xml`, numbering, styles/metadata) with ZIP and XML safety limits, preserves deterministic fragment anchors (including character offsets for splits), and keeps AI outside the source-of-truth path.

The split-pane review shows a **reconstructed document structure** beside editable requirement drafts. Users can merge/split (with undo/redo), approve sources, mark informational/excluded clauses, and confirm only when every included requirement has an approved source. Structural headings do not block confirmation.

On confirm, the immutable specification revision stores a durable `documentSource` snapshot: SHA-256 of the DOCX, sanitized filename, parser version, metadata, all fragments (`exactText`, anchors, heading path, numbering/table refs), Track Changes summary, unsupported-content notices, and requirement→fragment mappings. Session-only drafts without a project warn that refresh discards them—the same atomic persistence model as XLSX.

Track Changes: inserted text is included and flagged; deleted text is never treated as an active requirement; unresolved revisions and comments produce strong warnings. Unsupported content (text boxes, embeds, footnotes/endnotes, headers/footers, altChunk, drawings) is reported instead of silently dropped. Mandatory phrasing heuristics are language-aware (EN/DE, optional HR) and only boost candidacy.

Optional `/api/docx/suggest` validates per-fragment offset citations or returns non-authoritative heuristic drafts. Deterministic extract + human review works without AI.

### Reviewed PDF import (digital text)

PDF import is intentionally more conservative than DOCX. Version 1 extracts **digital text only** — not a fully automatic import. The product promise is:

> Extract candidate requirements from project documents, verify them, and preserve the source.

Each fragment carries a page number and bounding box. The review wizard shows a **source page preview** beside editable drafts. Tables are promoted only when column alignment is reliable; otherwise the layout is left as text with a warning. Scanned / empty / image-heavy pages are flagged and skipped — OCR is deferred and must never be mixed into a digital-text package (`extractionMode: "digital_text_only"`, `ocr.enabled: false`).

Confirmation requires an approved source and a PDF page reference for every included requirement. The persisted `documentSource` snapshot stores the SHA-256 hash, page summaries, fragments, and requirement→fragment map. Encrypted PDFs are rejected; files are capped at 20 MB / 200 pages with a parse timeout.

### Reviewed XLSX import and export

The `.xlsx` workflow lists visible and hidden sheets, detects a likely header row, proposes alias-aware column mappings with `high`, `medium`, `low`, or `unmapped` confidence, and requires explicit acceptance of every uncertain mapping. The paginated preview supports cell edits, row selection, batch edits for discipline/severity/unit, issue filters, and justified exclusion of any row. Excluded rows remain in the import summary. Textual clauses can be preserved as valid, informational, or requiring rule configuration without pretending they are executable deterministic rules.

Length values support `mm`, `cm`, and `m`; area values support `m²`. Every value also carries a quantity type so incompatible dimensions are rejected instead of silently converted. Decimal comma and decimal point are accepted. Formula cells are never executed: cached values are shown as potentially stale and require review, while formulas without cached results block confirmation.

XLSX processing is bounded to 10 MB compressed, 50 MB expanded, 500 ZIP entries, 20 sheets, 5,000 rows per sheet, and 100,000 populated cells, with an eight-second parser timeout and ZIP compression-ratio protection. MIME type and ZIP magic bytes are verified; `.xls`, `.xlsm`, macros, and external links are rejected. Hidden sheets are available for deliberate selection but are never auto-selected when a visible sheet exists.

Confirmation validates the complete package first. For an editable active project, one POST creates the immutable revision and only a successful `201` activates it in the workspace; `403`, `409`, or any other failure leaves the previous draft unchanged. Without an active project, confirmation creates a clearly marked session-only draft that is lost on refresh. Active packages can be exported to canonical XLSX and re-imported without losing requirement data.

Authenticated project participants can load saved specification revisions from the project library. Owners and editors can save the active package under a name and revision; viewers have read-only access. A `(project, name, revision)` identity is immutable and cannot be silently overwritten, while the server validates the complete package before persistence. This keeps reusable authoring inputs separate from the immutable requirement snapshot stored with every validation run.

Every requirement produces structured outcomes. Missing facts remain `unknown`; non-applicable requirements remain `not_applicable`; neither is silently converted into a pass or failure.

Compliance is deliberately split into separate metrics:

- **Pass rate:** passed requirements divided by decided, applicable requirements
- **Evaluation coverage:** decided requirements divided by all applicable requirements
- **Unknown:** applicable requirements that could not be decided from available evidence
- **Not applicable:** excluded from both pass rate and coverage
- **Critical failures:** failed requirements with critical severity

Metrics are aggregated per requirement, so a rule affecting many elements cannot outweigh another requirement simply by producing more result rows.

### Traceability matrix

The workspace renders a full traceability matrix over the chain **source clause → requirement → validation rule → model evidence → finding → review decision**, so any requirement can answer: where did it come from, how was it checked, on which model element, what was found, and who made the final decision.

- One row per requirement with its findings, affected element IDs (clickable, highlighting the element in the floor plan), and the review decision loaded from the opened validation report
- Source clauses resolved from the durable DOCX/PDF snapshot open inline with the exact text, anchor location (paragraph or PDF page), file name, and content hash
- Filters by source document, discipline, and severity, plus gap views: uncovered requirements (no results), requirements without an executable rule, unknown results, findings without a review decision, and waived findings
- Coverage tables grouped by specification document and by discipline
- CSV and XLSX export (metrics, matrix, and coverage sheets); export respects active filters

There is deliberately no single aggregated compliance number. The matrix reports six separate metrics, each with numerator and denominator:

- **Extraction coverage:** requirements with a recorded source (document/section or fragment IDs)
- **Rule coverage:** requirements with an executable deterministic rule
- **Evaluation coverage:** determined requirements among applicable ones
- **Pass rate:** compliant requirements among determined ones
- **Review completion:** requirements needing review (violation or unknown) that have a decision
- **Source traceability coverage:** requirements whose source fragments resolve inside the persisted document snapshot

Empty denominators report as "—", never as a fake 0% or 100%.

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

## Evidence-constrained AEC chat

AEC chat works without an API key by using a deterministic fallback. If a provider is enabled, it must return structured JSON with evidence citations. The server rejects malformed output, unknown requirement IDs, invented element IDs, and citations not supported by deterministic results, then falls back safely.

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

# Server-only machine API and webhook settings
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
WEBHOOK_ENCRYPTION_KEY=at-least-32-random-characters
WEBHOOK_DISPATCH_SECRET=another-random-secret
```

Provider priority is Gemini, then OpenAI, then deterministic fallback.

Apply all files in `supabase/migrations` in filename order before using persistence, including `202608040003_specification_library.sql`, `202608050002_baseline_and_release_policy.sql`, `202608060001_api_cli_ci.sql`, `202608070001_evidence_and_audit.sql`, `202608080001_security_hardening.sql`, and `202608090001_validation_jobs.sql`. After migrating, run the RLS test matrix (`supabase/tests/rls_test_matrix.sql`) as described in `SECURITY.md`. The project APIs accept a Supabase access token through `Authorization: Bearer <token>`. Validation snapshots are never accepted as client-authored results: the server validates the submitted model and requirements, reruns the deterministic engine, calculates metrics, and only then writes the snapshot. RLS and composite foreign keys enforce project access; `created_by` and `updated_by` preserve the acting user without changing the project owner identity.

The browser workspace supports email/password registration, sign-in, password recovery, automatic access-token refresh, comparison of two saved runs from the same project, baseline regression against a release policy, and an A4 print/PDF report for each saved run. The report contains project/run identity, pass rate, coverage, model inventory, requirement outcomes, affected elements, engine evidence, human-attached finding evidence, and persisted review decisions (`open`, `acknowledged`, `resolved`, or `waived`) with waiver reason/expiry, reviewer identity, and superseded decision history. It is rendered only after the ownership-protected snapshot endpoint returns the server-generated results. Comparisons are calculated from the stored requirement snapshots and server-generated results, and classify resolved, regressed, changed, unchanged, added, and removed requirements.

### Evidence and audit package

Each finding on a saved run can carry human-attached evidence: file or screenshot (≤5 MB, SHA-256 hashed), model element reference, comment, link, or technical note, plus author and timestamp. Review updates archive the previous decision into append-only history before writing the new current decision. Waived decisions require a waiver reason and may set an expiry.

`GET /api/projects/:projectId/validations/:validationId/audit-bundle` returns a server-built ZIP. Integrity is an **immutable snapshot** plus **SHA-256 checksums** and a **server-generated manifest** — the package is **not digitally signed**. Bundle contents:

| Path | Contents |
|---|---|
| `manifest.json` / `CHECKSUMS.sha256` | Package identity, file hashes, integrity note |
| `project.json` | Project manifest (baseline + release policy) |
| `specification.json` | Spec name/revision + requirements |
| `validation-configuration.json` | Run config and metrics |
| `model-fingerprint.json` | Model inventory + content hashes |
| `findings.json` | Deterministic engine findings |
| `evidence/` | Attachment index + binary files |
| `reviews/` | Current decisions + superseded history |
| `traceability/` | Matrix CSV/XLSX |
| `results/` | JSON + XLSX results |
| `report/report.pdf` | PDF audit report |
| `audit-log.json` | Chronological validation/review/evidence events |

### Baseline and regression validation

Each project can mark exactly one saved validation run as its **baseline**. Any later candidate run can be compared to that baseline through `GET /api/projects/:projectId/regression?candidateId=…` or the workspace **Compare to baseline** action. The report is computed only from stored snapshots, candidate reviews, and the project's release policy — never from an AI model. Identical inputs always produce the same gate status.

Finding deltas (stable key = requirement + rule + sorted affected element IDs):

- **new** — present only on the candidate
- **resolved** — problem on the baseline, gone or non-problem on the candidate
- **reopened** — non-problem on the baseline, fail on the candidate
- **changed** — same identity with a different status, severity, or summary

The report also surfaces added/removed/changed requirements, specification package deltas, and model inventory deltas (rooms, doors, levels).

Per-project **release policy** (owner-editable) evaluates to `pass`, `warn`, or `block`:

| Policy rule | Default | Effect |
|---|---|---|
| Block on new critical finding | on | Blocks when a critical fail is new or reopened vs baseline |
| Block on decreased coverage | on | Blocks when evaluation coverage drops |
| Warn on new unknown results | on | Warns (does not block) on new unknown findings |
| Allow waived critical findings | off | When off, waived critical fails still block |
| Max high (critical) findings | unlimited | Blocks when candidate critical fails exceed the cap |
| Max medium (warning) findings | unlimited | Blocks when candidate warning fails exceed the cap |

Add the application's production origin and local development origin to the Supabase Auth redirect URL allowlist so recovery links can return to the workspace. Whether a newly registered account receives an immediate session or must confirm its email follows the Supabase project's Auth settings.

## Background jobs for large imports

Large IFC or model JSON imports never live inside one serverless request. `POST /api/projects/:projectId/jobs` (multipart `file` + `specificationId`, optional `Idempotency-Key` header) stores the upload in a `validation_jobs` row and returns immediately. Short worker ticks then advance the job one phase at a time — parsing → validating → persisting — and each phase records progress, so a crashed or restarted worker resumes from the database, never from memory.

- **Statuses**: `queued`, `processing`, `completed`, `failed`, `cancelled`; dead-lettered jobs are `failed` with `dead_lettered_at` set.
- **Retries**: only safe errors (429/5xx persistence failures, network interruptions, expired worker leases) are retried with exponential backoff up to `max_attempts`. Deterministic input problems (invalid IFC/JSON, parser timeout) fail immediately with an understandable message.
- **Idempotency**: repeated enqueues with the same `Idempotency-Key` replay the existing job; the persist phase reuses job-scoped idempotency keys so retries never duplicate model assets or validation runs.
- **Cancellation**: `POST /api/projects/:projectId/jobs/:jobId` with `{"action":"cancel"}` cancels a queued job instantly and flags a processing job to stop before its next phase; `{"action":"retry"}` re-queues a failed job.
- **Timeouts**: each job has a wall-clock budget (`timeout_seconds`) plus a 90-second claim lease, so a crashed worker can never wedge a job.
- **Cleanup**: the uploaded payload is deleted as soon as parsing succeeds; terminal jobs are stripped of any remaining blobs by the janitor after 24 hours.

Worker ticks come from two sources: polling `GET /api/projects/:projectId/jobs/:jobId` drives one step whenever the job is due (so interactive use needs no scheduler and progress survives page refreshes), and `POST /api/internal/jobs/run` (bearer `JOB_RUNNER_SECRET`, e.g. from a one-minute cron) keeps jobs progressing when nobody is watching.

## Pipeline API, CLI, and CI

Apply `202608060001_api_cli_ci.sql` after the earlier migrations. Machine API routes also require server-only `SUPABASE_SERVICE_ROLE_KEY`; durable webhook delivery requires `WEBHOOK_ENCRYPTION_KEY` and `WEBHOOK_DISPATCH_SECRET`. None of these values may use a `NEXT_PUBLIC_` prefix.

### Project API tokens

Project owners create tokens with their normal Supabase session:

```bash
curl -X POST "$AEC_API_URL/api/projects/$AEC_PROJECT_ID/tokens" \
  -H "Authorization: Bearer $SUPABASE_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"GitHub Actions","scopes":["models:write","specifications:write","runs:write","runs:read","regressions:read"],"expiresAt":"2027-01-01T00:00:00.000Z"}'
```

The `aec_…` token is returned once. Only its SHA-256 hash is stored. `GET` lists token prefixes, scopes, expiry, revocation, and last use; `DELETE ?tokenId=…` revokes immediately. Tokens are restricted to one project and can receive:

- `models:read`, `models:write`
- `specifications:read`, `specifications:write`
- `runs:read`, `runs:write`
- `regressions:read`

Owner operations such as changing the baseline, release policy, token lifecycle, and webhook registration still require a user session.

### Versioned API

All machine endpoints live under `/api/v1/projects/:projectId`. Mutating calls require a URL-safe `Idempotency-Key` header. Repeating the same key and input returns the original resource; reusing a key with different input returns `409`.

```bash
# 1. Upload and normalize IFC (normalized JSON is also accepted)
curl -X POST "$AEC_API_URL/api/v1/projects/$AEC_PROJECT_ID/models" \
  -H "Authorization: Bearer $AEC_API_TOKEN" \
  -H "Idempotency-Key: model-$GIT_COMMIT" \
  -F "file=@building.ifc"

# 2. Upload canonical JSON, CSV, or XLSX specification
curl -X POST "$AEC_API_URL/api/v1/projects/$AEC_PROJECT_ID/specifications" \
  -H "Authorization: Bearer $AEC_API_TOKEN" \
  -H "Idempotency-Key: spec-$GIT_COMMIT" \
  -F "file=@project-requirements.xlsx"

# 3. Run server-authoritative deterministic validation
curl -X POST "$AEC_API_URL/api/v1/projects/$AEC_PROJECT_ID/validation-runs" \
  -H "Authorization: Bearer $AEC_API_TOKEN" \
  -H "Idempotency-Key: run-$GIT_COMMIT" \
  -H "Content-Type: application/json" \
  -d '{"modelId":"MODEL_UUID","specificationId":"SPEC_UUID"}'

# 4. Retrieve or compare
curl -H "Authorization: Bearer $AEC_API_TOKEN" \
  "$AEC_API_URL/api/v1/projects/$AEC_PROJECT_ID/validation-runs/RUN_UUID"
curl -H "Authorization: Bearer $AEC_API_TOKEN" \
  "$AEC_API_URL/api/v1/projects/$AEC_PROJECT_ID/validation-runs/RUN_UUID/comparison?baseline=main"
```

Run retrieval supports `?format=csv` and `?format=sarif`. The API is synchronous in v1: a successful run response means validation results and the webhook outbox event have been committed.

Canonical XLSX automation is intentionally strict. A visible worksheet must have high-confidence canonical mappings for `id`, `title`, `type`, and `severity`; any uncertain mapping must be reviewed in the browser import wizard instead of being guessed by CI.

### CLI

The Node 22 CLI is API-first and has no runtime package dependencies:

```bash
export AEC_API_URL=https://validator.example.com
export AEC_API_TOKEN=aec_...
export AEC_PROJECT_ID=...

npm run aec-validator -- validate \
  --model building.ifc \
  --spec project-requirements.xlsx \
  --baseline main \
  --fail-on critical \
  --json aec-report.json \
  --csv aec-report.csv \
  --sarif aec-report.sarif
```

Primary output uses `--format human|json|csv|sarif` and optional `--output PATH`. Additional JSON, CSV, and SARIF artifacts can be emitted in the same run.

- Exit `0`: validation/release policy accepted (warnings do not fail CI)
- Exit `1`: `--fail-on` threshold or deterministic regression gate blocked
- Exit `2`: CLI usage, configuration, or invalid input
- Exit `3`: authentication, network, or server failure

AI explanations never influence process exit codes.

### Durable webhooks

Owners register HTTPS webhook receivers at `POST /api/projects/:projectId/webhooks`. The signing secret is returned once and encrypted at rest; private-network, localhost, credential-bearing, HTTP, and custom-port targets are rejected.

Each committed run enqueues `validation.completed`. Delivery includes `X-AEC-Event`, `X-AEC-Event-Id`, and:

```text
X-AEC-Signature: sha256=HMAC_SHA256(exact_request_body, webhook_secret)
```

Receivers should verify the signature over the exact body and deduplicate by event ID. Failed attempts remain in `webhook_deliveries` with exponential retries (up to eight attempts). Run a provider-neutral scheduler against:

```bash
curl -X POST "$AEC_API_URL/api/internal/webhooks/dispatch?limit=20" \
  -H "Authorization: Bearer $WEBHOOK_DISPATCH_SECRET"
```

Owners inspect the latest delivery log at `GET /api/projects/:projectId/webhooks/deliveries`.

Ready-to-copy GitHub Actions, GitLab CI, and generic Docker examples are in [`examples/ci`](examples/ci). The GitHub example preserves JSON/CSV/SARIF artifacts and publishes SARIF to code scanning before enforcing the merge gate.

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

The browser E2E suite expects the pinned `@playwright/test` development dependency and Chromium:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

The E2E test uploads a real IFC fixture, checks parser diagnostics and compliance metrics, downloads the Markdown report, and verifies its evidence content.

## C# extractor boundary

`csharp-extractor-prototype` demonstrates where a future Revit API or AutoCAD .NET integration can map Autodesk model facts into the normalized contract. It is a console prototype, not a production Autodesk plugin.

If the .NET SDK is installed:

```bash
dotnet run --project csharp-extractor-prototype/Aec.SpecExtractor.csproj
```

See [`csharp-extractor-prototype/README.md`](csharp-extractor-prototype/README.md) for details.

## Known limitations

- This is a functional prototype, not a certified compliance product.
- There is no production Revit or AutoCAD add-in yet.
- The IFC parser extracts a targeted semantic subset; it is not a full geometry engine.
- Room-type inference is heuristic and intentionally leaves uncertain classifications unknown.
- Composite rules currently target one room type and support room-area and connected-door-width conditions only; arbitrary nesting, cross-room aggregation, and additional BIM element types are not yet supported.
- Rate limiting is in-memory and therefore instance-local; production deployment should use a shared store.
- Browser email/password registration, sign-in, recovery, token refresh, project creation, validation history, save/open controls, reusable specification revisions, run comparison, baseline regression gates, printable reports, finding reviews, and viewer/editor team invitations are implemented. OAuth/SSO and multi-factor authentication are not yet implemented.
- Persisted snapshots currently store normalized facts, requirements, evidence, and metrics; raw IFC object storage and model-version diffs are not yet implemented.
- External AI availability and output quality remain provider-dependent; invalid responses fall back to deterministic explanations.

## Validation philosophy

- Never treat an LLM response as a validation result.
- Never guess missing BIM facts.
- Keep `unknown` distinct from `fail`.
- Keep coverage distinct from pass rate.
- Preserve evidence and affected element IDs for every conclusion.
- Prefer a deterministic fallback over an unsupported explanation.
