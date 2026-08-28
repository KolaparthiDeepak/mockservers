---
title: mockservers — hosted, file-defined mock API server
status: approved
created: 2026-08-28
owner: Deepak Kolaparthi (github.com/KolaparthiDeepak)
repo: https://github.com/KolaparthiDeepak/mockservers
---

# mockservers

## 1. Context

Ad-hoc HTTP mocks are written repeatedly as throwaway Node scripts (see the
`card-block-lost-mock-server.js` reference: a `http.createServer` that reads the request
body and returns a deterministic response from lookup tables). Each one is re-implemented,
runs only on `localhost`, and is not shareable.

`mockservers` is a single hosted service that serves configurable mock HTTP endpoints from
definitions kept as files in this repository. It is deployed to Vercel and reachable at
`https://mockservers.dailyuze.com`.

**Primary user:** the repo owner, for now. The design keeps a project boundary
(`mocks/<slug>/`) and stateless request handling so a future multi-tenant / hosted-for-others
mode is an addition, not a rewrite. Multi-tenancy, auth, and per-user quotas are **out of scope
for v1** and get their own spec later.

## 2. Goals / Non-goals

### Goals

- Serve mock HTTP responses for many independent **projects** from one deployment.
- A project's endpoints are defined by **files in the repo** — declarative match rules and/or
  an imported OpenAPI 3 spec. Changing a mock is an edit + PR + merge; production picks it up on
  the next deploy (~40s).
- Deterministic response selection driven by the request (method, path, headers, query, JSON
  body) — enough to steer a real downstream workflow through any branch by choosing input
  values, which is the `card-block-lost` use case.
- Small, safe response templating (`{{request.body.x}}`, `{{uuid}}`, `{{now}}`).
- Invalid mock configuration **fails the build** — a broken mock never reaches production.
- Free to run: Vercel Hobby, no database, no paid add-ons.

### Non-goals (v1)

- No browser-based mock editing, no runtime persistence (no DB / KV).
- No arbitrary user JavaScript execution.
- No stateful mocks (call-count sequences, "3rd call returns 500", per-session state).
- No auth — serving mocks and viewing config are both public.
- No wildcard subdomains (`*.mockservers.dailyuze.com`).
- No schema-based fake-data generation for OpenAPI operations lacking examples.
- No `.claude/` agent harness or CI in this spec — deferred, separate spec.

## 3. Architecture

One Next.js (App Router, TypeScript) application deployed to Vercel. Two responsibilities:

| Responsibility | Route(s) | Notes |
| --- | --- | --- |
| **Mock serving** | `app/m/[...slug]/route.ts` — catch-all, all HTTP methods | The product. Thin adapter over `src/engine`. |
| **Viewer** | `app/(viewer)/page.tsx` | Read-only. Lists projects + routes from the compiled bundle. No auth, no editing. |
| **Introspection** | `app/__mock/health`, `app/__mock/projects`, `app/m/[slug]/__spec` | Build info, project list, merged OpenAPI per project. |

```
mockservers/
  app/
    m/[...slug]/route.ts          # mock request handler (adapter)
    (viewer)/page.tsx             # read-only project/route browser
    __mock/health/route.ts
    __mock/projects/route.ts
  src/
    engine/
      resolve.ts                  # (request, projectConfig) -> response   [pure, unit-tested]
      match.ts                    # method/path/header/query/jsonPath matching
      template.ts                 # safe {{...}} interpolation
      types.ts
    compile/
      compile.ts                  # mocks/ -> mocks.generated.json   (build step)
      schema.ts                   # Zod schemas for project.yaml / routes/*.yaml
    openapi/
      expand.ts                   # OpenAPI 3 doc -> Route[]
  mocks/
    <project-slug>/
      project.yaml
      routes/*.yaml
      openapi/*.yaml              # optional
  mocks.generated.json            # build artifact — git-ignored
  scripts/
    new-project.mjs               # scaffold a mocks/<slug>/ skeleton
    check.mjs                     # local gate: compile + tsc + lint + test
  docs/
  README.md
  vercel.json
```

**Key property:** the mock request path does no I/O. At build time `mocks/` is compiled to a
single `mocks.generated.json` bundled into the deployment; at runtime the handler loads that
object once into module scope and every request is an in-memory lookup + linear scan of one
project's routes.

## 4. Mock definition format

