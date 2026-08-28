# mockservers v1 — SDD progress

Plan: docs/plans/2026-08-28-mockservers-v1.md
Branch: main (bootstrap — plan Global Constraints allow Tasks 1-12 on main)
Base before Task 1: e9c0711

## Environment note for implementers
- Local default Node is v18 (below the >=20 floor). Use Node 22: `nvm use 22` (or `export PATH` to a v22). Task 1 built green on v22.23.2.

## Ledger
Task 1: complete (commits e9c0711..2af2cda, review clean — ✅ spec, Approved quality)

## Minor findings (for final whole-branch review to triage)
- T1: `.superpowers/sdd/progress.md` got bundled into the scaffold commit (cosmetic).
- T1: `vitest.config.ts` `include` is `src/**/*.test.ts` + `app/**/*.test.ts` — no `.tsx`. Fine for the planned tests (all `.test.ts`); widen if a `.test.tsx` is ever added.
- T1: eslint/vitest don't ignore `out/` or `.vercel/` (negligible; add if `next export` is ever used).
Task 2: complete (commits 2af2cda..96841e8, review clean — ✅ spec, Approved quality)
  Minor (for final review): catchall `**` placement not enforced by matcher (compileSegments accepts non-terminal `**`, matcher silently never matches it) — Task 6 schema should reject `**` that isn't last. Coverage gaps: param+catchall combo, empty path.
Task 3: complete (commits 96841e8..d42c33b, review clean — ✅ spec, Approved quality)
  Minor (for final review): (a) `notEquals`/`contains`/`regex` against an absent target return false (fail-closed) — pair with `exists:false` to assert absence; note in mock-format docs (Task 12). (b) coverage gaps: asString JSON.stringify branch, contains/regex on header/query, allMatch with [], resolveJsonPath null body.
Task 4: complete (commits d42c33b..e180813, review clean — ✅ spec, Approved quality; security surface verified line-by-line, NO arbitrary-execution bypass)
  Minor (RECOMMEND final review promote 1+2 to a fix): (1) IDENT allows `request.body.__proto__|constructor|prototype` through parseTemplate — not exploitable (resolveJsonPath function-guard blocks chaining) but `{{request.body.constructor}}` emits literal "undefined". Fix: reject those 3 names in body pattern OR add `if (typeof value === "function") return ""` in evalToken. (2) renderDeep writes computed key `__proto__` — use `Object.create(null)` for `out`. (3) renderDeep recursion unguarded (author-controlled, note only). (4) randomInt no lo<=hi check (brief-verbatim).
Task 5: complete (commits e180813..e15616f, review clean — ✅ spec, Approved quality; full engine suite 27/27)
  Minor (for final review): (a) no test for header auto-content-type vs response.headers override merge — add one. (b) trailing-slash basePath (`/api/`) not stripped — decide in loader/schema. (c) basePath exact-match->`/`, warnings accumulation, notFound delayMs — untested.
