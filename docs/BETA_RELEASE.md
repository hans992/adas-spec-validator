# Beta release checklist (PR #23)

Use this gate before tagging a beta. Commands assume the repository root.

## Technical QA

| Check | Command / location | Pass criteria |
|---|---|---|
| Unit + API tests | `npm test` | All Vitest suites green |
| Production build | `npm run build` | Next.js build + TypeScript succeed |
| Dependency audit | `npm run audit:deps` | No high/critical advisories |
| Performance / upload smoke (unit) | `npm test -- src/qa/betaPerformance.test.ts` | IFC parse &lt; 5s; disguised upload rejected |
| Chromium E2E | `npm run test:e2e -- --project=chromium` | Beta core + existing IFC/XLSX flows |
| Firefox / WebKit smoke | `npm run test:e2e:smoke` | `@smoke` tests green |
| Mobile responsive | included in `test:e2e:smoke` (`mobile-chrome`) | Menu + upload reachable |
| Accessibility | Chromium + smoke axe scans | No critical (workspace) / serious (marketing) violations |
| Upload/load E2E | `e2e/upload-load-smoke.spec.cjs` | Chromium UI IFC &lt; 30s; API ZIP-as-IFC → 415/429; burst may trip `Retry-After` |
| RLS matrix | `npm run test:rls` (requires `SUPABASE_DB_URL`) | Prints `RLS MATRIX PASSED` |

### Authenticated E2E (staging)

```bash
E2E_AUTH=1 E2E_USER_EMAIL=... E2E_USER_PASSWORD=... npm run test:e2e -- --project=chromium e2e/beta-authenticated-flow.spec.cjs
```

Covers: sign-in/sign-up → demo or create project → XLSX mapping → IFC → validation → report/audit → baseline/regression → traceability → delete.

## Documentation published

- `/docs` hub, user guide, API/CLI, formats, limitations, AI transparency, retention, subprocessors
- `/legal/privacy`, `/legal/terms`
- `/security` (renders `SECURITY.md`)
- Marketing footer links Privacy, Terms, Security, Docs
- Incident contact placeholder: `security@example.com` (replace before production)

## Manual beta sign-off

- [ ] Replace example incident / legal emails
- [ ] Confirm EU region for Supabase, Vercel (`fra1`), Upstash
- [ ] Run RLS matrix against staging after migrate
- [ ] Run authenticated E2E against staging with `E2E_AUTH=1`
- [ ] Spot-check Audit ZIP checksums and soft-delete restore
- [ ] Tag release `v0.1.0-beta.1` when the table above is green
