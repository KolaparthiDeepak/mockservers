# mockservers 3D Explorer + Inline Runner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static table viewer at `/` with a WebGL project ring, a nested endpoint/case explorer, and a browser-side curl runner that reports which mock route the request actually hit.

**Architecture:** A server component (`app/page.tsx`) imports `mocks.generated.json`, runs a pure `buildViewModel()` over it, and passes a plain serializable `ViewModel` to a client `ExplorerApp`. `ExplorerApp` composes a lazy-loaded react-three-fiber `<Monolith>` (WebGL ring of project slabs) with a `<Explorer>` 3-pane UI (endpoints │ cases │ runner). The runner does same-origin `fetch` to the existing `/m/<slug>/…` routes; one new response header (`x-mock-rule-id`) lets it classify the result.

**Tech Stack:** Next.js 15.5 (App Router), React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vitest 2 (node env), `three` + `@react-three/fiber` + `@react-three/drei`, `next/font/google`.

**Spec:** `docs/specs/2026-08-29-mockservers-viewer-3d-design.md` — read it alongside this plan.

## Global Constraints

- Node `>= 20` (`package.json` engines). `structuredClone`, `URLSearchParams`, `performance.now` are all global — no polyfills.
- TypeScript is `strict` **and** `noUncheckedIndexedAccess: true`: every `arr[i]` / `obj[key]` is `T | undefined`. Use `!` only when a prior check guarantees presence; otherwise handle `undefined`.
- Path alias: `@/*` → repo root (e.g. `@/src/viewer/model`). Configured in both `tsconfig.json` and `vitest.config.ts`.
- `"type": "module"` — all files are ESM. No `require`.
- Vitest environment is `node`. Test files match `src/**/*.test.{ts,tsx}` and `app/**/*.test.{ts,tsx}`. **No jsdom, no React Testing Library** — pure logic lives in tested `src/viewer/*` and `app/_explorer/*.ts` modules; UI components are verified manually (each UI task has a verification checklist). This narrows spec §10's "one RTL smoke test" deliberately: the deps cost (jsdom + 3 libs) is not worth one test when the logic it would cover is already extracted and unit-tested.
- The gate is `npm run check` (compile → `tsc --noEmit` → `eslint .` → `vitest run`). It does **not** run `next build`; the final task adds an explicit `npm run build` check.
- Repo rule: work on the current feature branch `feat/viewer-3d-explorer`, commit per task, no direct commits to `main`.
- Commit messages: Conventional Commits, and end every commit body with `Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9`.
- Colour is never the only signal (verdict = glyph + text; status = the number; selection = border + weight). Visible focus ring on every interactive element. `prefers-reduced-motion` disables auto-rotate, camera animation, and the trace pulse.
- Design tokens (exact hex): `--ground #12100E`, `--panel #1B1815`, `--panel-2 #211D19`, `--rule #322D28`, `--ink #E8E2D9`, `--ink-dim #8A8177`, `--pass #6FB86A`, `--divert #D99A4E`, `--fault #D5563F`, `--trace #C9A15E`. Dark-only, no light variant.
- Fonts: **Chivo** for chrome (wordmark, labels, buttons), **IBM Plex Mono** for all data (paths, curl, JSON, status, latency).

---

## Task 1: `src/viewer/curl.ts` — request synthesis

**Files:**
- Create: `src/viewer/curl.ts`
- Test: `src/viewer/curl.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  ```ts
  export interface MatchCondition {
    jsonPath?: string; header?: string; query?: string;
    equals?: string; notEquals?: string; contains?: string; regex?: string; exists?: boolean;
  }
  export interface SchemaProp { enum?: unknown[]; example?: unknown }
  export interface SynthInput {
    method: string;                 // "GET" | "POST" | ...  (caller resolves "*" to "POST")
    runUrl: string;                 // e.g. "/m/card-block-lost/commands/acropolis-card-mgmt/GET_CARD/v1"
    match: MatchCondition[];
    requestExample?: Record<string, unknown>;
    requestSchemaProps?: Record<string, SchemaProp>;   // keyed by top-level property name
  }
  export interface RequestDraft {
    method: string;
    url: string;                    // runUrl plus any ?query
    headers: Record<string, string>;
    body?: string;                  // pretty JSON, only for POST/PUT/PATCH
    curl: string;                   // uses literal "$ORIGIN" prefix
    notes: string[];
  }
  export function synthesizeRequest(input: SynthInput): RequestDraft;
  export function looseSetPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void; // exported for tests
  ```

- [ ] **Step 1: Write the failing test**

Create `src/viewer/curl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { synthesizeRequest } from "./curl";

const base = { method: "POST", runUrl: "/m/p/x/GET_CARD/v1" } as const;

describe("synthesizeRequest", () => {
  it("overlays an `equals` jsonPath condition onto the OpenAPI example", () => {
    const d = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.cardLast4", equals: "0001" }],
      requestExample: { customerId: "cust_1", cardLast4: "4242" },
    });
    expect(JSON.parse(d.body!)).toEqual({ customerId: "cust_1", cardLast4: "0001" });
    expect(d.headers["content-type"]).toBe("application/json");
    expect(d.method).toBe("POST");
    expect(d.url).toBe("/m/p/x/GET_CARD/v1");
  });

  it("fills an `exists: true` path from the schema enum, else a literal placeholder", () => {
    const withEnum = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.reason", exists: true }],
      requestSchemaProps: { reason: { enum: ["LOST_OR_STOLEN"] } },
    });
    expect(JSON.parse(withEnum.body!)).toEqual({ reason: "LOST_OR_STOLEN" });

    const noHint = synthesizeRequest({ ...base, match: [{ jsonPath: "$.cardId", exists: true }] });
    expect(JSON.parse(noHint.body!)).toEqual({ cardId: "<value>" });
  });

  it("does not overwrite a value the example already supplies for an `exists` path", () => {
    const d = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.cardLast4", exists: true }],
      requestExample: { cardLast4: "4242" },
    });
    expect(JSON.parse(d.body!)).toEqual({ cardLast4: "4242" });
  });

  it("maps header and query conditions, not the body", () => {
    const d = synthesizeRequest({
      ...base,
      match: [
        { header: "X-Tenant", equals: "acme" },
        { query: "trace", equals: "1" },
      ],
    });
    expect(d.headers["x-tenant"]).toBe("acme");
    expect(d.url).toBe("/m/p/x/GET_CARD/v1?trace=1");
  });

  it("records a note for operators it cannot render exactly, and never throws", () => {
    const d = synthesizeRequest({
      ...base,
      match: [
        { jsonPath: "$.name", regex: "^A" },
        { jsonPath: "$.k", notEquals: "v" },
        { jsonPath: "$[*].bad", equals: "x" },
      ],
    });
    expect(d.notes.length).toBe(3);
    expect(d.notes[0]).toContain("must match");
  });

  it("omits the body and content-type for GET", () => {
    const d = synthesizeRequest({ ...base, method: "GET", match: [] });
    expect(d.body).toBeUndefined();
    expect(d.headers["content-type"]).toBeUndefined();
  });

  it("renders a deterministic curl string with a $ORIGIN prefix", () => {
    const d = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.cardLast4", equals: "0001" }],
      requestExample: { cardLast4: "x" },
    });
    expect(d.curl).toContain(`curl -sS -X POST "$ORIGIN/m/p/x/GET_CARD/v1"`);
    expect(d.curl).toContain(`-H 'content-type: application/json'`);
    expect(d.curl).toContain(`"cardLast4": "0001"`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/viewer/curl.test.ts`
Expected: FAIL — `Failed to resolve import "./curl"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/viewer/curl.ts`:

```ts
export interface MatchCondition {
  jsonPath?: string;
  header?: string;
  query?: string;
  equals?: string;
  notEquals?: string;
  contains?: string;
  regex?: string;
  exists?: boolean;
}

export interface SchemaProp {
  enum?: unknown[];
  example?: unknown;
}

export interface SynthInput {
  method: string;
  runUrl: string;
  match: MatchCondition[];
  requestExample?: Record<string, unknown>;
  requestSchemaProps?: Record<string, SchemaProp>;
}

export interface RequestDraft {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  curl: string;
  notes: string[];
}

const PLACEHOLDER = "<value>";
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const DOT_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

/** "$.a.b" -> "a.b"; null if the path uses filters/wildcards/brackets. */
function jsonPathToDot(jp: string): string | null {
  if (!jp.startsWith("$.")) return null;
  const rest = jp.slice(2);
  return DOT_PATH.test(rest) ? rest : null;
}

export function looseSetPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    const next = cur[k];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function hasPath(obj: Record<string, unknown>, dotPath: string): boolean {
  let cur: unknown = obj;
  for (const k of dotPath.split(".")) {
    if (typeof cur !== "object" || cur === null || !(k in cur)) return false;
    cur = (cur as Record<string, unknown>)[k];
  }
  return true;
}

function describeOp(c: MatchCondition): string {
  if (c.regex !== undefined) return `must match /${c.regex}/`;
  if (c.notEquals !== undefined) return `must not equal ${JSON.stringify(c.notEquals)}`;
  if (c.exists === false) return "must be absent";
  return "has an unrepresentable constraint";
}

function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
): string {
  const parts = [`curl -sS -X ${method} "$ORIGIN${url}"`];
  for (const [k, v] of Object.entries(headers)) parts.push(`  -H '${k}: ${v}'`);
  if (body !== undefined) parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  return parts.join(" \\\n");
}