Task 6: complete (commits e15616f..ddc0159, review clean — ✅ spec, Approved quality; schema enforces every MUST for Task 7's fail-on-bad-config)
  Minor (for final review): (a) `k as never` cast in extra-key check — use `(TARGET_KEYS as readonly string[]).includes(k)`. (b) `regex` value not type-checked before String() coercion (regex:123 -> "123" passes). (c) coverage gaps: invalid-regex-string, exists-non-boolean, unknown-key-in-match-item, two-targets, request/response strict — schema DOES enforce all (verified by reading), add regression tests.
Task 7: complete (commits ddc0159..43d89f1, review clean — ✅ spec, Approved quality; 39 tests; CORE GUARANTEE verified: CLI exit 1 before write, no artifact on error)
  Minor (for final review): (a) duplicate-slug ERROR class is dead code — `slug === dirName` enforced first + dir names unique => can never fire. Harmless (drop the check or keep as belt-and-braces). (b) rule-file readFileSync unguarded — unreadable file throws stack trace instead of clean ERROR (build still fails). (c) all project.yaml read failures labeled "missing". (d) zod error surfaced as full JSON issues blob. (e) stale mocks.generated.json left on disk on error (build fails anyway). (f) coverage: missing-project.yaml, zod-parse-fail, parseTemplate-in-header untested (brief specified only 5 tests).
Task 8: complete (commits 43d89f1..37ac6d7, review clean — ✅ spec, Approved quality; 42 tests; async propagation clean, merge order pinned by exact-array assert, invalid-spec -> recorded error not crash)
  Minor (for final review): (a) openApiDoc keeps only last openapi/*.yaml's doc (multi-file: routes all kept, doc last-wins) — doc "one spec file per project" or collect array. (b) no test for invalid-OpenAPI-spec -> recorded error (holds by reading). (c) dynamic await import inside loop could be static top-level. (d) outer catch{} over-broad (wrap just readdirSync). (e) `example: null` treated as has-example (no warning). (f) warning text superset of spec ("— response body is empty").
Task 9: complete (commits 37ac6d7..4e185cf, review clean — ✅ spec, Approved quality; 49 tests; npm run build passes with ƒ /m/[...slug]; no PII/body in log line; no request-time fs I/O)
  Minor (for final review): (a) log `warns` key absent when 0 (`|| undefined`) — inconsistent schema, use `warns: result.warnings.length`. (b) unknown-project 404 has no CORS headers (unavoidable — no resolved project). (c) parseRequest reads body on cors=false OPTIONS (harmless).
Task 10: complete (commits 4e185cf..b667955, review clean — ✅ spec, Approved quality; 51 tests; build passes; 3 endpoints reachable & verified live)
  DEVIATION (sound, Next.js 15 forced): `app/__mock/` unroutable (private folder) -> renamed `app/%5F%5Fmock/` (documented %5F opt-out); `__spec` folded into catch-all `app/m/[...slug]/route.ts` (after !project guard, before parseRequest); `app/m/[slug]/` deleted. `/__`-prefixed route paths already build-rejected so no collision.
  Minor (for final review): (a) `%5F%5Fmock` folder name fragility — a rename silently drops both endpoints (Next doesn't error). ADD "do not rename" note (Task 12 README covers). (b) `__spec` responds to all HTTP methods, should be GET-only. (c) `__spec` + `/__mock/*` carry no CORS headers (local introspection, fine).
Task 11: complete (commits b667955..04943a5, review clean — ✅ spec, Approved quality; 63 tests, 12 scenario cases; FIDELITY VERIFIED — every JS lookup-table entry mapped to a rule w/ correct status+body incl. 404/500/409; OpenAPI verbatim copy; route ordering correct)
  Minor (for final review): (a) scenario matrix skips the PRIMARY confirm path (status:BLOCKED) — only tests stale edge case. Add it. (b) thin coverage — no test for CHALLENGE_MISMATCH, 500s, notify-queued QUEUED. (c) card.yaml dense flow-mapping vs customer.yaml block style — pick one. (d) test repetitive not it.each. (e) report row-count numbers sloppy (files fine). NOTE: api-docs "one channel only" notify case not in JS source, correctly absent.
Task 12: complete (final bootstrap task — vercel.json, scripts/check.mjs, scripts/new-project.mjs, README.md, docs/mock-format.md; one-line do-not-rename comment in app/%5F%5Fmock/health/route.ts). npm run check green (compile/typecheck/lint/test, 63 tests); tsc --noEmit clean; npm run build passes; dev smoke verified (BLOCK_CARD -> {"status":"BLOCKED",...}, /__mock/health -> projectCount:1); new-project scaffold compiles + refuses existing dir + rejects bad slug. Documented gotchas: Node >=20 (local v18 too old, nvm use 22); do-not-rename app/%5F%5Fmock/; /m/<slug>/__spec folded into catch-all. Push deferred to controller.
Task 12: complete (commit 04943a5..c7a1fd7, review clean — ✅ spec, Approved quality; npm run check all 4 green 63/63; gate script fails correctly on any step; new-project output schema-valid; docs cross-verified against engine code)
  Minor (for final review): (a) README "Live" section unhedged (domain not wired yet — post-plan). (b) mock-format.md match-operator table narrower than engine (header/query actually support notEquals/contains too) — pre-existing spec-vs-code gap. (c) scripts/*.mjs not linted/typechecked (defer to harness spec).

## ALL 12 TASKS COMPLETE. Ready for final whole-branch review + push. 63 tests, npm run check green, npm run build passes.

## FINAL WHOLE-BRANCH REVIEW (opus): "Merge after one fix"
- 3 security invariants VERIFIED by code reading. 2 critical E2E paths trace clean. 63/63. Build gate precedes artifact write on every path. All commits correct personal identity.
- IMPORTANT (must fix before merge): OpenAPI-generated routes unreachable when basePath set. `expand.ts` emits raw OpenAPI paths; `resolve.ts` strips basePath before matching => segments must be basePath-relative. card-block-lost project.yaml has basePath:/commands but openapi paths are /commands/... => 5 of 35 compiled routes DEAD. Fix: strip basePath when appending expanded routes in compile.ts + WARN when a generated route path doesn't start with basePath. Fold in finding-12 confirm-blocked scenario test.
- All 13 accumulated Minors => POST-MERGE follow-up PR (~1 afternoon). None block.
- New Minors: bundle.commit reads "dev" in prod (Vercel has no .git) -> use VERCEL_GIT_COMMIT_SHA; no duplicate rule-id detection; schema/engine HttpMethod drift (OPTIONS); postinstall ||true masks compile errors as module-not-found; OPTIONS+cors:false falls to 404.
