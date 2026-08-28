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