export function synthesizeRequest(input: SynthInput): RequestDraft {
  const method = input.method.toUpperCase();
  const hasBody = BODY_METHODS.has(method);
  const notes: string[] = [];
  const headers: Record<string, string> = {};
  const body: Record<string, unknown> = hasBody
    ? (structuredClone(input.requestExample ?? {}) as Record<string, unknown>)
    : {};
  const query = new URLSearchParams();

  if (hasBody) headers["content-type"] = "application/json";

  for (const c of input.match) {
    if (c.jsonPath !== undefined) {
      const dot = jsonPathToDot(c.jsonPath);
      if (dot === null) {
        notes.push(`adjust: ${c.jsonPath} — unsupported path shape, set the body by hand`);
        continue;
      }
      if (c.equals !== undefined) looseSetPath(body, dot, c.equals);
      else if (c.contains !== undefined) looseSetPath(body, dot, c.contains);
      else if (c.exists === true) {
        if (!hasPath(body, dot)) {
          const prop = input.requestSchemaProps?.[dot];
          const v = prop?.enum?.[0] ?? prop?.example ?? PLACEHOLDER;
          looseSetPath(body, dot, v);
        }
      } else {
        notes.push(`adjust: body ${c.jsonPath} ${describeOp(c)}`);
      }
    } else if (c.header !== undefined) {
      if (c.equals !== undefined) headers[c.header.toLowerCase()] = c.equals;
      else if (c.contains !== undefined) headers[c.header.toLowerCase()] = c.contains;
      else notes.push(`adjust: header ${c.header} ${describeOp(c)}`);
    } else if (c.query !== undefined) {
      if (c.equals !== undefined) query.set(c.query, c.equals);
      else if (c.contains !== undefined) query.set(c.query, c.contains);
      else notes.push(`adjust: query ${c.query} ${describeOp(c)}`);
    }
  }

  const qs = query.toString();
  const url = qs ? `${input.runUrl}${input.runUrl.includes("?") ? "&" : "?"}${qs}` : input.runUrl;
  const bodyStr = hasBody ? JSON.stringify(body, null, 2) : undefined;

  return { method, url, headers, body: bodyStr, curl: buildCurl(method, url, headers, bodyStr), notes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/viewer/curl.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/viewer/curl.ts src/viewer/curl.test.ts
git commit -m "$(cat <<'EOF'
feat(viewer): request synthesis from match rules

synthesizeRequest() turns a route's match conditions + OpenAPI example
into an editable RequestDraft (method, url, headers, body, curl string).
Unsupported operators produce notes, never throw.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 2: `src/viewer/model.ts` — `buildViewModel`

**Files:**
- Create: `src/viewer/model.ts`
- Test: `src/viewer/model.test.ts`

**Interfaces:**
- Consumes: `synthesizeRequest`, `MatchCondition`, `RequestDraft`, `SchemaProp` from `./curl`; `CompiledBundle` from `@/src/compile/compile`; `ProjectConfig`, `Route` from `@/src/engine/types`.
- Produces:
  ```ts
  export interface ViewModel {
    build: { commit: string; builtAt: string; warnings: string[] };
    projects: ProjectVM[];
  }
  export interface ProjectVM {
    slug: string; name: string; basePath?: string;
    endpoints: EndpointVM[]; caseCount: number;
  }
  export interface EndpointVM {
    key: string;                // `${method} ${path}`
    method: string; path: string; runUrl: string;
    summary?: string;
    cases: CaseVM[];
  }
  export interface CaseVM {
    id: string; label: string; isOpenApiGenerated: boolean;
    match: MatchCondition[];
    expected: { status: number; body?: unknown; headers?: Record<string, string> };
    request: RequestDraft;
  }
  export function buildViewModel(bundle: CompiledBundle): ViewModel;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/viewer/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CompiledBundle } from "@/src/compile/compile";
import { buildViewModel } from "./model";

const bundle = {
  builtAt: "2026-08-29T00:00:00Z",
  commit: "abc1234",
  warnings: ["w1"],
  projects: {
    demo: {
      name: "Demo",
      slug: "demo",
      basePath: "/commands",
      defaults: { delayMs: 0, cors: true, notFound: { status: 404, body: { reason: "UNKNOWN_ROUTE" } } },
      routes: [
        {
          id: "not-found", method: "POST", path: "/svc/GET_CARD/v1",
          segments: [], match: [{ jsonPath: "$.cardLast4", equals: "0001" }],
          response: { status: 404, body: { reason: "CARD_NOT_FOUND" } },
        },
        {
          id: "happy", method: "POST", path: "/svc/GET_CARD/v1",
          segments: [], match: [{ jsonPath: "$.cardLast4", exists: true }],
          response: { status: 200, body: { status: "ACTIVE" } },
        },
        {
          id: "openapi:getCard", method: "POST", path: "/svc/GET_CARD/v1",
          segments: [], response: { status: 200, body: { status: "ACTIVE" } },
        },
        {
          id: "block", method: "POST", path: "/svc/BLOCK_CARD/v1",
          segments: [], response: { status: 200, body: { status: "BLOCKED" } },
        },
      ],
      openApiDoc: {
        openapi: "3.0.3",
        paths: {
          "/commands/svc/GET_CARD/v1": {
            post: {
              summary: "Look up a card",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { cardLast4: { type: "string" } } },
                    examples: { ok: { value: { customerId: "cust_1", cardLast4: "4242" } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as unknown as CompiledBundle;

describe("buildViewModel", () => {
  it("carries build metadata through", () => {
    const vm = buildViewModel(bundle);
    expect(vm.build).toEqual({ commit: "abc1234", builtAt: "2026-08-29T00:00:00Z", warnings: ["w1"] });
  });

  it("groups routes into endpoints by method+path, preserving route order as case order", () => {
    const p = buildViewModel(bundle).projects[0]!;
    expect(p.endpoints.map((e) => e.key)).toEqual(["POST /svc/GET_CARD/v1", "POST /svc/BLOCK_CARD/v1"]);
    expect(p.endpoints[0]!.cases.map((c) => c.id)).toEqual(["not-found", "happy", "openapi:getCard"]);
    expect(p.caseCount).toBe(4);
  });

  it("rebuilds runUrl from slug + basePath + route path", () => {
    const p = buildViewModel(bundle).projects[0]!;
    expect(p.endpoints[0]!.runUrl).toBe("/m/demo/commands/svc/GET_CARD/v1");
  });

  it("pulls the OpenAPI summary and feeds the example into request synthesis", () => {
    const ep = buildViewModel(bundle).projects[0]!.endpoints[0]!;
    expect(ep.summary).toBe("Look up a card");
    // "not-found" case: example cardLast4 "4242" overridden by equals "0001"
    expect(JSON.parse(ep.cases[0]!.request.body!)).toEqual({ customerId: "cust_1", cardLast4: "0001" });
  });

  it("flags openapi-generated cases", () => {
    const cases = buildViewModel(bundle).projects[0]!.endpoints[0]!.cases;
    expect(cases[2]).toMatchObject({ id: "openapi:getCard", label: "getCard", isOpenApiGenerated: true });
    expect(cases[0]!.isOpenApiGenerated).toBe(false);
  });

  it("handles a project with no basePath and no openApiDoc", () => {
    const bare = {
      builtAt: "t", commit: "c", warnings: [],
      projects: { bare: {
        name: "Bare", slug: "bare",
        defaults: { delayMs: 0, cors: true, notFound: { status: 404, body: {} } },
        routes: [{ id: "r", method: "GET", path: "/ping", segments: [], response: { status: 200, body: { ok: true } } }],
      } },
    } as unknown as CompiledBundle;
    const ep = buildViewModel(bare).projects[0]!.endpoints[0]!;
    expect(ep.runUrl).toBe("/m/bare/ping");
    expect(ep.summary).toBeUndefined();
    expect(ep.cases[0]!.request.body).toBeUndefined(); // GET
  });

  it("returns an empty projects array for an empty bundle", () => {
    const vm = buildViewModel({ builtAt: "t", commit: "c", warnings: [], projects: {} } as CompiledBundle);
    expect(vm.projects).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/viewer/model.test.ts`
Expected: FAIL — `Failed to resolve import "./model"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/viewer/model.ts`:

```ts
import type { CompiledBundle } from "@/src/compile/compile";
import type { ProjectConfig, Route } from "@/src/engine/types";
import { synthesizeRequest, type MatchCondition, type RequestDraft, type SchemaProp } from "./curl";

export interface ViewModel {
  build: { commit: string; builtAt: string; warnings: string[] };
  projects: ProjectVM[];
}

export interface ProjectVM {
  slug: string;
  name: string;
  basePath?: string;
  endpoints: EndpointVM[];
  caseCount: number;
}

export interface EndpointVM {
  key: string;
  method: string;
  path: string;
  runUrl: string;
  summary?: string;
  cases: CaseVM[];
}

export interface CaseVM {
  id: string;
  label: string;
  isOpenApiGenerated: boolean;
  match: MatchCondition[];
  expected: { status: number; body?: unknown; headers?: Record<string, string> };
  request: RequestDraft;
}

interface OaMediaType {
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
  schema?: { properties?: Record<string, { enum?: unknown[]; example?: unknown }> };
}
interface OaOperation {
  summary?: string;
  requestBody?: { content?: Record<string, OaMediaType> };
}
interface OaDoc {
  paths?: Record<string, Record<string, OaOperation>>;
}

function operationFor(doc: OaDoc | undefined, fullPath: string, method: string): OaOperation | undefined {
  return doc?.paths?.[fullPath]?.[method.toLowerCase()];
}

function jsonMediaType(op: OaOperation | undefined): OaMediaType | undefined {
  return op?.requestBody?.content?.["application/json"];
}

function requestExample(mt: OaMediaType | undefined): Record<string, unknown> | undefined {
  if (!mt) return undefined;
  if (mt.example && typeof mt.example === "object") return mt.example as Record<string, unknown>;
  const first = mt.examples ? Object.values(mt.examples)[0]?.value : undefined;
  return first && typeof first === "object" ? (first as Record<string, unknown>) : undefined;
}

function schemaProps(mt: OaMediaType | undefined): Record<string, SchemaProp> | undefined {
  const props = mt?.schema?.properties;
  if (!props) return undefined;
  const out: Record<string, SchemaProp> = {};
  for (const [k, v] of Object.entries(props)) out[k] = { enum: v.enum, example: v.example };
  return out;
}

function groupByEndpoint(routes: Route[]): Map<string, Route[]> {
  const groups = new Map<string, Route[]>();
  for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

function projectVM(p: ProjectConfig): ProjectVM {
  const doc = p.openApiDoc as OaDoc | undefined;
  const bp = p.basePath ?? "";
  const endpoints: EndpointVM[] = [];

  for (const [key, routes] of groupByEndpoint(p.routes)) {
    const first = routes[0]!;
    const method = first.method === "*" ? "POST" : first.method;
    const runUrl = `/m/${p.slug}${bp}${first.path}`;
    const op = operationFor(doc, bp + first.path, method);
    const mt = jsonMediaType(op);
    const example = requestExample(mt);
    const props = schemaProps(mt);

    const cases: CaseVM[] = routes.map((r) => {
      const match = (r.match ?? []) as MatchCondition[];
      return {
        id: r.id,
        label: r.id.startsWith("openapi:") ? r.id.slice("openapi:".length) : r.id,
        isOpenApiGenerated: r.id.startsWith("openapi:"),
        match,
        expected: { status: r.response.status, body: r.response.body, headers: r.response.headers },
        request: synthesizeRequest({ method, runUrl, match, requestExample: example, requestSchemaProps: props }),
      };
    });

    endpoints.push({
      key,
      method: first.method,
      path: first.path,
      runUrl,
      summary: op?.summary,
      cases,
    });
  }

  return {
    slug: p.slug,
    name: p.name,
    basePath: p.basePath,
    endpoints,
    caseCount: endpoints.reduce((n, e) => n + e.cases.length, 0),
  };
}

export function buildViewModel(bundle: CompiledBundle): ViewModel {
  return {
    build: { commit: bundle.commit, builtAt: bundle.builtAt, warnings: bundle.warnings },
    projects: Object.values(bundle.projects).map(projectVM),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/viewer/model.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/viewer/model.ts src/viewer/model.test.ts
git commit -m "$(cat <<'EOF'
feat(viewer): buildViewModel — group routes into endpoints + cases

Pure transform over CompiledBundle: routes grouped by method+path,
each route becomes a case with a synthesized request draft, OpenAPI
summary and example threaded in. runUrl rebuilds the basePath the
compiler strips.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 3: `src/viewer/verdict.ts` — classify a runner result

**Files:**
- Create: `src/viewer/verdict.ts`
- Test: `src/viewer/verdict.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface SelectedCase { id: string; expected: { status: number; body?: unknown } }
  export type Verdict =
    | { kind: "hit"; caseId: string }
    | { kind: "divert"; landedOn: string }
    | { kind: "nomatch" }
    | { kind: "unknown" };
  export function classifyResult(
    headers: Headers, status: number, bodyText: string, selected: SelectedCase,
  ): Verdict;
  export function looseBodyMatch(expected: unknown, actual: unknown): boolean; // exported for tests
  ```

- [ ] **Step 1: Write the failing test**

Create `src/viewer/verdict.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyResult, looseBodyMatch } from "./verdict";

const h = (obj: Record<string, string>) => new Headers(obj);
const sel = { id: "not-found", expected: { status: 404, body: { reason: "CARD_NOT_FOUND" } } };

describe("classifyResult", () => {
  it("hit when x-mock-rule-id equals the selected case id", () => {
    expect(classifyResult(h({ "x-mock-rule-id": "not-found", "x-mock-matched": "true" }), 404, "{}", sel))
      .toEqual({ kind: "hit", caseId: "not-found" });
  });

  it("divert when a different route matched", () => {
    expect(classifyResult(h({ "x-mock-rule-id": "happy", "x-mock-matched": "true" }), 200, "{}", sel))
      .toEqual({ kind: "divert", landedOn: "happy" });
  });

  it("nomatch when x-mock-matched is false", () => {
    expect(classifyResult(h({ "x-mock-rule-id": "", "x-mock-matched": "false" }), 404, "{}", sel))
      .toEqual({ kind: "nomatch" });
  });

  it("falls back to status+body compare when the header is absent -> hit", () => {
    expect(classifyResult(h({}), 404, JSON.stringify({ reason: "CARD_NOT_FOUND" }), sel))
      .toEqual({ kind: "hit", caseId: "not-found" });
  });

  it("falls back to unknown when the header is absent and the body differs", () => {
    expect(classifyResult(h({}), 200, JSON.stringify({ reason: "OTHER" }), sel))
      .toEqual({ kind: "unknown" });
  });
});

describe("looseBodyMatch", () => {
  it("ignores templated leaves in expected", () => {
    expect(looseBodyMatch({ last4: "{{request.body.cardLast4}}", status: "ACTIVE" }, { last4: "0001", status: "ACTIVE" }))
      .toBe(true);
  });
  it("fails on a concrete mismatch", () => {
    expect(looseBodyMatch({ status: "ACTIVE" }, { status: "BLOCKED" })).toBe(false);
  });
  it("allows the response to carry extra keys", () => {
    expect(looseBodyMatch({ a: 1 }, { a: 1, b: 2 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/viewer/verdict.test.ts`
Expected: FAIL — cannot resolve `./verdict`.

- [ ] **Step 3: Write minimal implementation**

Create `src/viewer/verdict.ts`:

```ts
export interface SelectedCase {
  id: string;
  expected: { status: number; body?: unknown };
}

export type Verdict =
  | { kind: "hit"; caseId: string }
  | { kind: "divert"; landedOn: string }
  | { kind: "nomatch" }
  | { kind: "unknown" };

function parseMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function looseBodyMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "string" && expected.includes("{{")) return true; // templated — skip
  if (expected === null || typeof expected !== "object") return expected === actual;
  if (actual === null || typeof actual !== "object") return false;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((v, i) => looseBodyMatch(v, actual[i]));
  }
  const a = actual as Record<string, unknown>;
  for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
    if (!looseBodyMatch(v, a[k])) return false;
  }
  return true;
}

export function classifyResult(
  headers: Headers,
  status: number,
  bodyText: string,
  selected: SelectedCase,
): Verdict {
  if (headers.get("x-mock-matched") === "false") return { kind: "nomatch" };

  const ruleId = headers.get("x-mock-rule-id");
  if (ruleId) {
    return ruleId === selected.id
      ? { kind: "hit", caseId: ruleId }
      : { kind: "divert", landedOn: ruleId };
  }

  if (status === selected.expected.status && looseBodyMatch(selected.expected.body, parseMaybe(bodyText))) {
    return { kind: "hit", caseId: selected.id };
  }
  return { kind: "unknown" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/viewer/verdict.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/viewer/verdict.ts src/viewer/verdict.test.ts
git commit -m "$(cat <<'EOF'
feat(viewer): classifyResult — did the request hit the picked case

Reads x-mock-rule-id / x-mock-matched; falls back to a loose body
compare (skipping {{templated}} leaves) when the header is absent.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 4: emit `x-mock-rule-id` from the mock route

**Files:**
- Modify: `app/m/[...slug]/route.ts` (the `headers` object built near the end of `handle()`, currently around line 60)
- Test: `app/m/[...slug]/route.test.ts` (add two cases)

**Interfaces:**
- Consumes: `resolve()`'s existing `result.matchedRuleId: string | null`.
- Produces: two response headers on every `/m/<slug>/…` response that reaches the resolver — `x-mock-rule-id` (the id, or `""`) and `x-mock-matched` (`"true"` | `"false"`). The `__spec` and `OPTIONS` branches return earlier and are unaffected.

- [ ] **Step 1: Write the failing test**

Add to `app/m/[...slug]/route.test.ts`, inside `describe("mock route", ...)`:

```ts
  it("exposes the matched rule id and matched flag as response headers", async () => {
    const res = await call(POST, "https://x/m/demo/commands/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "1" }),
    });
    expect(res.headers.get("x-mock-rule-id")).toBe("ok");
    expect(res.headers.get("x-mock-matched")).toBe("true");
  });

  it("marks an unmatched request with x-mock-matched: false and an empty rule id", async () => {
    const res = await call(POST, "https://x/m/demo/commands/nope", { method: "POST", body: "{}" });
    expect(res.headers.get("x-mock-matched")).toBe("false");
    expect(res.headers.get("x-mock-rule-id")).toBe("");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/m/[...slug]/route.test.ts"`
Expected: FAIL — `x-mock-rule-id` is `null`.

- [ ] **Step 3: Write minimal implementation**

In `app/m/[...slug]/route.ts`, change the `headers` construction in `handle()` from:

```ts
  const headers: Record<string, string> = { ...result.headers, ...cors };
```

to:

```ts
  const headers: Record<string, string> = {
    ...result.headers,
    ...cors,
    "x-mock-rule-id": result.matchedRuleId ?? "",
    "x-mock-matched": String(result.matchedRuleId !== null),
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/m/[...slug]/route.test.ts"`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add "app/m/[...slug]/route.ts" "app/m/[...slug]/route.test.ts"
git commit -m "$(cat <<'EOF'
feat(route): expose matched rule id in x-mock-rule-id header

Lets the viewer's runner tell "you hit case X" from "diverted to Y".
Same-origin read, no CORS expose-headers needed.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 5: dependencies, fonts, global stylesheet

**Files:**
- Modify: `package.json` (deps), `next.config.mjs`, `app/layout.tsx`
- Create: `app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom properties and `.mx-*` / `.wordmark` classes every UI task styles against; `--font-chivo` and `--font-plex-mono` CSS variables set on `<html>`; `three` / `@react-three/fiber` / `@react-three/drei` importable.

- [ ] **Step 1: Install the 3D stack**

Run:
```bash
npm install three @react-three/fiber @react-three/drei
```
Then pin to exact versions: edit `package.json` and remove the `^` from the three new `dependencies` entries (repo convention — every dep is exact). `three` ships its own types; do **not** add `@types/three`.

Verify install:
```bash
node -e "require.resolve('three'); require.resolve('@react-three/fiber'); require.resolve('@react-three/drei'); console.log('ok')"
```
Expected: `ok`.

> Note: `@react-three/fiber` v9+ requires React 19 — this repo is on `react@19.1.0`, so it fits. If npm resolves an older v8, force v9: `npm install @react-three/fiber@^9`.

- [ ] **Step 2: Add `transpilePackages` to the Next config**

Rewrite `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
};
export default nextConfig;
```

- [ ] **Step 3: Wire fonts + global CSS in the root layout**

Rewrite `app/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { Chivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const chivo = Chivo({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-chivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata = {
  title: "mockservers",
  description: "Hosted, file-defined mock API server",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${chivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Create `app/globals.css`**

```css
:root {
  --ground: #12100e;
  --panel: #1b1815;
  --panel-2: #211d19;
  --rule: #322d28;
  --ink: #e8e2d9;
  --ink-dim: #8a8177;
  --pass: #6fb86a;
  --divert: #d99a4e;
  --fault: #d5563f;
  --trace: #c9a15e;

  --font-sans: var(--font-chivo), system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), ui-monospace, "SF Mono", Menlo, monospace;
}

* { box-sizing: border-box; }

html, body { margin: 0; padding: 0; height: 100%; }

body {
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

:focus-visible {
  outline: 2px solid var(--trace);
  outline-offset: 2px;
}

/* ---- chrome ---- */
.mx-wordmark {
  font-family: var(--font-sans);
  font-weight: 900;
  letter-spacing: 0.02em;
  font-size: 1.5rem;
  color: var(--ink);
}

.mx-label {
  font-family: var(--font-sans);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.6875rem;
  color: var(--ink-dim);
}

.mx-btn {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink);
  background: var(--panel-2);
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}
.mx-btn:hover:not(:disabled) { border-color: var(--trace); }
.mx-btn:disabled { opacity: 0.5; cursor: progress; }

/* ---- app shell ---- */
.mx-app { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; position: relative; }

.mx-topbar {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 1rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--rule);
  flex: none; background: var(--panel);
}
.mx-build { color: var(--ink-dim); font-size: 0.75rem; }

/* ---- 3-pane explorer ---- */
.mx-panes {
  flex: 1; min-height: 0;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.2fr) minmax(360px, 2fr);
  background: var(--panel);
}
.mx-pane { min-height: 0; overflow-y: auto; border-right: 1px solid var(--rule); padding: 0.5rem 0; }
.mx-pane:last-child { border-right: 0; padding: 0.75rem 1rem; }
.mx-pane-head { padding: 0 0.75rem 0.5rem; position: sticky; top: 0; background: var(--panel); }

.mx-row {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  height: 32px; padding: 0 0.75rem; cursor: pointer;
  border-left: 2px solid transparent; color: var(--ink-dim);
}
.mx-row:hover { background: var(--panel-2); }
.mx-row[aria-selected="true"] { border-left-color: var(--trace); color: var(--ink); font-weight: 500; }
.mx-row--openapi { opacity: 0.55; font-style: italic; }

.mx-status { font-variant-numeric: tabular-nums; }
.mx-status--2 { color: var(--pass); }
.mx-status--4 { color: var(--divert); }
.mx-status--5 { color: var(--fault); }

/* ---- runner ---- */
.mx-code {
  background: var(--panel-2); border: 1px solid var(--rule); border-radius: 2px;
  padding: 0.6rem; white-space: pre; overflow-x: auto; font-size: 0.8125rem;
  color: var(--ink); width: 100%; font-family: var(--font-mono);
}
textarea.mx-code, input.mx-code { resize: vertical; }
textarea.mx-code { min-height: 4rem; }

.mx-verdict { margin-top: 0.75rem; font-size: 0.8125rem; }
.mx-verdict--hit { color: var(--pass); }
.mx-verdict--divert { color: var(--divert); }
.mx-verdict--fault, .mx-verdict--nomatch { color: var(--fault); }
.mx-verdict--unknown { color: var(--ink-dim); }
.mx-note { color: var(--divert); font-size: 0.75rem; margin-top: 0.25rem; }

/* ---- signal trace ---- */
.mx-trace-layer { position: fixed; inset: 0; pointer-events: none; z-index: 5; width: 100%; height: 100%; }

/* ---- monolith scene ---- */
.mx-scene { position: absolute; inset: 0; z-index: 0; }
.mx-scene--backdrop { opacity: 0.15; transition: opacity 0.6s ease; pointer-events: none; }
.mx-app > :not(.mx-scene) { position: relative; z-index: 1; }

/* ---- slab list fallback / orbit-phase keyboard list ---- */
.mx-slablist { display: flex; flex-wrap: wrap; gap: 0.75rem; padding: 2rem; align-content: flex-start; }
.mx-slab-card {
  width: 180px; min-height: 220px; background: var(--panel); border: 1px solid var(--rule);
  border-radius: 3px; padding: 1rem; cursor: pointer; display: flex; flex-direction: column;
  justify-content: space-between; color: var(--ink); text-align: left; font: inherit;
}
.mx-slab-card:hover { border-color: var(--trace); }
.mx-slablist--overlay { position: absolute; bottom: 0; left: 0; right: 0; background: transparent; z-index: 2; }
.mx-slablist--overlay .mx-slab-card { background: color-mix(in srgb, var(--panel) 75%, transparent); }

/* ---- responsive: drill stack under 960px ---- */
@media (max-width: 959px) {
  .mx-panes { grid-template-columns: 1fr; grid-auto-rows: min-content; }
  .mx-pane { border-right: 0; border-bottom: 1px solid var(--rule); }
  .mx-pane[data-collapsed="true"] { display: none; }
  .mx-crumbs { display: flex; gap: 0.4rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--rule); color: var(--ink-dim); flex-wrap: wrap; }
}
@media (min-width: 960px) { .mx-crumbs { display: none; } }

@media (prefers-reduced-motion: reduce) {
  .mx-scene--backdrop { transition: none; }
}
```

- [ ] **Step 5: Verify the gate still passes**

Run: `npm run check`
Expected: PASS. (`tsc` sees the new deps' types; `eslint` is clean; no new tests broke.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.mjs app/layout.tsx app/globals.css
git commit -m "$(cat <<'EOF'
chore(viewer): add three/r3f/drei, fonts, global stylesheet

Chivo + IBM Plex Mono via next/font. globals.css defines the
instrument-panel token set and .mx-* component classes.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 6: `<Explorer>` — 3-pane endpoint/case UI (runner stubbed)

**Files:**
- Create: `app/_explorer/ExplorerApp.tsx`, `app/_explorer/Explorer.tsx`, `app/_explorer/EndpointList.tsx`, `app/_explorer/CaseList.tsx`, `app/_explorer/SlabList.tsx`, `app/_explorer/Runner.tsx` (stub), `app/_explorer/status.ts`
- Test: `app/_explorer/status.test.ts`
- Modify (temporarily): `app/page.tsx`

**Interfaces:**
- Consumes: `ViewModel`, `ProjectVM`, `EndpointVM`, `CaseVM` from `@/src/viewer/model`.
- Produces:
  ```ts
  // status.ts
  export function statusClass(status: number): string;   // "mx-status--2" | "mx-status--4" | "mx-status--5" | "mx-status"
  // ExplorerApp.tsx
  export default function ExplorerApp({ model }: { model: ViewModel }): JSX.Element;
  // Explorer.tsx
  export function Explorer(props: {
    project: ProjectVM;
    projects: ProjectVM[];
    onPickProject: (slug: string) => void;
    onBackToOrbit: () => void;
  }): JSX.Element;
  // Runner.tsx  (stub — full version in Task 7)
  export function Runner(props: { case_: CaseVM }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test** (`app/_explorer/status.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { statusClass } from "./status";

describe("statusClass", () => {
  it("maps by hundreds digit", () => {
    expect(statusClass(200)).toBe("mx-status--2");
    expect(statusClass(404)).toBe("mx-status--4");
    expect(statusClass(500)).toBe("mx-status--5");
  });
  it("falls back to the base class for anything else", () => {
    expect(statusClass(101)).toBe("mx-status");
    expect(statusClass(302)).toBe("mx-status");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_explorer/status.test.ts`
Expected: FAIL — cannot resolve `./status`.

- [ ] **Step 3: Implement `status.ts`**

```ts
export function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "mx-status--2";
  if (status >= 400 && status < 500) return "mx-status--4";
  if (status >= 500 && status < 600) return "mx-status--5";
  return "mx-status";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_explorer/status.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the components**

`app/_explorer/Runner.tsx` (stub — replaced in full by Task 7):

```tsx
"use client";
import type { CaseVM } from "@/src/viewer/model";

export function Runner({ case_ }: { case_: CaseVM }) {
  return <pre className="mx-code">{case_.request.curl}</pre>;
}
```

`app/_explorer/EndpointList.tsx`:

```tsx
"use client";
import type { EndpointVM } from "@/src/viewer/model";

function lastSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function EndpointList({
  endpoints,
  selectedKey,
  onSelect,
}: {
  endpoints: EndpointVM[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div role="listbox" aria-label="Endpoints">
      {endpoints.map((e) => (
        <div
          key={e.key}
          role="option"
          tabIndex={0}
          aria-selected={e.key === selectedKey}
          className="mx-row"
          onClick={() => onSelect(e.key)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              onSelect(e.key);
            }
          }}
        >
          <span>
            {e.method} {lastSegment(e.path)}
          </span>
          <span className="mx-status">{e.cases.length}</span>
        </div>
      ))}
    </div>
  );
}
```

`app/_explorer/CaseList.tsx`:

```tsx
"use client";
import type { CaseVM } from "@/src/viewer/model";
import { statusClass } from "./status";

export function CaseList({
  cases,
  selectedId,
  onSelect,
  rowRef,
}: {
  cases: CaseVM[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  rowRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div role="listbox" aria-label="Cases">
      {cases.map((c) => (
        <div
          key={c.id}
          role="option"
          tabIndex={0}
          aria-selected={c.id === selectedId}
          ref={c.id === selectedId ? rowRef : undefined}
          className={`mx-row${c.isOpenApiGenerated ? " mx-row--openapi" : ""}`}
          onClick={() => onSelect(c.id)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              onSelect(c.id);
            }
          }}
        >
          <span>{c.label}</span>
          <span className={statusClass(c.expected.status)}>{c.expected.status}</span>
        </div>
      ))}
    </div>
  );
}
```

`app/_explorer/SlabList.tsx`:

```tsx
"use client";
import type { ProjectVM } from "@/src/viewer/model";

export function SlabList({
  projects,
  onSelect,
  overlay = false,
}: {
  projects: ProjectVM[];
  onSelect: (slug: string) => void;
  overlay?: boolean;
}) {
  if (projects.length === 0) {
    return (
      <p style={{ padding: "2rem", color: "var(--ink-dim)" }}>
        No projects configured. Add one under <code>mocks/</code>.
      </p>
    );
  }
  return (
    <div className={`mx-slablist${overlay ? " mx-slablist--overlay" : ""}`}>
      {projects.map((p) => (
        <button key={p.slug} className="mx-slab-card" onClick={() => onSelect(p.slug)}>
          <span className="mx-wordmark" style={{ fontSize: "1rem" }}>{p.name}</span>
          <span className="mx-build">
            {p.endpoints.length} endpoints · {p.caseCount} cases
            <br />
            <code>/m/{p.slug}</code>
          </span>
        </button>
      ))}
    </div>
  );
}
```

`app/_explorer/Explorer.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import type { ProjectVM } from "@/src/viewer/model";
import { EndpointList } from "./EndpointList";
import { CaseList } from "./CaseList";
import { Runner } from "./Runner";

function lastSeg(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function Explorer({
  project,
  projects,
  onPickProject,
  onBackToOrbit,
}: {
  project: ProjectVM;
  projects: ProjectVM[];
  onPickProject: (slug: string) => void;
  onBackToOrbit: () => void;
}) {
  const [endpointKey, setEndpointKey] = useState<string | null>(project.endpoints[0]?.key ?? null);
  const [caseId, setCaseId] = useState<string | null>(null);

  useEffect(() => {
    setEndpointKey(project.endpoints[0]?.key ?? null);
    setCaseId(null);
  }, [project.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const endpoint = project.endpoints.find((e) => e.key === endpointKey) ?? null;
  const activeCase = endpoint?.cases.find((c) => c.id === caseId) ?? null;
  const stage: 0 | 1 | 2 = activeCase ? 2 : endpoint ? 1 : 0;

  return (
    <>
      <div className="mx-topbar">
        <span className="mx-wordmark">MOCKSERVERS</span>
        <label className="mx-label">
          project{" "}
          <select
            value={project.slug}
            onChange={(e) => onPickProject(e.target.value)}
            style={{
              background: "var(--panel-2)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.slug}
              </option>
            ))}
          </select>
        </label>
        <button className="mx-btn" onClick={onBackToOrbit}>
          ⟲ orbit
        </button>
      </div>

      <div className="mx-crumbs">
        <span>{project.slug}</span>
        {endpoint && (
          <span>
            › {endpoint.method} {endpoint.path}
          </span>
        )}
        {activeCase && <span>› {activeCase.label}</span>}
      </div>

      <div className="mx-panes">
        <div className="mx-pane" data-collapsed={stage !== 0 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">Endpoints</div>
          <EndpointList
            endpoints={project.endpoints}
            selectedKey={endpointKey}
            onSelect={(k) => {
              setEndpointKey(k);
              setCaseId(null);
            }}
          />
        </div>

        <div className="mx-pane" data-collapsed={stage !== 1 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">
            Cases{endpoint ? ` · ${endpoint.method} ${lastSeg(endpoint.path)}` : ""}
          </div>
          {endpoint && (
            <CaseList
              cases={endpoint.cases}
              selectedId={caseId}
              onSelect={setCaseId}
              rowRef={() => {
                /* trace anchor wired in Task 8 */
              }}
            />
          )}
        </div>

        <div className="mx-pane" data-collapsed={stage !== 2 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">Runner</div>
          {activeCase ? (
            <Runner key={activeCase.id} case_={activeCase} />
          ) : (
            <p style={{ color: "var(--ink-dim)" }}>Pick a case to build and run its request.</p>
          )}
        </div>
      </div>
    </>
  );
}
```

`app/_explorer/ExplorerApp.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { ViewModel } from "@/src/viewer/model";
import { Explorer } from "./Explorer";
import { SlabList } from "./SlabList";

export default function ExplorerApp({ model }: { model: ViewModel }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const project = model.projects.find((p) => p.slug === selectedSlug) ?? null;

  return (
    <div className="mx-app">
      {project ? (
        <Explorer
          project={project}
          projects={model.projects}
          onPickProject={setSelectedSlug}
          onBackToOrbit={() => setSelectedSlug(null)}
        />
      ) : (
        <>
          <div className="mx-topbar">
            <span className="mx-wordmark">MOCKSERVERS</span>
            <span className="mx-build">
              build {model.build.commit} · {model.projects.length} project(s)
              {model.build.warnings.length > 0 && ` · ${model.build.warnings.length} warning(s)`}
            </span>
          </div>
          <SlabList projects={model.projects} onSelect={setSelectedSlug} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire into `app/page.tsx` (temporary — finalized in Task 10)**

```tsx
import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";
import { buildViewModel } from "@/src/viewer/model";
import ExplorerApp from "@/app/_explorer/ExplorerApp";

export default function Viewer() {
  const model = buildViewModel(bundleJson as unknown as CompiledBundle);
  return <ExplorerApp model={model} />;
}
```

- [ ] **Step 7: Run the gate**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Manual verification**

`npm run dev`, open `http://localhost:3000`:
- [ ] Slab cards list `card-block-lost` with `5 endpoints · N cases`.
- [ ] Click it → 3-pane explorer; endpoints list shows 5 rows with case counts.
- [ ] Click an endpoint → cases pane fills; status codes coloured green/amber/red.
- [ ] Click a case → curl string in the runner pane (stub).
- [ ] Project dropdown + "⟲ orbit" return to the slab list.
- [ ] Tab focus shows a brass ring; Enter/Space selects a row.
- [ ] Narrow to < 960px → single-column drill stack with a breadcrumb bar.

- [ ] **Step 9: Commit**

```bash
git add app/_explorer app/page.tsx
git commit -m "$(cat <<'EOF'
feat(viewer): 3-pane explorer — endpoints, cases, selection

ExplorerApp owns project selection; Explorer renders the endpoint/case
lists with keyboard nav and a responsive drill stack. Runner is a stub
(curl dump) until the next task.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 7: `<Runner>` — edit, execute, response, verdict

**Files:**
- Replace: `app/_explorer/Runner.tsx` (the Task 6 stub)
- Create: `app/_explorer/format.ts`
- Test: `app/_explorer/format.test.ts`

**Interfaces:**
- Consumes: `CaseVM` from `@/src/viewer/model`; `classifyResult`, `Verdict` from `@/src/viewer/verdict`; `statusClass` from `./status`.
- Produces:
  ```ts
  // format.ts
  export function prettyBody(text: string): string;               // pretty JSON if parseable, else text unchanged
  export function renderCurl(curl: string): string;               // "$ORIGIN" -> window.location.origin
  export function verdictText(v: Verdict): { text: string; cls: string };
  export function parseHeaderLines(text: string): Record<string, string>;
  // Runner.tsx
  export function Runner(props: {
    case_: CaseVM;
    requestBlockRef?: (el: HTMLElement | null) => void;   // used by Task 8
    onExecuted?: () => void;                              // used by Task 8
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test** (`app/_explorer/format.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { parseHeaderLines, prettyBody, verdictText } from "./format";

describe("prettyBody", () => {
  it("pretty-prints JSON", () => {
    expect(prettyBody('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
  it("returns non-JSON unchanged", () => {
    expect(prettyBody("<html>nope")).toBe("<html>nope");
  });
});

describe("verdictText", () => {
  it("labels each verdict kind with a class", () => {
    expect(verdictText({ kind: "hit", caseId: "x" })).toEqual({ text: "✓ matched case: x", cls: "mx-verdict--hit" });
    expect(verdictText({ kind: "divert", landedOn: "y" }).cls).toBe("mx-verdict--divert");
    expect(verdictText({ kind: "nomatch" }).cls).toBe("mx-verdict--nomatch");
    expect(verdictText({ kind: "unknown" }).cls).toBe("mx-verdict--unknown");
  });
});

describe("parseHeaderLines", () => {
  it("parses `k: v` lines, lowercasing keys, ignoring blanks", () => {
    expect(parseHeaderLines("Content-Type: application/json\n\nX-Tenant: acme")).toEqual({
      "content-type": "application/json",
      "x-tenant": "acme",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_explorer/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Implement `format.ts`**

```ts
import type { Verdict } from "@/src/viewer/verdict";

export function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function renderCurl(curl: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "$ORIGIN";
  return curl.split("$ORIGIN").join(origin);
}

export function verdictText(v: Verdict): { text: string; cls: string } {
  switch (v.kind) {
    case "hit":
      return { text: `✓ matched case: ${v.caseId}`, cls: "mx-verdict--hit" };
    case "divert":
      return { text: `→ landed on: ${v.landedOn}`, cls: "mx-verdict--divert" };
    case "nomatch":
      return { text: "→ no route matched (fell through to notFound)", cls: "mx-verdict--nomatch" };
    case "unknown":
      return { text: "· could not confirm which case matched", cls: "mx-verdict--unknown" };
  }
}

export function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_explorer/format.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement `Runner.tsx` (full replacement of the stub)**

```tsx
"use client";
import { useMemo, useState } from "react";
import type { CaseVM } from "@/src/viewer/model";
import { classifyResult, type Verdict } from "@/src/viewer/verdict";
import { parseHeaderLines, prettyBody, renderCurl, verdictText } from "./format";
import { statusClass } from "./status";

interface RunResult {
  status: number;
  ms: number;
  headers: [string, string][];
  bodyText: string;
  verdict: Verdict;
}

function headersToText(h: Record<string, string>): string {
  return Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function Runner({
  case_,
  requestBlockRef,
  onExecuted,
}: {
  case_: CaseVM;
  requestBlockRef?: (el: HTMLElement | null) => void;
  onExecuted?: () => void;
}) {
  const draft = case_.request;
  const [method, setMethod] = useState(draft.method);
  const [url, setUrl] = useState(draft.url);
  const [headersText, setHeadersText] = useState(headersToText(draft.headers));
  const [body, setBody] = useState(draft.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const curl = useMemo(() => renderCurl(draft.curl), [draft.curl]);

  function reset() {
    setMethod(draft.method);
    setUrl(draft.url);
    setHeadersText(headersToText(draft.headers));
    setBody(draft.body ?? "");
    setResult(null);
    setError(null);
  }

  async function execute() {
    setBusy(true);
    setError(null);
    setResult(null);
    const noBody = ["GET", "HEAD"].includes(method) || body.trim() === "";
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers: parseHeaderLines(headersText),
        body: noBody ? undefined : body,
      });
      const ms = Math.round(performance.now() - started);
      const bodyText = await res.text();
      setResult({
        status: res.status,
        ms,
        headers: [...res.headers.entries()],
        bodyText,
        verdict: classifyResult(res.headers, res.status, bodyText, { id: case_.id, expected: case_.expected }),
      });
      onExecuted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div ref={requestBlockRef}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="mx-code"
            style={{ width: "auto" }}
            aria-label="Request method"
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="mx-code" aria-label="Request URL" />
        </div>

        <div className="mx-label">headers</div>
        <textarea
          className="mx-code"
          rows={2}
          value={headersText}
          onChange={(e) => setHeadersText(e.target.value)}
          aria-label="Request headers"
        />

        <div className="mx-label" style={{ marginTop: "0.5rem" }}>
          body
        </div>
        <textarea
          className="mx-code"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Request body"
        />

        {case_.request.notes.map((n) => (
          <div key={n} className="mx-note">
            ⚠ {n}
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.75rem 0" }}>
          <button className="mx-btn" onClick={execute} disabled={busy}>
            {busy ? "running…" : "execute"}
          </button>
          <button className="mx-btn" onClick={reset} disabled={busy}>
            reset to case
          </button>
          <button className="mx-btn" onClick={() => void navigator.clipboard?.writeText(curl)}>
            copy curl
          </button>
          {result && <span className="mx-build">⧗ {result.ms} ms</span>}
        </div>
      </div>

      <details>
        <summary className="mx-label">curl</summary>
        <pre className="mx-code">{curl}</pre>
      </details>

      {error && (
        <div className="mx-verdict mx-verdict--fault" role="alert">
          ✗ request failed: {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "0.75rem" }}>
          <div className="mx-label">
            response <span className={statusClass(result.status)}>{result.status}</span>
          </div>
          <pre className="mx-code">{prettyBody(result.bodyText)}</pre>
          <details>
            <summary className="mx-label">response headers</summary>
            <pre className="mx-code">{result.headers.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
          </details>
          <VerdictLine verdict={result.verdict} />
        </div>
      )}
    </div>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict }) {
  const { text, cls } = verdictText(verdict);
  return <div className={`mx-verdict ${cls}`}>{text}</div>;
}
```

- [ ] **Step 6: Run the gate**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Manual verification**

`npm run dev`, drill to `card-block-lost` → `GET_CARD` → `locate-card-not-found`:
- [ ] Body textarea shows the merged example with `cardLast4` set to `0001`.
- [ ] `execute` → response `404` amber, body `{ "reason": "CARD_NOT_FOUND" }`, latency shown.
- [ ] Verdict `✓ matched case: locate-card-not-found` in green.
- [ ] Edit body to `{"cardLast4":"0002"}`, execute → `500` red, verdict `→ landed on: locate-card-service-down` amber.
- [ ] "copy curl" → clipboard has a runnable command with the real origin.
- [ ] Stop the dev server, execute → red `✗ request failed: …`, no silent hang.
- [ ] A case with a `notes` entry (none in the current repo — force one by temporarily adding a `regex` match rule in `mocks/` and recompiling, then revert) shows the `⚠` note.

- [ ] **Step 8: Commit**

```bash
git add app/_explorer/Runner.tsx app/_explorer/format.ts app/_explorer/format.test.ts
git commit -m "$(cat <<'EOF'
feat(viewer): runner — edit request, execute, classify the result

Editable method/url/headers/body, same-origin fetch, pretty response,
latency, and a hit/divert/nomatch verdict from classifyResult.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 8: `<SignalTrace>` — brass connector, case row → runner

**Files:**
- Create: `app/_explorer/SignalTrace.tsx`, `app/_explorer/trace.ts`
- Test: `app/_explorer/trace.test.ts`
- Modify: `app/_explorer/Explorer.tsx` (hold the two anchor elements + a pulse counter, render `<SignalTrace>`)

**Interfaces:**
- Consumes: two `DOMRect`s.
- Produces:
  ```ts
  // trace.ts
  export function elbowPath(from: DOMRect, to: DOMRect): string;   // SVG path "d", two 90° elbows
  // SignalTrace.tsx
  export function SignalTrace(props: {
    fromEl: HTMLElement | null;
    toEl: HTMLElement | null;
    pulseKey: number;
  }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test** (`app/_explorer/trace.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { elbowPath } from "./trace";

const rect = (x: number, y: number, w = 100, h = 32): DOMRect =>
  ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;

describe("elbowPath", () => {
  it("starts at the right-mid of `from` and ends at the left-mid of `to`", () => {
    const d = elbowPath(rect(0, 100), rect(400, 300));
    expect(d.startsWith("M 100 116 ")).toBe(true);
    expect(d.endsWith(" 400 316")).toBe(true);
  });
  it("routes through a vertical mid-gutter (3 line segments)", () => {
    const d = elbowPath(rect(0, 100), rect(400, 300));
    expect((d.match(/L /g) ?? []).length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_explorer/trace.test.ts`
Expected: FAIL — cannot resolve `./trace`.

- [ ] **Step 3: Implement `trace.ts`**

```ts
/** SVG path from the right edge of `from` to the left edge of `to`, with two 90-degree elbows through a mid gutter. */
export function elbowPath(from: DOMRect, to: DOMRect): string {
  const x1 = from.right;
  const y1 = from.top + from.height / 2;
  const x2 = to.left;
  const y2 = to.top + to.height / 2;
  const midX = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_explorer/trace.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `SignalTrace.tsx`**

```tsx
"use client";
import { useLayoutEffect, useState } from "react";
import { elbowPath } from "./trace";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function SignalTrace({
  fromEl,
  toEl,
  pulseKey,
}: {
  fromEl: HTMLElement | null;
  toEl: HTMLElement | null;
  pulseKey: number;
}) {
  const [d, setD] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!fromEl || !toEl) {
      setD(null);
      return;
    }
    const recompute = () => setD(elbowPath(fromEl.getBoundingClientRect(), toEl.getBoundingClientRect()));
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [fromEl, toEl]);

  if (!d) return null;

  return (
    <svg className="mx-trace-layer" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--trace)" strokeWidth={1} strokeOpacity={0.5} />
      {!reducedMotion() && (
        <path
          key={pulseKey}
          d={d}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="90 4000"
          style={{ filter: "drop-shadow(0 0 3px var(--ink))" }}
        >
          <animate attributeName="stroke-dashoffset" from="90" to="-4000" dur="0.45s" begin="0s" fill="freeze" />
          <animate attributeName="opacity" from="1" to="0" dur="0.5s" begin="0.4s" fill="freeze" />
        </path>
      )}
    </svg>
  );
}
```

- [ ] **Step 6: Wire into `Explorer.tsx`**

Add near the top of `Explorer`:

```tsx
import { SignalTrace } from "./SignalTrace";
// ...
const [caseEl, setCaseEl] = useState<HTMLElement | null>(null);
const [runnerEl, setRunnerEl] = useState<HTMLElement | null>(null);
const [pulseKey, setPulseKey] = useState(0);
```

- Pass `rowRef={setCaseEl}` to `<CaseList>` (replace the empty `rowRef` stub from Task 6).
- Pass `requestBlockRef={setRunnerEl}` and `onExecuted={() => setPulseKey((k) => k + 1)}` to `<Runner>`.
- Render, as the last child of the returned fragment:

```tsx
<SignalTrace fromEl={caseEl} toEl={runnerEl} pulseKey={pulseKey} />
```

- When `caseId` becomes `null` (endpoint change), also `setCaseEl(null)` so a stale anchor doesn't linger — do this in the endpoint `onSelect` handler and the `useEffect` that resets on project change.

- [ ] **Step 7: Run the gate**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Manual verification** (≥ 960px)

- [ ] A faint brass line with square corners links the selected case row to the runner request block.
- [ ] It tracks the row on cases-pane scroll and on window resize.
- [ ] `execute` sends a brief light pulse along the line.
- [ ] Emulate `prefers-reduced-motion` → static line only, no pulse.
- [ ] < 960px drill stack → no trace, no console errors (anchors not co-mounted).

- [ ] **Step 9: Commit**

```bash
git add app/_explorer
git commit -m "$(cat <<'EOF'
feat(viewer): signal trace — brass connector from case to runner

SVG elbow path anchored to the selected case row and the runner
request block; one-shot light pulse on execute; static under
prefers-reduced-motion.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 9: `<Monolith>` — WebGL project ring

**Files:**
- Create: `app/_explorer/Monolith.tsx`, `app/_explorer/Slab.tsx`, `app/_explorer/useSupports3D.ts`
- Modify: `app/_explorer/ExplorerApp.tsx`

**Interfaces:**
- Consumes: `ProjectVM[]` from `@/src/viewer/model`.
- Produces:
  ```ts
  // useSupports3D.ts
  export function useSupports3D(): boolean;   // false during SSR, no-WebGL, prefers-reduced-motion, or < 960px
  // Monolith.tsx  (DEFAULT export — loaded via next/dynamic { ssr: false })
  export default function Monolith(props: {
    projects: ProjectVM[];
    activeSlug: string | null;
    onSelect: (slug: string) => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: `useSupports3D.ts`** (browser-only APIs — verified by the manual checklist, no unit test)

```ts
"use client";
import { useEffect, useState } from "react";

function probe(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.matchMedia?.("(max-width: 959px)").matches) return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

export function useSupports3D(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const update = () => setOk(probe());
    update();
    const mq = window.matchMedia("(max-width: 959px)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return ok;
}
```

- [ ] **Step 2: `Slab.tsx`**

```tsx
"use client";
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import type { ProjectVM } from "@/src/viewer/model";

export function Slab({
  project,
  position,
  active,
  onSelect,
}: {
  project: ProjectVM;
  position: [number, number, number];
  active: boolean;
  onSelect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const scratch = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    if (!group.current) return;
    const s = hover || active ? 1.04 : 1;
    group.current.scale.lerp(scratch.current.set(s, s, s), 1 - Math.pow(0.0001, dt));
  });

  const emissiveIntensity = active ? 0.28 : hover ? 0.16 : 0;
  const yaw = Math.atan2(position[0], position[2]);

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, yaw, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <RoundedBox args={[1.3, 2, 0.18]} radius={0.03} smoothness={4}>
        <meshStandardMaterial
          color="#2A2622"
          roughness={0.6}
          metalness={0.35}
          emissive="#C9A15E"
          emissiveIntensity={emissiveIntensity}
        />
      </RoundedBox>
      <Text position={[0, 0.2, 0.1]} fontSize={0.13} maxWidth={1.05} textAlign="center" anchorX="center" anchorY="middle" color="#E8E2D9">
        {project.name}
      </Text>
      <Text
        position={[0, -0.2, 0.1]}
        fontSize={0.075}
        maxWidth={1.05}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color="#8A8177"
      >
        {`${project.endpoints.length} ENDPOINTS · ${project.caseCount} CASES`}
      </Text>
      <mesh position={[-0.5, -0.82, 0.1]}>
        <planeGeometry args={[0.05, 0.05]} />
        <meshStandardMaterial color="#C9A15E" emissive="#C9A15E" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
    </group>
  );
}
```

> drei `<Text>` uses its bundled default font (no network fetch). Self-hosting IBM Plex Mono for the slab labels is spec §13 follow-up, not this task.

- [ ] **Step 3: `Monolith.tsx`**

```tsx
"use client";
import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { ProjectVM } from "@/src/viewer/model";
import { Slab } from "./Slab";

function ringPositions(count: number): [number, number, number][] {
  const radius = Math.max(2.4, count * 0.5);
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(count, 1)) * Math.PI * 2;
    out.push([Math.sin(a) * radius, 0, Math.cos(a) * radius]);
  }
  return out;
}

function CameraRig({
  activeIndex,
  positions,
}: {
  activeIndex: number;
  positions: [number, number, number][];
}) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.001, dt);
    const active = activeIndex >= 0 ? positions[activeIndex] : undefined;
    if (active) {
      desired.set(active[0] * 0.55, 0.6, active[2] * 0.55);
      lookAt.set(active[0], 0, active[2]);
    } else {
      desired.set(0, 1.5, 7);
      lookAt.set(0, 0, 0);
    }
    camera.position.lerp(desired, k);
    if (controls.current) {
      controls.current.target.lerp(lookAt, k);
      controls.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableZoom={false}
      autoRotate={activeIndex < 0}
      autoRotateSpeed={0.6}
      minPolarAngle={Math.PI / 3}
      maxPolarAngle={Math.PI / 1.8}
    />
  );
}

export default function Monolith({
  projects,
  activeSlug,
  onSelect,
}: {
  projects: ProjectVM[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const positions = useMemo(() => ringPositions(projects.length), [projects.length]);
  const activeIndex = projects.findIndex((p) => p.slug === activeSlug);

  return (
    <Canvas dpr={[1, 1.75]} gl={{ antialias: true }} camera={{ position: [0, 1.5, 7], fov: 45 }}>
      <color attach="background" args={["#12100E"]} />
      <ambientLight color="#20263A" intensity={0.4} />
      <directionalLight color="#FFECD8" intensity={1.2} position={[3, 4, 5]} />
      <pointLight color="#FFECD8" intensity={0.3} position={[0, 2, -6]} />
      {projects.map((p, i) => (
        <Slab
          key={p.slug}
          project={p}
          position={positions[i]!}
          active={p.slug === activeSlug}
          onSelect={() => onSelect(p.slug)}
        />
      ))}
      <CameraRig activeIndex={activeIndex} positions={positions} />
    </Canvas>
  );
}
```

> `three-stdlib` is a transitive dependency of `@react-three/drei` — importing the `OrbitControls` type from it needs no new package. If `tsc` cannot resolve it, fall back to `useRef<any>(null)` with `// eslint-disable-next-line @typescript-eslint/no-explicit-any`.

- [ ] **Step 4: Rewrite `ExplorerApp.tsx`**

```tsx
"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { ViewModel } from "@/src/viewer/model";
import { Explorer } from "./Explorer";
import { SlabList } from "./SlabList";
import { useSupports3D } from "./useSupports3D";

const Monolith = dynamic(() => import("./Monolith"), { ssr: false });

export default function ExplorerApp({ model }: { model: ViewModel }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const supports3D = useSupports3D();
  const project = model.projects.find((p) => p.slug === selectedSlug) ?? null;
  const phase: "orbit" | "explore" = project ? "explore" : "orbit";
  const has3D = supports3D && model.projects.length > 0;

  return (
    <div className="mx-app">
      {has3D && (
        <div className={`mx-scene${phase === "explore" ? " mx-scene--backdrop" : ""}`}>
          <Monolith projects={model.projects} activeSlug={selectedSlug} onSelect={setSelectedSlug} />
        </div>
      )}

      {phase === "explore" && project ? (
        <Explorer
          project={project}
          projects={model.projects}
          onPickProject={setSelectedSlug}
          onBackToOrbit={() => setSelectedSlug(null)}
        />
      ) : (
        <>
          <div
            className="mx-topbar"
            style={has3D ? { background: "transparent", borderBottom: 0 } : undefined}
          >
            <span className="mx-wordmark">MOCKSERVERS</span>
            <span className="mx-build">
              build {model.build.commit} · {model.projects.length} project(s)
              {has3D && " · drag to orbit · click a slab"}
            </span>
          </div>
          {/* Always render a keyboard-reachable project list in orbit phase:
              as the sole UI when there is no 3D, or as a translucent overlay over the canvas. */}
          <SlabList projects={model.projects} onSelect={setSelectedSlug} overlay={has3D} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the gate**

Run: `npm run check`
Expected: PASS. Apply the `three-stdlib` / `any` fallback if `tsc` or `eslint` complains about the `OrbitControls` ref type.

- [ ] **Step 6: Manual verification** (≥ 960px, WebGL on)

- [ ] A dark slab sits in 3D space, slowly auto-rotating, labelled with the project name + `N ENDPOINTS · M CASES`, small brass glow dot.
- [ ] Drag orbits (no zoom, no pan, clamped so you can't flip over/under).
- [ ] Hover → slight scale-up + brass edge glow, pointer cursor.
- [ ] Translucent project cards are visible at the bottom over the canvas and are Tab-focusable; clicking a card or a slab both drill in.
- [ ] Click → camera dollies toward the slab, scene dims to a backdrop, 3-pane explorer appears in front, text crisp.
- [ ] "⟲ orbit" → camera pulls back, explorer unmounts.
- [ ] Emulate `prefers-reduced-motion` → reload → no canvas, `SlabList` only, explorer works.
- [ ] Resize < 960px → canvas gone, drill stack; ≥ 960px → canvas back.
- [ ] Disable WebGL → `SlabList` fallback, no console errors.

- [ ] **Step 7: Commit**

```bash
git add app/_explorer
git commit -m "$(cat <<'EOF'
feat(viewer): monolith — WebGL ring of project slabs

react-three-fiber scene, lazy-loaded (ssr:false), one slab per
project, damped orbit, camera dolly on drill-in, scene recedes to a
backdrop in explore phase. Falls back to SlabList on no-WebGL,
reduced-motion, or < 960px; a translucent keyboard-reachable project
list always renders in orbit phase.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

---

## Task 10: finalize `app/page.tsx`, polish, build verification, PR

**Files:**
- Modify: `app/page.tsx` (final form), `app/globals.css` (any tweaks found during polish)

**Interfaces:**
- Consumes: `buildViewModel`, `ExplorerApp`.
- Produces: the final `/` route + the PR.

- [ ] **Step 1: Final `app/page.tsx`**

```tsx
import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";
import { buildViewModel } from "@/src/viewer/model";
import ExplorerApp from "@/app/_explorer/ExplorerApp";

export const metadata = {
  title: "mockservers — explorer",
};

export default function ViewerPage() {
  const model = buildViewModel(bundleJson as unknown as CompiledBundle);
  return (
    <>
      <noscript>
        <div style={{ padding: "1rem", fontFamily: "monospace" }}>
          The explorer and request runner need JavaScript. Configured projects:
          <ul>
            {model.projects.map((p) => (
              <li key={p.slug}>
                <code>/m/{p.slug}</code> — {p.name} ({p.endpoints.length} endpoints, {p.caseCount} cases)
              </li>
            ))}
          </ul>
        </div>
      </noscript>
      <ExplorerApp model={model} />
    </>
  );
}
```

- [ ] **Step 2: Accessibility + polish pass** — verify each, fix inline:

- [ ] Every interactive element (rows, buttons, selects, textareas, `<summary>`) shows the brass `:focus-visible` ring.
- [ ] Both `listbox` containers have `aria-label`; every `option` has `aria-selected`; Tab reaches them.
- [ ] Keyboard-only path to the explorer exists in every mode: `SlabList` cards are focusable in orbit phase (overlay when 3D, sole UI otherwise); the project `<select>` switches projects in explore phase.
- [ ] Verdict text always carries a glyph (`✓` / `→` / `·` / `✗`) plus words — never colour alone.
- [ ] `prefers-reduced-motion` end to end: no auto-rotate, no camera dolly, no trace pulse.
- [ ] Explorer panes are opaque (`--panel`) so backdrop bleed never touches text; only inter-pane gaps show the scene.
- [ ] Long JSON / long paths scroll inside `.mx-code` (`overflow-x: auto`) — the page body never scrolls sideways.

- [ ] **Step 3: Full gate + production build**

```bash
npm run check
npm run build
```
Both PASS. In the build output, confirm `three` / `@react-three/*` sit in an async chunk (the `Monolith` dynamic import), not in the `/` entry.

- [ ] **Step 4: Manual smoke on the production build**

```bash
npm run start
```
Run orbit → slab → endpoint → case → execute → verdict, on desktop and < 960px. No hydration warnings in the console.

- [ ] **Step 5: Commit + open PR**

```bash
git add app/page.tsx app/globals.css app/_explorer
git commit -m "$(cat <<'EOF'
feat(viewer): replace static table with the 3D explorer at /

Final page wiring, noscript project list, accessibility pass.

Claude-Session: https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
git push -u origin feat/viewer-3d-explorer
gh pr create --base main --title "feat(viewer): 3D explorer + inline runner" --body "$(cat <<'EOF'
Replaces the static table viewer at `/` with a WebGL project ring, a
nested endpoint/case explorer, and a browser-side curl runner that
reports which mock route each request actually hit.

Spec: docs/specs/2026-08-29-mockservers-viewer-3d-design.md
Plan: docs/plans/2026-08-29-mockservers-viewer-3d-explorer.md

- pure, tested: src/viewer/{curl,model,verdict}.ts
- one backend change: app/m/[...slug]/route.ts emits x-mock-rule-id
- three/@react-three-fiber/drei load only in the lazy Monolith chunk

https://claude.ai/code/session_01RDSQL8667nCmoHkGKmP5m9
EOF
)"
```

- [ ] **Step 6: Verify the Vercel preview**

On the preview URL, run the runner against the real deployed `/m/*` routes: confirm `✓ matched case` for a known case and `→ landed on` after editing the body to hit a sibling route. This is the only check of the same-origin `fetch` + `x-mock-rule-id` header in the deployed environment.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 architecture (server model + 2 client islands) | 2, 6, 9 |
| §3.1 file layout | all UI tasks; `theme.css` consolidated into `app/globals.css` (Global Constraints) |
| §4 data model | 2 |
| §4.1 grouping rules | 2 |
| §5 request synthesis | 1 |
| §6.1 runner execute | 7 |
| §6.2 verdict | 3 |
| §6.2 backend `x-mock-rule-id` header | 4 |
| §7.1 type (Chivo + Plex Mono) | 5 |
| §7.2 palette | 5 |
| §7.3 layout (3-pane grid, rows, status) | 5 (CSS) + 6 (markup) |
| §7.4 signature signal traces | 8 |
| §7.5 3D scene detail | 9 |
| §7.6 styling mechanism (`.mx-*`, no framework) | 5 |
| §8 responsive drill stack | 5 (CSS) + 6 |
| §8 a11y / keyboard / focus | 6, 9, 10 |
| §8 reduced-motion | 8, 9, 10 |
| §9 error table — fetch rejects, non-JSON body | 7 |
| §9 error table — operator can't render | 1 |
| §9 error table — header absent | 3 |
| §9 error table — no WebGL / < 960px / reduced-motion | 9 |
| §9 error table — 0 projects | 6 (`SlabList` empty state) |
| §9 error table — endpoint 0 non-openapi cases | 2 (kept + de-emphasised) + 6 (`mx-row--openapi`) |
| §9 error table — project no `openApiDoc` | 2 (test covers it) |
| §10 testing (pure modules) | 1, 2, 3, 4, 6, 7, 8 |
| §11 dependencies | 5 |
| §12 rollout | 10 |

**Accepted narrowings** (called out so the executor knows they were deliberate, not missed):
- Spec §10's single RTL smoke test is dropped — see Global Constraints. All logic it would touch is extracted into `format.ts` / `status.ts` / `trace.ts` and unit-tested.
- Spec §9 "WebGL context lost mid-session" — `useSupports3D` gates the initial mount; a live context-loss error boundary around `<Canvas>` is a cheap follow-up, not a task here (rare on a static scene).
- Spec §3.1 separate `theme.css` → one `app/globals.css` (fewer files; Next global-CSS rules are simplest from the layout).

**2. Placeholder scan** — none. Every code step carries real code. The one intentional stub (`Runner.tsx` in Task 6) is shown in full and explicitly replaced in full in Task 7.

**3. Type consistency**
- `synthesizeRequest(input: SynthInput): RequestDraft` — identical in Tasks 1, 2.
- `RequestDraft` fields (`method, url, headers, body?, curl, notes`) — consumed consistently in Task 7 (`draft.method`, `draft.headers`, `draft.body`, `draft.curl`, `case_.request.notes`).
- `CaseVM` (`id, label, isOpenApiGenerated, match, expected, request`) — Tasks 2, 6, 7, 8.
- `classifyResult(headers, status, bodyText, { id, expected })` — Task 3 signature; Task 7 calls `classifyResult(res.headers, res.status, bodyText, { id: case_.id, expected: case_.expected })` ✓.
- `Runner` prop name `case_` (trailing underscore, since `case` is reserved) — Tasks 6, 7, 8.
- `Runner` optional props `requestBlockRef`, `onExecuted` — declared in Task 7, wired in Task 8.
- `CaseList` prop `rowRef: (el: HTMLElement | null) => void` — Task 6 (empty impl) → Task 8 (`setCaseEl`).
- `elbowPath(from: DOMRect, to: DOMRect): string` — Task 8 test and impl match; `SignalTrace` calls it with `getBoundingClientRect()` results.
- `Monolith` is a **default** export; `ExplorerApp` loads it via `dynamic(() => import("./Monolith"), { ssr: false })` — Task 9.
- `useSupports3D(): boolean` — Task 9 declares and consumes.
- `statusClass(status: number): string` — Task 6 declares; Tasks 6 (`CaseList`) and 7 (`Runner`) consume.

Fixed inline while reviewing: Task 8's trace anchors are owned entirely by `Explorer` (which renders `<SignalTrace>` itself) — `ExplorerApp` threads no case-row ref, matching Task 9's `ExplorerApp` which has no such prop. The Task 6 `Explorer` `rowRef={() => {}}` placeholder is replaced by `rowRef={setCaseEl}` in Task 8.