### 4.1 `mocks/<slug>/project.yaml`

```yaml
name: Card Block (Lost Card)          # display name
slug: card-block-lost                 # MUST equal the directory name; URL segment
basePath: /commands                   # optional; stripped from the request path before matching
defaults:
  delayMs: 0                          # artificial latency added to every response
  cors: true                          # emit permissive CORS headers + handle OPTIONS preflight
  notFound:                           # returned when no route matches
    status: 404
    body: { reason: UNKNOWN_ROUTE }
```

- `slug`: `^[a-z0-9][a-z0-9-]{0,62}$`. Duplicate slug across directories -> build error.
- `basePath`: if set, a request to `/m/<slug>/commands/x/y` matches a route with `path: /x/y`.

### 4.2 `mocks/<slug>/routes/*.yaml`

A YAML list of **rules**. Multiple files are concatenated in filename order. Evaluation is
**first match wins**.

```yaml
- id: verify-customer-ok             # unique within the project; used in logs
  description: happy path            # optional
  request:
    method: POST                     # GET | POST | PUT | PATCH | DELETE | * (any)
    path: /acropolis-card-mgmt/VERIFY_CUSTOMER/v1
    match:                           # optional; ALL conditions must pass
      - jsonPath: $.customerId
        equals: cust-ok
  response:
    status: 200
    headers:                         # optional; merged over defaults
      content-type: application/json
    body:                            # object | string | null
      verified: true
      riskScore: 12

- id: verify-customer-default        # same method+path, no match block => catch-all for this path
  request:
    method: POST
    path: /acropolis-card-mgmt/VERIFY_CUSTOMER/v1
  response:
    status: 200
    body: { verified: true, riskScore: 12 }
```

**Path syntax:** literal segments, `:name` (named param, exposed to templating as
`request.path.name`), `*` (single-segment wildcard), `**` (trailing catch-all). No regex in
paths.

**Match conditions** — each item is one of:

| Field | Operators | Target |
| --- | --- | --- |
| `jsonPath: $.a.b` | `equals`, `notEquals`, `contains`, `regex`, `exists: true\|false` | request JSON body |
| `header: x-foo` | `equals`, `regex`, `exists` | request header (case-insensitive) |
| `query: page` | `equals`, `regex`, `exists` | request query string |

`equals` compares as strings after JSON-stringifying non-string targets. `regex` is
JavaScript `RegExp`, anchored by the author if needed, compiled at build time (invalid regex ->
build error). All conditions in a `match` array must pass (AND). To express OR, write two
rules.

**Response `body`:**
- object -> serialized as JSON, `content-type: application/json` unless overridden.
- string -> sent as-is, `content-type: text/plain` unless overridden. Templating applies.
- `null` / omitted -> empty body, `Content-Length: 0`.

### 4.3 Templating

Applies to response `body` (recursively through objects/arrays, on string values) and `headers`
values. Syntax `{{ expr }}`. **The only allowed expressions:**

| Expression | Result |
| --- | --- |
| `{{request.body.<json-path>}}` | value at that path in the request JSON body (dot + `[n]`) |
| `{{request.path.<name>}}` | value of a `:name` path param |
| `{{request.query.<name>}}` | query-string value |
| `{{request.header.<name>}}` | request header value (case-insensitive) |
| `{{uuid}}` | random UUID v4 |
| `{{now}}` | current time, ISO-8601 |
| `{{now.epochMs}}` | current time, ms since epoch |
| `{{randomInt <min> <max>}}` | random integer in `[min, max]` |

Unknown tokens -> build error (templates are validated at compile time against this grammar).
No arithmetic, no member calls, no conditionals. A missing runtime value (e.g. body path not
present) renders as an empty string and logs a warning line.

### 4.4 `mocks/<slug>/openapi/*.yaml`

Optional. Each file is a standalone OpenAPI 3.0/3.1 document, parsed with
`@apidevtools/swagger-parser` (`$ref` resolved, document validated -- invalid spec -> build
error). For every `path` x operation:

- One base **Route** is generated: `method` from the operation, `path` from the OpenAPI path
  (`{id}` -> `:id`).
- Response: the lowest declared 2xx status (else the lowest declared status). Body chosen in
  order: media-type `examples` (first) -> media-type `example` -> **empty body + build
  WARNING** naming the operation. No schema faking.
