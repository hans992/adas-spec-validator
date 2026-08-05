# Security & Operations

This document describes the production security posture of AEC Spec Validator: what is enforced in code, what is enforced in the database, and what is an operational procedure. It is the reference for the "prototype → product" boundary.

## Authentication and authorization

### Session model

- Browser sessions use Supabase Auth JWTs (access + refresh token in `localStorage`), refreshed automatically 60 s before expiry with a one-shot forced refresh on 401.
- **Sign-in and sign-up go through server proxies** (`/api/auth/sign-in`, `/api/auth/sign-up`) which apply shared brute-force throttling **before** the request reaches Supabase Auth:
  - per client IP and per target account (SHA-256 of the email, never the raw address),
  - 10 attempts per 15 minutes per key, `Retry-After` on 429,
  - uniform `401 Email or password is incorrect.` so responses never reveal whether an account exists.
- Password recovery and token refresh call Supabase directly; both require possession of a high-entropy token.

### MFA readiness

Supabase Auth natively supports TOTP factors (`/auth/v1/factors`). MFA is **not** enabled yet. Preparation checklist when enabling:

1. Enable MFA enrollment in the Supabase dashboard (Auth → MFA).
2. Extend the sign-in proxy to forward the `AAL2` challenge/verify flow.
3. Require `aal2` claims for owner-only operations (token minting, project deletion, webhook management) by checking `auth.jwt()->>'aal'` in the relevant RLS policies.

### Roles and RLS

Access control is enforced in PostgreSQL row-level security, not in application code:

- `owner` — full control: settings, baseline, members, tokens, webhooks, deletion, audit trail.
- `editor` — read everything in the project, create runs/reviews/evidence/specifications.
- `viewer` — read-only.
- Outsiders (authenticated non-members) and `anon` see **zero rows**, even when they guess valid UUIDs.

`public.can_view_project` / `public.can_edit_project` are the single authorization source for all child tables and **exclude soft-deleted projects**.

**RLS test matrix:** `supabase/tests/rls_test_matrix.sql` seeds owner/editor/viewer/outsider personas and asserts the full matrix (visibility, write denial, guessed-ID probes, soft-delete blackout, anon lockout). Run it after every migration change:

```bash
supabase db reset
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test_matrix.sql
```

The script rolls back its fixtures and must print `RLS MATRIX PASSED`.

### Invitations and machine tokens

- Invitations expire after 7 days (`expires_at`), are single-project, role-scoped, and accepted through a `security definer` RPC that revalidates recipient email, pending status, and expiry.
- Machine API tokens (`aec_…`) are stored as SHA-256 hashes with scoped permissions (`models:read/write`, `specifications:read/write`, `runs:read/write`, `regressions:read`), optional expiry, and owner-only management.

## Upload security

All file-accepting endpoints route through `src/security/uploadGuards.ts`:

| Control | Implementation |
|---|---|
| Allowed MIME types | Per-kind allowlist; a declared MIME that mismatches is rejected with 415 |
| Magic bytes | Container detection (ZIP `PK`, `%PDF-`, `ISO-10303-21`, JSON, NUL-free text) must match the claimed format |
| Max sizes | IFC 20 MB, DOCX 15 MB, XLSX/CSV 10 MB, PDF 20 MB, model JSON 5 MB — checked from `file.size` before buffering and again on bytes |
| ZIP bomb protection | DOCX/XLSX central-directory inspection: entry caps, uncompressed-size caps, compression-ratio 100 cap, macro/external-link rejection (`specificationDocx.ts`, `specificationXlsx.ts`) |
| Parser timeouts | `withParserTimeout` wall-clock budget (IFC 30 s; DOCX 10 s, XLSX 8 s, PDF 15 s inside their parsers) converts pathological inputs into clean 422s |
| Filename sanitization | Path components, control characters, and shell metacharacters stripped; length capped; sanitized name is what gets persisted |

### Malware scanning strategy

Documents are parsed, normalized, and only derived data is served back — original binaries are never re-served to other users, which removes the classic stored-malware distribution path. When raw-file retention lands in object storage the pipeline is:

1. Upload into a **private quarantine bucket** (no public URLs, short-lived signed URLs only).
2. Asynchronous scan (ClamAV container or a scanning API) before the object is marked available.
3. Objects failing the scan are deleted and the event is recorded in `audit_events`.

### Private object storage

Evidence attachments are currently stored as size-capped (5 MB), SHA-256-hashed base64 inside RLS-protected rows — there is no publicly addressable storage. Any future move to Supabase Storage must use private buckets with RLS storage policies mirroring `can_view_project`.

## Rate limiting

