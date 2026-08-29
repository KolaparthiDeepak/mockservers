# Mock definition format

A mock is just files under `mocks/<slug>/`. Changing a mock is an edit + PR + merge;
production picks it up on the next deploy (~40s). Nothing is stored in a database and the
request path does no I/O — at build time `mocks/` is compiled to `mocks.generated.json` and
every request is an in-memory lookup.

A project is one directory:

```
mocks/<slug>/
  project.yaml          # required — project config
  routes/*.yaml         # optional — hand-written match rules (first match wins)
  openapi/*.yaml        # optional — OpenAPI 3 docs, one route per operation
```

---

## `mocks/<slug>/project.yaml`

Set `slug` to the directory name. `basePath`, if set, is stripped from the request path
before matching.

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

- `slug`: `^[a-z0-9][a-z0-9-]{0,62}$`, and MUST equal the directory name (mismatch → build error).
- `basePath`: if set, a request to `/m/<slug>/commands/x/y` matches a route with `path: /x/y`.
  A trailing slash is normalized away (`/api/` → `/api`).
- `cors: false`: no CORS headers, and `OPTIONS` requests fall through to normal matching
  (so they typically hit the `notFound` default, i.e. `404`).

---

## `mocks/<slug>/routes/*.yaml`

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

### Match conditions

Each item in a `match` array is one of:

| Field | Operators | Target |
| --- | --- | --- |
| `jsonPath: $.a.b` | `equals`, `notEquals`, `contains`, `regex`, `exists: true\|false` | request JSON body |
| `header: x-foo` | `equals`, `notEquals`, `contains`, `regex`, `exists: true\|false` | request header (case-insensitive) |
| `query: page` | `equals`, `notEquals`, `contains`, `regex`, `exists: true\|false` | request query string |

The engine applies all five operators uniformly to every target.

`equals` compares as strings after JSON-stringifying non-string targets. `regex` is
JavaScript `RegExp`, anchored by the author if needed, compiled at build time (invalid regex
→ build error). All conditions in a `match` array must pass (AND). **To express OR, write two
rules.**

`notEquals`, `contains`, and `regex` evaluate to **false** when the target is absent
(fail-closed). To assert that a field is missing, use `exists: false`.

### Response `body`

- object → serialized as JSON, `content-type: application/json` unless overridden.
- string → sent as-is, `content-type: text/plain` unless overridden. Templating applies.
- `null` / omitted → empty body, `Content-Length: 0`.

---

## Templating

Applies to response `body` (recursively through objects/arrays, on string values) and
`headers` values. Syntax `{{ expr }}`. **The only allowed expressions:**

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

Unknown tokens → build error (templates are validated at compile time against this grammar).
No arithmetic, no member calls, no conditionals. A missing runtime value (e.g. body path not
present) renders as an empty string and logs a warning line.

---

## `mocks/<slug>/openapi/*.yaml`

Optional. Each file is a standalone OpenAPI 3.0/3.1 document, parsed with
`@apidevtools/swagger-parser` (`$ref` resolved, document validated — invalid spec → build
error). For every `path` × operation:

- One base **Route** is generated: `method` from the operation, `path` from the OpenAPI path
  (`{id}` → `:id`).
- Response: the lowest declared 2xx status (else the lowest declared status). Body chosen in
  order: media-type `examples` (first) → media-type `example` → **empty body + build WARNING**
  naming the operation. No schema faking.
- `operationId` (or `method + path`) becomes the route `id`, prefixed `openapi:`.

**Examples only; an operation with no example → empty body + build warning. Hand-written
rules override generated ones.**

**Merge order within a project:** hand-written `routes/*.yaml` rules first, OpenAPI-generated
routes after. Because evaluation is first-match-wins, a hand-written rule for the same
method+path **overrides** the generated one. A hand-written rule with a narrower `match` plus
a generated fallback for the same path is the normal pattern.

---

## Collisions & warnings (build-time, non-fatal)

- Two rules, same method + path, neither with a `match` block → WARNING (second is dead).
- OpenAPI operation with no example → WARNING.
- A project directory with no `project.yaml` → ERROR.
- `slug` != directory name → ERROR.
- The same rule `id` used twice within a project → ERROR.

---

## Reserved paths

`__mock` and `__spec` are reserved. A project route whose `path` starts with `/__` → build
error.

| Endpoint | Purpose |
| --- | --- |
| `GET /__mock/health` | build info, project count, warnings |
| `GET /__mock/projects` | project list — viewer data source |
| `GET /m/<slug>/__spec` | the project's merged OpenAPI document, if any (`404` if none) |

---

## Worked example

```bash
npm run new-project payments
# edit mocks/payments/routes/main.yaml
npm run compile
npm run dev
curl -s localhost:3000/m/payments/hello
```

`npm run new-project payments` scaffolds `mocks/payments/project.yaml` and
`mocks/payments/routes/main.yaml` with a single `GET /hello` rule. Edit the rule, run
`npm run compile` to regenerate `mocks.generated.json` (it fails loudly on any invalid
config), then `npm run dev` serves it at `http://localhost:3000/m/payments/hello`.