- `operationId` (or `method + path`) becomes the route `id`, prefixed `openapi:`.

**Merge order within a project:** hand-written `routes/*.yaml` rules first, OpenAPI-generated
routes after. Because evaluation is first-match-wins, a hand-written rule for the same
method+path **overrides** the generated one. A hand-written rule with a narrower `match` plus a
generated fallback for the same path is the normal pattern.

### 4.5 Collisions & warnings (build-time, non-fatal)

- Two rules, same method + path, neither with a `match` block -> WARNING (second is dead).
- OpenAPI operation with no example -> WARNING.
- A project directory with no `project.yaml` -> ERROR.
- `slug` != directory name -> ERROR.

## 5. Compile pipeline

`src/compile/compile.ts`, invoked by `prebuild` (runs before `next build`) and by
`scripts/check.mjs`:

1. Enumerate `mocks/*/`.
2. Per project: parse + **Zod-validate** `project.yaml` and every `routes/*.yaml`; compile
   every `regex` and every template string against the grammars in section 4.
3. Parse + validate every `openapi/*.yaml`; expand to routes (section 4.4).
4. Merge routes (section 4.4), collect warnings (section 4.5).
5. Emit `mocks.generated.json`:
   ```jsonc
   {
     "builtAt": "2026-08-28T...Z",
     "commit": "<git sha>",
     "warnings": [ "..." ],
     "projects": {
       "card-block-lost": {
         "name": "...", "basePath": "/commands", "defaults": { ... },
         "routes": [ { "id", "method", "path", "segments": [...], "match": [...], "response": {...} } ]
       }
     }
   }
   ```
6. **Any ERROR aborts with a non-zero exit code** -> `next build` fails -> deploy fails.
   WARNINGS print but do not fail.

## 6. Runtime request flow

`app/m/[...slug]/route.ts` (one handler exported for GET/POST/PUT/PATCH/DELETE/OPTIONS):

```
1. slug = params.slug[0];  subPath = "/" + params.slug.slice(1).join("/")
2. project = GENERATED.projects[slug]        // module-scope constant
   - missing        -> 404 { error: "unknown project", slug }
3. if project.basePath and subPath startsWith basePath -> strip it
4. if method OPTIONS and project.defaults.cors -> return CORS preflight 204
5. route = first r in project.routes where
     methodMatches(r, method) && pathMatches(r.segments, subPath) && allMatch(r.match, request)
   - none -> response = project.defaults.notFound
6. body = render(route.response.body, templateContext(request, pathParams))
   headers = merge(defaultHeaders(project), route.response.headers, renderedHeaders)
7. if project.defaults.delayMs > 0 -> await delay
8. log one line: { t, proj: slug, m: method, path: subPath, rule: route?.id ?? null,
                   status, matched: !!route }
9. return Response(body, { status, headers })
```

`request` parsing: JSON body parsed once (best-effort; non-JSON body -> `match` on `jsonPath`
fails, templating `request.body.*` -> empty). Header/query lookups are case-insensitive.

`src/engine/resolve.ts` is the pure core: `resolve(parsedRequest, projectConfig) => { status,
headers, body }`. The route file only does Web `Request`/`Response` marshalling and logging.
This keeps the matching logic testable without HTTP.

## 7. Reserved endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /__mock/health` | `{ ok, builtAt, commit, projectCount, warnings }` |
| `GET /__mock/projects` | `[ { slug, name, routeCount, hasOpenApi } ]` -- viewer data source |
| `GET /m/<slug>/__spec` | the project's merged OpenAPI document, if any (`404` if none) |

`__mock` and `__spec` are reserved: a project route whose path starts `/__` -> build error.

## 8. Error handling

| Situation | Behaviour |
| --- | --- |
| Invalid mock config | Build fails (section 5, step 6). Never deployed. |
| Unknown project slug | `404 { error: "unknown project" }` |
| No route matches | `project.defaults.notFound` (default `404 { reason: UNKNOWN_ROUTE }`) |
| Request body not JSON | Not an error. `jsonPath` conditions fail; body templates render empty. |
| Template value missing at runtime | Renders empty string; one warning log line. |
| Handler throws (unexpected) | `500 { error: "mock engine failure", ref: <log id> }`, error logged. Isolated per request. |

## 9. Testing strategy