`src/security/rateLimit.ts` provides shared fixed-window limits backed by **Upstash Redis** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`); every instance sees the same counters. Without Redis (local dev, CI) an in-memory fallback keeps identical semantics per process. Redis outages **fail open** and emit `rate_limit.redis_unavailable` so availability is never held hostage by the limiter.

| Scope | Limit | Keys |
|---|---|---|
| `auth` | 10 / 15 min | client IP **and** hashed target account |
| `chat` | 20 / min | client IP |
| `upload` | 12 / min | client IP (public) or project (machine API) |
| `validation` | 6 / min | project |

All 429 responses carry `Retry-After`. Expensive validation runs are additionally serialized by a **per-project job slot** (`acquireJobSlot`, TTL 120 s) so parallel requests cannot stack CPU-heavy work; concurrent attempts get 429 + `Retry-After` instead of queuing.

## Data lifecycle

| Concern | Behavior |
|---|---|
| Raw document retention | Original DOCX/XLSX/PDF binaries are parsed in the browser and **not persisted**; only approved fragments/anchors (provenance snapshots) are stored. IFC uploads persist the normalized model + content hash, not raw STEP, except as `project_model_assets` metadata |
| Generated artifacts | Validation snapshots, reviews, evidence, and audit history live inside the project tree and follow project deletion |
| Soft delete | `DELETE /api/projects/:id` sets `deleted_at`; members lose access instantly (RLS), owner keeps restore visibility |
| Restore | `DELETE /api/projects/:id?action=restore` (owner only) |
| Permanent deletion | `DELETE /api/projects/:id?action=permanent` (owner) or scheduled `select public.purge_soft_deleted_projects(30)` with the service role; children cascade via foreign keys |
| Account export | `GET /api/account/export` returns all owned data as JSON under the caller's own JWT (RLS-bounded); binaries referenced by SHA-256 |

### Backup and restore

- **Backups:** Supabase provides daily automated backups (PITR on paid tiers). Additionally schedule logical dumps: `supabase db dump -f backup.sql` (or `pg_dump --no-owner --format=custom`).
- **Restore test (run quarterly, and after every destructive migration):**
  1. Create a scratch Supabase project in the same region.
  2. Restore the latest dump: `psql "$SCRATCH_DB_URL" -f backup.sql`.
  3. Run `supabase/tests/rls_test_matrix.sql` against the scratch database — it must print `RLS MATRIX PASSED`.
  4. Spot-check row counts of `projects`, `validation_runs`, `finding_evidence` against production.
  5. Download one audit bundle through the app pointed at the scratch database and verify `CHECKSUMS.sha256`.
  A backup that has not passed this procedure is treated as nonexistent.

### Region and subprocessors

- **EU region:** provision the Supabase project in an EU region (e.g. `eu-central-1`) and pin Vercel functions to `fra1`. Upstash Redis must also be EU-hosted.
- **Subprocessor list** (publish to customers; update on change):

| Subprocessor | Purpose | Data | Region |
|---|---|---|---|
| Supabase | Database, auth, RLS | Account data, project data, documents-derived data | EU |
| Vercel | Hosting, serverless compute | Request payloads in transit, logs (redacted) | EU (fra1) |
| Upstash | Shared rate limiting | Hashed rate-limit keys only, TTL ≤ 15 min | EU |
| Google (optional) | AI explanations | Server-verified findings only, never raw documents | Per Google config |
| OpenAI (optional) | AI explanations | Server-verified findings only, never raw documents | Per OpenAI config |

AI providers are optional; the deterministic fallback requires no third party.

## Observability

`src/observability/logger.ts` emits single-line JSON events with automatic redaction: keys matching tokens/passwords/authorization/emails/document-content patterns are replaced with `[redacted]` **before** serialization, long strings are truncated, huge arrays summarized. Secrets and customer documents cannot reach the logs by construction.

- **Request IDs**: generated per request, echoed as `X-Request-Id`, attached to every event; machine API responses already carry `requestId`.
- **Metrics** (as `metric.*` events): `ifc_import_duration_ms`, `model_import_duration_ms`, `validation_duration_ms`, `parser_failure`, `upload_rejected`, `chat_answer` (with `mode: ai|fallback` for AI-fallback ratio).
- **Audit events** (`audit.*` log lines + durable `audit_events` rows via service role): sign-in/sign-up outcomes (hashed account IDs), project soft/permanent deletion, restore, account export. Rows contain identifiers and outcomes only — never content, credentials, or raw emails. Project owners can read their project's audit trail through RLS.
- **Error monitoring**: `request.failed` events include route, request ID, duration, and message. Point the platform log drain at your error tracker; no additional SDK is required.

## Acceptance criteria mapping

| Criterion | Where verified |
|---|---|
| All RLS negative tests pass | `supabase/tests/rls_test_matrix.sql` |
| Foreign project unreachable even by guessed ID | Matrix (`outsider cannot fetch … by guessed ID`) + API tests returning 404 on RLS-empty reads |
| Upload attacks have tests | `src/security/uploadGuards.test.ts`, `app/api/ifc/route.test.ts` (renamed binary, ZIP-as-IFC, flood → 429), existing DOCX/XLSX bomb tests |
| Backup restorable | Restore-test runbook above; matrix doubles as post-restore verification |
| No secrets or documents in logs | Redaction-by-key in `logger.ts` + `logger.test.ts`; audit rows store hashes/IDs only |