- **Engine unit tests** (`src/engine/*.test.ts`) -- table-driven. Port the `card-block-lost`
  scenario matrix (`card-block-lost-api-docs.md`) into cases: given request body -> expected
  matched rule id + status + body. This is the primary safety net.
- **Compile tests** (`src/compile/*.test.ts`) -- valid fixtures compile; each ERROR class
  (missing `project.yaml`, bad slug, unknown template token, invalid regex, reserved path)
  fails the compile with a clear message.
- **OpenAPI expansion tests** -- a spec with examples -> expected routes; a spec without ->
  routes + warnings.
- **Route smoke test** -- one Next route handler test per HTTP method via the app's request
  helper, asserting the adapter wiring (slug parse, basePath strip, CORS preflight, delay).
- Runner: `vitest`. `scripts/check.mjs` runs `compile + tsc --noEmit + eslint + vitest` -- the
  same gate CI will run once the harness spec lands.

## 10. Deployment

- **Vercel Hobby**, project imported from `github.com/KolaparthiDeepak/mockservers` under the
  owner's personal GitHub.
- `vercel.json`: single function for `app/m/[...slug]`, default region, `maxDuration` 10s
  (Hobby cap; the handler is sub-millisecond, this only bounds `delayMs` misuse).
- **Domain:** `mockservers.dailyuze.com` added in Vercel project settings; GoDaddy DNS CNAME
  `mockservers` -> the target Vercel provides (`cname.vercel-dns.com`). TLS auto-issued.
  Owning `dailyuze.com` already confers every subdomain; only a *wildcard* would need Pro.
- **Production** deploys on merge to `main`; **preview** deploys per PR (test a mock live on
  the preview URL before merging).
- `mocks.generated.json` is git-ignored and produced by `prebuild` on every deploy, so it can
  never drift from `mocks/`.

## 11. Repository bootstrap

- Local path `~/personal-projects/mockservers`, `git init` done, `origin` =
  `https://github.com/KolaparthiDeepak/mockservers.git`.
- **Repo-local git identity** (never global): `user.name = "Deepak Kolaparthi"`,
  `user.email = "KolaparthiDeepak@users.noreply.github.com"`. No `@zeta.tech` identity is ever
  used in this repo.
- The **initial scaffold commit** (app skeleton, engine, one example project ported from
  `card-block-lost`, this design doc, README) lands on `main` as the repo-bootstrap commit.
  Every change **after** bootstrap is a feature branch + PR; `main` gets branch protection once
  the harness spec is implemented.

## 12. First example project

Port `card-block-lost` as `mocks/card-block-lost/`:
- `openapi/card-block-lost.yaml` -- the existing `card-block-lost-mock-openapi.yaml`, giving all
  happy-path routes.
- `routes/*.yaml` -- the branch scenarios from the existing `card-block-lost-mock-server.js`
  lookup tables (customer/card-last4/eligibility/block/notify) expressed as `match` rules on
  `$.customerId` / `$.cardLast4` / `$.cardId`.
- Proves the format against a real multi-branch workflow and seeds the engine test matrix.

## 13. Deferred (each its own spec later)

1. **Agent harness** -- `.claude/` hooks (block commit on `main`, block force-push, enforce
   personal identity, validate `mocks/**` on edit), `AGENTS.md`/`CLAUDE.md`, GitHub Actions CI,
   `main` branch protection.
2. **Sandboxed JS handlers** -- `export default (req) => response` run in an isolated context
   (no `require`/network/fs, time-boxed), as an escape hatch for logic too branchy for `match`
   rules.
3. **Browser editing** -- a KV store (Upstash Redis) + authenticated write UI; mock config
   becomes a document per project instead of repo files.
4. **Stateful mocks** -- sequential/weighted response variants, call-count conditions; needs a
   per-project counter store.
5. **Multi-tenant / hosted-for-others** -- auth, workspace isolation, quotas, abuse controls.
6. **OpenAPI schema faking** -- synthesize response bodies for operations lacking examples.
7. **Wildcard subdomains** -- `<project>.mockservers.dailyuze.com` (Vercel Pro).

## 14. Open questions

None blocking. To confirm during implementation planning:
- `vitest` vs `node:test` -- leaning `vitest` for table-driven ergonomics and Next compatibility.
- Whether the viewer page is worth shipping in the first PR or as an immediate follow-up (it is
  low-cost and answers "is my mock deployed?").
