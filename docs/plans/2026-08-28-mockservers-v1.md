# mockservers v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hosted HTTP mock-API server that serves configurable mock endpoints for many independent projects, where each project is defined by files in this repo and deployed to Vercel at `mockservers.dailyuze.com`.

**Architecture:** A single Next.js (App Router, TypeScript) app. A build step compiles `mocks/<slug>/` YAML + OpenAPI files into one `mocks.generated.json` bundled into the deployment. A pure engine (`src/engine/`) resolves an incoming request against one project's routes with zero I/O. A catch-all route `app/m/[...slug]/route.ts` is a thin adapter over the engine. Invalid mock config fails the build.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5, `zod` (config validation), `yaml` (parsing), `@apidevtools/swagger-parser` (OpenAPI), `vitest` (tests), `tsx` (running TS build scripts), `eslint` + `eslint-config-next`.

## Global Constraints

- **Node >= 20.** Next.js 15 requires it; Vercel Hobby default runtime is Node 20/22.
- **Deploy target: Vercel Hobby (free).** No database, no KV, no paid add-ons. Function `maxDuration` <= 10s.
- **No runtime filesystem writes and no runtime I/O on the mock request path.** All mock config is compiled at build time into `mocks.generated.json` and imported as a module.
- **No arbitrary user JavaScript execution.** Templating is a fixed grammar only (see Task 4). No `eval`, no `Function`, no `vm`.
- **Repo-local git identity, never global:** `user.name = "Deepak Kolaparthi"`, `user.email = "KolaparthiDeepak@users.noreply.github.com"`. Already set. Never commit with any `@zeta.tech` identity.
- **Invalid mock configuration must fail the build** with a non-zero exit code and a clear message. Warnings print but do not fail.
- **Conventional Commits.** `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- **Bootstrap exception:** Tasks 1-12 land as commits directly on `main` (the repo is being bootstrapped and has no protection yet). After this plan is done, all further work is feature-branch + PR.
- **URL scheme:** mock requests are `https://mockservers.dailyuze.com/m/<slug>/<path>`. Path-based, not subdomain.
- Reserved path prefixes: a project route path starting with `/__` is a build ERROR. `/__mock/*` and `/m/<slug>/__spec` are engine-reserved.
- Spec: `docs/specs/2026-08-28-mockservers-design.md` — the authority for behavior. Read it before starting.

---

## File Structure

```
mockservers/
  package.json                        # scripts, deps
  tsconfig.json
  next.config.mjs
  vitest.config.ts
  eslint.config.mjs
  vercel.json
  .gitignore
  .env.example
  README.md
  docs/
    specs/2026-08-28-mockservers-design.md      (exists)
    plans/2026-08-28-mockservers-v1.md          (this file)
    mock-format.md                              (Task 12 — authoring reference)
  src/
    engine/
      types.ts        # ParsedRequest, ProjectConfig, Route, Segment, MatchCondition, MockResponse, ResolveResult
      match.ts        # compileSegments, matchPath, methodMatches, evalCondition, allMatch
      template.ts     # parseTemplate (build-time validate), renderTemplate, renderDeep
      resolve.ts      # resolve(req, project) => ResolveResult
      request.ts      # parseRequest(Request, subPath) => ParsedRequest   (Task 9)
    compile/
      schema.ts       # zod: projectYamlSchema, ruleSchema, ruleFileSchema
      compile.ts      # compileMocks(mocksDir) => { bundle, errors, warnings }
    openapi/
      expand.ts       # expandOpenApi(filePath) => { routes, warnings, mergedDoc }
  app/
    layout.tsx
    page.tsx                                 # viewer (Task 10; placeholder in Task 1)
    m/[...slug]/route.ts                     # mock request handler (adapter over engine)
    __mock/health/route.ts
    __mock/projects/route.ts
    m/[slug]/__spec/route.ts                 # see Task 10 routing note
  scripts/
    compile-cli.ts    # runs compileMocks, writes mocks.generated.json, exits non-zero on error
    new-project.mjs   # scaffold a mocks/<slug>/ skeleton
    check.mjs         # local gate: compile + tsc + eslint + vitest
  mocks/
    card-block-lost/
      project.yaml
      openapi/card-block-lost.yaml
      routes/customer.yaml
      routes/card.yaml
  mocks.generated.json                       # build artifact — git-ignored
```

**Reference source files** (in the work repo, read-only, for Task 11):
- `~/hub/hub-workflow-application/card-block-lost-mock-openapi.yaml`
- `~/hub/hub-workflow-application/card-block-lost-mock-server.js`
- `~/hub/hub-workflow-application/card-block-lost-api-docs.md`

---

## Task 1: Project scaffold — buildable empty Next.js app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `scripts/compile-cli.ts` (stub)
- Create: `src/engine/.gitkeep`

**Interfaces:**
- Produces: a Next.js app that builds clean; `npm test`, `npm run lint`, `npx tsc --noEmit` all runnable.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "mockservers",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "compile": "tsx scripts/compile-cli.ts",
    "postinstall": "tsx scripts/compile-cli.ts || true",
    "predev": "tsx scripts/compile-cli.ts",
    "dev": "next dev",
    "prebuild": "tsx scripts/compile-cli.ts",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "node scripts/check.mjs",
    "new-project": "node scripts/new-project.mjs"
  },
  "dependencies": {
    "next": "15.5.0",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "zod": "3.24.1",
    "yaml": "2.7.0",
    "@apidevtools/swagger-parser": "10.1.1"
  },
  "devDependencies": {
    "@types/node": "22.10.0",
    "@types/react": "19.1.0",
    "@types/react-dom": "19.1.0",
    "typescript": "5.7.3",
    "tsx": "4.19.2",
    "vitest": "2.1.8",
    "eslint": "9.17.0",
    "eslint-config-next": "15.5.0"
  }
}
```

Note: `postinstall` has `|| true` because on the very first `npm install` the `mocks/` dir may not exist. `prebuild` and `predev` do NOT tolerate failure.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": false,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
export default nextConfig;
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
});
```

- [ ] **Step 5: Create `eslint.config.mjs`**

```js
import next from "eslint-config-next";

export default [
  ...next,
  { ignores: [".next/**", "node_modules/**", "mocks.generated.json"] },
];
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
.next/
.vercel/
out/
mocks.generated.json
*.tsbuildinfo
.env*
!.env.example
.DS_Store
```

- [ ] **Step 7: Create `.env.example`**

```
# No environment variables are required for v1.
# Placeholder for future config (KV URLs, auth secrets).
```

- [ ] **Step 8: Create `app/layout.tsx`**

```tsx
import type { ReactNode } from "react";

export const metadata = {
  title: "mockservers",
  description: "Hosted, file-defined mock API server",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create `app/page.tsx` (temporary placeholder — Task 10 replaces it)**

```tsx
export default function Home() {
  return <main style={{ fontFamily: "system-ui", padding: 24 }}>mockservers</main>;
}
```

- [ ] **Step 10: Create `src/engine/.gitkeep`** (empty file)

- [ ] **Step 11: Create a stub `scripts/compile-cli.ts` so `prebuild` does not crash**

```ts
// Replaced fully in Task 7. Stub: writes an empty bundle so `next build` succeeds pre-engine.
import { writeFileSync } from "node:fs";

const stub = { builtAt: new Date().toISOString(), commit: "dev", warnings: [], projects: {} };
writeFileSync("mocks.generated.json", JSON.stringify(stub, null, 2));
console.log("[compile] wrote stub mocks.generated.json (Task 7 replaces this)");
```

- [ ] **Step 12: Install and build**

Run:
```bash
cd ~/personal-projects/mockservers
npm install
npm run build
```
Expected: `npm install` completes; `npm run build` prints `[compile] wrote stub mocks.generated.json` then Next.js compiles successfully and finishes with `✓ Compiled successfully` / build output listing route `/`.

- [ ] **Step 13: Verify tooling runs**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test
```
Expected: `tsc` exits 0 (no output); `lint` reports no errors; `vitest` prints `No test files found` and exits 0.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app, tooling, and stub compile step"
```

---

## Task 2: Engine types + path segment matching

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/match.ts`
- Create: `src/engine/match.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`:
    ```ts
    export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
    export interface ParsedRequest {
      method: string;
      path: string;                          // subpath after /m/<slug>, always starts with "/"
      headers: Record<string, string>;       // lowercased keys
      query: Record<string, string>;
      body: unknown;                         // parsed JSON, or undefined if body absent/not JSON
      rawBody: string;
    }
    export type Segment =
      | { kind: "literal"; value: string }
      | { kind: "param"; name: string }
      | { kind: "wildcard" }                 // single segment "*"
      | { kind: "catchall" };                // trailing "**"
    export type Operator =
      | { equals: string } | { notEquals: string } | { contains: string }
      | { regex: string } | { exists: boolean };
    export type MatchCondition =
      | ({ jsonPath: string } & Operator)
      | ({ header: string } & Operator)
      | ({ query: string } & Operator);
    export interface MockResponse {
      status: number;
      headers?: Record<string, string>;
      body?: unknown;                        // object | string | null
    }
    export interface Route {
      id: string;
      method: HttpMethod | "*";
      path: string;                          // original, for diagnostics
      segments: Segment[];
      match?: MatchCondition[];
      response: MockResponse;
    }
    export interface ProjectConfig {
      name: string;
      slug: string;
      basePath?: string;
      defaults: {
        delayMs: number;
        cors: boolean;
        notFound: MockResponse;
      };
      routes: Route[];
      openApiDoc?: unknown;                  // merged OpenAPI, if any
    }
    export interface ResolveResult {
      status: number;
      headers: Record<string, string>;
      body: unknown;
      matchedRuleId: string | null;
      delayMs: number;
      warnings: string[];                    // runtime template warnings
    }
    ```
  - `match.ts`:
    ```ts
    export function compileSegments(path: string): Segment[]
    export function matchPath(segments: Segment[], requestPath: string):
      { matched: boolean; params: Record<string, string> }
    ```

- [ ] **Step 1: Write the failing test `src/engine/match.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { compileSegments, matchPath } from "./match";

describe("compileSegments", () => {
  it("splits a literal path", () => {
    expect(compileSegments("/a/b")).toEqual([
      { kind: "literal", value: "a" },
      { kind: "literal", value: "b" },
    ]);
  });
  it("parses :param, * and **", () => {
    expect(compileSegments("/users/:id/*/**")).toEqual([
      { kind: "literal", value: "users" },
      { kind: "param", name: "id" },
      { kind: "wildcard" },
      { kind: "catchall" },
    ]);
  });
  it("treats the root path as zero segments", () => {
    expect(compileSegments("/")).toEqual([]);
  });
});

describe("matchPath", () => {
  const seg = compileSegments("/commands/:machine/:cmd/v1");
  it("matches and extracts params", () => {
    expect(matchPath(seg, "/commands/acropolis/BLOCK_CARD/v1")).toEqual({
      matched: true,
      params: { machine: "acropolis", cmd: "BLOCK_CARD" },
    });
  });
  it("fails on segment-count mismatch", () => {
    expect(matchPath(seg, "/commands/acropolis/BLOCK_CARD").matched).toBe(false);
  });
  it("fails on literal mismatch", () => {
    expect(matchPath(seg, "/commands/acropolis/BLOCK_CARD/v2").matched).toBe(false);
  });
  it("wildcard matches exactly one segment", () => {
    const s = compileSegments("/a/*/c");
    expect(matchPath(s, "/a/x/c").matched).toBe(true);
    expect(matchPath(s, "/a/x/y/c").matched).toBe(false);
  });
  it("catchall matches the rest, including nothing", () => {
    const s = compileSegments("/a/**");
    expect(matchPath(s, "/a").matched).toBe(true);
    expect(matchPath(s, "/a/b/c/d").matched).toBe(true);
    expect(matchPath(s, "/b").matched).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run src/engine/match.test.ts`
Expected: FAIL — `Cannot find module './match'`.

- [ ] **Step 3: Create `src/engine/types.ts`** with the full contents from the Interfaces block above.

- [ ] **Step 4: Create `src/engine/match.ts` (path part only)**

```ts
import type { Segment } from "./types";

export function compileSegments(path: string): Segment[] {
  const parts = path.split("/").filter((p) => p.length > 0);
  return parts.map((p): Segment => {
    if (p === "**") return { kind: "catchall" };
    if (p === "*") return { kind: "wildcard" };
    if (p.startsWith(":")) return { kind: "param", name: p.slice(1) };
    return { kind: "literal", value: p };
  });
}

export function matchPath(
  segments: Segment[],
  requestPath: string,
): { matched: boolean; params: Record<string, string> } {
  const reqParts = requestPath.split("/").filter((p) => p.length > 0);
  const params: Record<string, string> = {};

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === "catchall") {
      return { matched: i === segments.length - 1, params };
    }
    const part = reqParts[i];
    if (part === undefined) return { matched: false, params };
    if (seg.kind === "literal") {
      if (seg.value !== part) return { matched: false, params };
    } else if (seg.kind === "param") {
      params[seg.name] = part;
    }
    // wildcard: any single part, no capture
  }
  return { matched: reqParts.length === segments.length, params };
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run src/engine/match.test.ts`
Expected: PASS — 3 `compileSegments` + 5 `matchPath` assertions green.

- [ ] **Step 6: Commit**

```bash
rm -f src/engine/.gitkeep
git add src/engine/types.ts src/engine/match.ts src/engine/match.test.ts
git commit -m "feat: engine types and URL path segment matching"
```

---

## Task 3: Match conditions and method matching

**Files:**
- Modify: `src/engine/match.ts` (append `methodMatches`, `resolveJsonPath`, `evalCondition`, `allMatch`)
- Modify: `src/engine/match.test.ts` (append condition tests)

**Interfaces:**
- Consumes: `ParsedRequest`, `MatchCondition` from `types.ts`.
- Produces:
  ```ts
  export function methodMatches(routeMethod: string, requestMethod: string): boolean
  export function resolveJsonPath(body: unknown, path: string): unknown   // "$.a.b[0]" style
  export function evalCondition(cond: MatchCondition, req: ParsedRequest): boolean
  export function allMatch(conds: MatchCondition[] | undefined, req: ParsedRequest): boolean
  ```

- [ ] **Step 1: Append failing tests to `src/engine/match.test.ts`**

```ts
import { allMatch, evalCondition, methodMatches, resolveJsonPath } from "./match";
import type { ParsedRequest } from "./types";

const req = (over: Partial<ParsedRequest> = {}): ParsedRequest => ({
  method: "POST",
  path: "/x",
  headers: { "x-tenant": "acme", "content-type": "application/json" },
  query: { page: "2" },
  body: { customerId: "cust-ok", card: { last4: "4242" }, tags: ["a", "b"] },
  rawBody: "",
  ...over,
});

describe("methodMatches", () => {
  it("exact and wildcard", () => {
    expect(methodMatches("POST", "POST")).toBe(true);
    expect(methodMatches("POST", "GET")).toBe(false);
    expect(methodMatches("*", "DELETE")).toBe(true);
  });
  it("is case-insensitive on the request method", () => {
    expect(methodMatches("POST", "post")).toBe(true);
  });
});

describe("resolveJsonPath", () => {
  it("dot and index access", () => {
    expect(resolveJsonPath(req().body, "$.customerId")).toBe("cust-ok");
    expect(resolveJsonPath(req().body, "$.card.last4")).toBe("4242");
    expect(resolveJsonPath(req().body, "$.tags[1]")).toBe("b");
  });
  it("returns undefined for missing paths", () => {
    expect(resolveJsonPath(req().body, "$.nope.deep")).toBeUndefined();
  });
});

describe("evalCondition", () => {
  it("jsonPath equals / notEquals / contains / regex / exists", () => {
    expect(evalCondition({ jsonPath: "$.customerId", equals: "cust-ok" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.customerId", equals: "cust-bad" }, req())).toBe(false);
    expect(evalCondition({ jsonPath: "$.customerId", notEquals: "cust-bad" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.customerId", contains: "ok" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.card.last4", regex: "^\\d{4}$" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.card.last4", exists: true }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.missing", exists: false }, req())).toBe(true);
  });
  it("header and query conditions (header name case-insensitive)", () => {
    expect(evalCondition({ header: "X-Tenant", equals: "acme" }, req())).toBe(true);
    expect(evalCondition({ query: "page", equals: "2" }, req())).toBe(true);
    expect(evalCondition({ header: "x-missing", exists: false }, req())).toBe(true);
  });
});

describe("allMatch", () => {
  it("undefined conditions always match", () => {
    expect(allMatch(undefined, req())).toBe(true);
  });
  it("AND semantics", () => {
    expect(allMatch(
      [{ jsonPath: "$.customerId", equals: "cust-ok" }, { header: "x-tenant", equals: "acme" }],
      req(),
    )).toBe(true);
    expect(allMatch(
      [{ jsonPath: "$.customerId", equals: "cust-ok" }, { header: "x-tenant", equals: "other" }],
      req(),
    )).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/engine/match.test.ts`
Expected: FAIL — `methodMatches`/`resolveJsonPath`/`evalCondition`/`allMatch` are not exported.

- [ ] **Step 3: Append to `src/engine/match.ts`**

```ts
import type { MatchCondition, ParsedRequest } from "./types";

export function methodMatches(routeMethod: string, requestMethod: string): boolean {
  return routeMethod === "*" || routeMethod.toUpperCase() === requestMethod.toUpperCase();
}

export function resolveJsonPath(body: unknown, path: string): unknown {
  if (body == null) return undefined;
  const trimmed = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  const tokens = trimmed
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((t) => t.length > 0);
  let cur: unknown = body;
  for (const tok of tokens) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[tok];
  }
  return cur;
}

function asString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function applyOperator(cond: MatchCondition, actual: string | undefined): boolean {
  if ("exists" in cond) return cond.exists ? actual !== undefined : actual === undefined;
  if (actual === undefined) return false;
  if ("equals" in cond) return actual === cond.equals;
  if ("notEquals" in cond) return actual !== cond.notEquals;
  if ("contains" in cond) return actual.includes(cond.contains);
  if ("regex" in cond) return new RegExp(cond.regex).test(actual);
  return false;
}

export function evalCondition(cond: MatchCondition, req: ParsedRequest): boolean {
  let actual: string | undefined;
  if ("jsonPath" in cond) actual = asString(resolveJsonPath(req.body, cond.jsonPath));
  else if ("header" in cond) actual = req.headers[cond.header.toLowerCase()];
  else actual = req.query[cond.query];
  return applyOperator(cond, actual);
}

export function allMatch(conds: MatchCondition[] | undefined, req: ParsedRequest): boolean {
  if (!conds || conds.length === 0) return true;
  return conds.every((c) => evalCondition(c, req));
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/engine/match.test.ts`
Expected: PASS — all new assertions green, existing ones still green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/match.ts src/engine/match.test.ts
git commit -m "feat: request match conditions (jsonPath/header/query) and method matching"
```

---

## Task 4: Response templating (build-time validation + runtime render)

**Files:**
- Create: `src/engine/template.ts`
- Create: `src/engine/template.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TemplateContext {
    body: unknown;
    path: Record<string, string>;
    query: Record<string, string>;
    header: Record<string, string>;   // lowercased keys
  }
  export function parseTemplate(input: string): void          // build time: throws TemplateError on unknown token
  export function renderTemplate(input: string, ctx: TemplateContext, warnings: string[]): string
  export function renderDeep(value: unknown, ctx: TemplateContext, warnings: string[]): unknown
  export class TemplateError extends Error {}
  ```
- **Allowed grammar** (exact — see spec section 4.3):
  `request.body.<path>`, `request.path.<name>`, `request.query.<name>`, `request.header.<name>`,
  `uuid`, `now`, `now.epochMs`, `randomInt <int> <int>`.

- [ ] **Step 1: Write the failing test `src/engine/template.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseTemplate, renderDeep, renderTemplate, TemplateError } from "./template";
import type { TemplateContext } from "./template";

const ctx: TemplateContext = {
  body: { cardId: "card-1", nested: { n: 7 } },
  path: { id: "42" },
  query: { q: "hello" },
  header: { "x-req": "abc" },
};

describe("parseTemplate", () => {
  it("accepts every allowed token", () => {
    for (const t of [
      "{{request.body.cardId}}", "{{request.body.nested.n}}", "{{request.path.id}}",
      "{{request.query.q}}", "{{request.header.x-req}}", "{{uuid}}", "{{now}}",
      "{{now.epochMs}}", "{{randomInt 1 100}}",
    ]) {
      expect(() => parseTemplate(`x ${t} y`)).not.toThrow();
    }
  });
  it("rejects unknown tokens", () => {
    expect(() => parseTemplate("{{eval('x')}}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{request.cookies.sid}}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{randomInt 1}}")).toThrow(TemplateError);
  });
  it("ignores strings with no tokens", () => {
    expect(() => parseTemplate("plain text")).not.toThrow();
  });
});

describe("renderTemplate", () => {
  it("substitutes body/path/query/header", () => {
    const w: string[] = [];
    expect(renderTemplate("{{request.body.cardId}}/{{request.path.id}}/{{request.query.q}}/{{request.header.x-req}}", ctx, w))
      .toBe("card-1/42/hello/abc");
    expect(w).toEqual([]);
  });
  it("uuid is a v4 uuid, now is ISO, randomInt is in range", () => {
    const w: string[] = [];
    expect(renderTemplate("{{uuid}}", ctx, w)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(renderTemplate("{{now}}", ctx, w)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number(renderTemplate("{{randomInt 5 5}}", ctx, w))).toBe(5);
  });
  it("missing value renders empty and warns", () => {
    const w: string[] = [];
    expect(renderTemplate("[{{request.body.missing}}]", ctx, w)).toBe("[]");
    expect(w).toHaveLength(1);
  });
});

describe("renderDeep", () => {
  it("renders string leaves inside objects and arrays", () => {
    const w: string[] = [];
    expect(renderDeep({ a: "{{request.body.cardId}}", b: [1, "{{request.path.id}}"], c: 3 }, ctx, w))
      .toEqual({ a: "card-1", b: [1, "42"], c: 3 });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/engine/template.test.ts`
Expected: FAIL — `Cannot find module './template'`.

- [ ] **Step 3: Create `src/engine/template.ts`**

```ts
import { randomUUID } from "node:crypto";
import { resolveJsonPath } from "./match";

export class TemplateError extends Error {}

export interface TemplateContext {
  body: unknown;
  path: Record<string, string>;
  query: Record<string, string>;
  header: Record<string, string>;
}

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const IDENT = "[A-Za-z0-9_\\-]+";
const PATTERNS: RegExp[] = [
  new RegExp(`^request\\.body\\.${IDENT}(?:\\.${IDENT}|\\[\\d+\\])*$`),
  new RegExp(`^request\\.path\\.${IDENT}$`),
  new RegExp(`^request\\.query\\.${IDENT}$`),
  new RegExp(`^request\\.header\\.${IDENT}$`),
  /^uuid$/,
  /^now$/,
  /^now\.epochMs$/,
  /^randomInt\s+-?\d+\s+-?\d+$/,
];

function isAllowed(expr: string): boolean {
  return PATTERNS.some((p) => p.test(expr));
}

export function parseTemplate(input: string): void {
  const bad: string[] = [];
  for (const m of input.matchAll(TOKEN_RE)) {
    const expr = m[1]!.trim();
    if (!isAllowed(expr)) bad.push(expr);
  }
  if (bad.length > 0) {
    throw new TemplateError(`unknown template token(s): ${bad.map((b) => `{{${b}}}`).join(", ")}`);
  }
}

function evalToken(expr: string, ctx: TemplateContext, warnings: string[]): string {
  if (expr === "uuid") return randomUUID();
  if (expr === "now") return new Date().toISOString();
  if (expr === "now.epochMs") return String(Date.now());
  const ri = expr.match(/^randomInt\s+(-?\d+)\s+(-?\d+)$/);
  if (ri) {
    const lo = Number(ri[1]);
    const hi = Number(ri[2]);
    return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
  }
  let value: unknown;
  if (expr.startsWith("request.body.")) value = resolveJsonPath(ctx.body, "$." + expr.slice("request.body.".length));
  else if (expr.startsWith("request.path.")) value = ctx.path[expr.slice("request.path.".length)];
  else if (expr.startsWith("request.query.")) value = ctx.query[expr.slice("request.query.".length)];
  else if (expr.startsWith("request.header.")) value = ctx.header[expr.slice("request.header.".length).toLowerCase()];
  if (value === undefined || value === null) {
    warnings.push(`template value not found: {{${expr}}}`);
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function renderTemplate(input: string, ctx: TemplateContext, warnings: string[]): string {
  return input.replace(TOKEN_RE, (_m, expr: string) => evalToken(expr.trim(), ctx, warnings));
}

export function renderDeep(value: unknown, ctx: TemplateContext, warnings: string[]): unknown {
  if (typeof value === "string") return renderTemplate(value, ctx, warnings);
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, ctx, warnings));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderDeep(v, ctx, warnings);
    return out;
  }
  return value;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/engine/template.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/template.ts src/engine/template.test.ts
git commit -m "feat: safe response templating with build-time grammar validation"
```

---

## Task 5: `resolve` — the engine core

**Files:**
- Create: `src/engine/resolve.ts`
- Create: `src/engine/resolve.test.ts`

**Interfaces:**
- Consumes: `ParsedRequest`, `ProjectConfig`, `ResolveResult`, `MockResponse` (types.ts); `matchPath`, `methodMatches`, `allMatch` (match.ts); `renderDeep`, `renderTemplate`, `TemplateContext` (template.ts).
- Produces:
  ```ts
  export function resolve(req: ParsedRequest, project: ProjectConfig): ResolveResult
  ```
- Behavior:
  - Strip `project.basePath` prefix from `req.path` before matching (if set and the path starts with it or equals it).
  - First route where `methodMatches` AND `matchPath.matched` AND `allMatch` wins.
  - No match -> `project.defaults.notFound`, `matchedRuleId = null`.
  - Response body is `renderDeep`-rendered with a context from the (base-path-stripped) request + captured path params.
  - `headers`: start `{}`; if body is an object add `content-type: application/json`; if a string add `text/plain`; then merge rendered `response.headers` over that.
  - `delayMs` from `project.defaults.delayMs` — returned, NOT slept here.
  - `warnings` = accumulated template warnings.

- [ ] **Step 1: Write the failing test `src/engine/resolve.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "./resolve";
import { compileSegments } from "./match";
import type { ParsedRequest, ProjectConfig } from "./types";

const project: ProjectConfig = {
  name: "Demo",
  slug: "demo",
  basePath: "/commands",
  defaults: { delayMs: 25, cors: true, notFound: { status: 404, body: { reason: "UNKNOWN_ROUTE" } } },
  routes: [
    {
      id: "verify-ok",
      method: "POST",
      path: "/verify/:machine",
      segments: compileSegments("/verify/:machine"),
      match: [{ jsonPath: "$.customerId", equals: "cust-ok" }],
      response: { status: 200, body: { verified: true, machine: "{{request.path.machine}}" } },
    },
    {
      id: "verify-default",
      method: "POST",
      path: "/verify/:machine",
      segments: compileSegments("/verify/:machine"),
      response: { status: 200, body: { verified: false } },
    },
  ],
};

const req = (over: Partial<ParsedRequest> = {}): ParsedRequest => ({
  method: "POST", path: "/commands/verify/acropolis", headers: {}, query: {},
  body: { customerId: "cust-ok" }, rawBody: "", ...over,
});

describe("resolve", () => {
  it("first matching rule wins, basePath stripped, path param templated", () => {
    const r = resolve(req(), project);
    expect(r.matchedRuleId).toBe("verify-ok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ verified: true, machine: "acropolis" });
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.delayMs).toBe(25);
  });
  it("falls through to the unconditional rule when match fails", () => {
    const r = resolve(req({ body: { customerId: "other" } }), project);
    expect(r.matchedRuleId).toBe("verify-default");
    expect(r.body).toEqual({ verified: false });
  });
  it("returns notFound default when nothing matches", () => {
    const r = resolve(req({ path: "/commands/nope" }), project);
    expect(r.matchedRuleId).toBeNull();
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ reason: "UNKNOWN_ROUTE" });
  });
  it("string body gets text/plain and is templated", () => {
    const p: ProjectConfig = {
      ...project,
      routes: [{
        id: "s", method: "GET", path: "/hi", segments: compileSegments("/hi"),
        response: { status: 200, body: "hello {{request.query.name}}" },
      }],
    };
    const r = resolve(req({ method: "GET", path: "/commands/hi", query: { name: "x" }, body: undefined }), p);
    expect(r.body).toBe("hello x");
    expect(r.headers["content-type"]).toBe("text/plain");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/engine/resolve.test.ts`
Expected: FAIL — `Cannot find module './resolve'`.

- [ ] **Step 3: Create `src/engine/resolve.ts`**

```ts
import { allMatch, matchPath, methodMatches } from "./match";
import { renderDeep, renderTemplate, type TemplateContext } from "./template";
import type { MockResponse, ParsedRequest, ProjectConfig, ResolveResult } from "./types";

function stripBasePath(path: string, basePath: string | undefined): string {
  if (!basePath) return path;
  if (path === basePath) return "/";
  if (path.startsWith(basePath + "/")) return path.slice(basePath.length);
  return path;
}

function buildResponse(
  response: MockResponse,
  ctx: TemplateContext,
  warnings: string[],
): { status: number; headers: Record<string, string>; body: unknown } {
  const body = response.body === undefined ? null : renderDeep(response.body, ctx, warnings);
  const headers: Record<string, string> = {};
  if (body !== null && typeof body === "object") headers["content-type"] = "application/json";
  else if (typeof body === "string") headers["content-type"] = "text/plain";
  for (const [k, v] of Object.entries(response.headers ?? {})) {
    headers[k.toLowerCase()] = renderTemplate(v, ctx, warnings);
  }
  return { status: response.status, headers, body };
}

export function resolve(req: ParsedRequest, project: ProjectConfig): ResolveResult {
  const path = stripBasePath(req.path, project.basePath);
  const warnings: string[] = [];

  for (const route of project.routes) {
    if (!methodMatches(route.method, req.method)) continue;
    const pm = matchPath(route.segments, path);
    if (!pm.matched) continue;
    if (!allMatch(route.match, req)) continue;

    const ctx: TemplateContext = { body: req.body, path: pm.params, query: req.query, header: req.headers };
    const built = buildResponse(route.response, ctx, warnings);
    return { ...built, matchedRuleId: route.id, delayMs: project.defaults.delayMs, warnings };
  }

  const ctx: TemplateContext = { body: req.body, path: {}, query: req.query, header: req.headers };
  const built = buildResponse(project.defaults.notFound, ctx, warnings);
  return { ...built, matchedRuleId: null, delayMs: project.defaults.delayMs, warnings };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/engine/resolve.test.ts`
Expected: PASS — all 4 `resolve` assertions green.

- [ ] **Step 5: Run the whole engine suite**

Run: `npx vitest run src/engine`
Expected: PASS — match + template + resolve.

- [ ] **Step 6: Commit**

```bash
git add src/engine/resolve.ts src/engine/resolve.test.ts
git commit -m "feat: engine resolve — first-match-wins routing with templated responses"
```

---

## Task 6: Zod schemas for mock config

**Files:**
- Create: `src/compile/schema.ts`
- Create: `src/compile/schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  import { z } from "zod";
  export const projectYamlSchema: z.ZodTypeAny;   // { name, slug, basePath?, defaults? { delayMs?, cors?, notFound? } }
  export const ruleSchema: z.ZodTypeAny;          // { id, description?, request { method, path, match? }, response { status, headers?, body? } }
  export const ruleFileSchema: z.ZodTypeAny;      // z.array(ruleSchema)
  export type ProjectYaml = z.infer<typeof projectYamlSchema>;
  export type Rule = z.infer<typeof ruleSchema>;
  ```
- `path` must start with `/`. Each `match` item: exactly one target key (`jsonPath`|`header`|`query`) + exactly one operator (`equals`|`notEquals`|`contains`|`regex`|`exists`); `regex` must compile; `exists` must be boolean; unknown keys rejected.

- [ ] **Step 1: Write the failing test `src/compile/schema.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { projectYamlSchema, ruleFileSchema } from "./schema";

describe("projectYamlSchema", () => {
  it("accepts a minimal valid project", () => {
    expect(projectYamlSchema.parse({ name: "X", slug: "x" }).slug).toBe("x");
  });
  it("rejects a bad slug", () => {
    expect(() => projectYamlSchema.parse({ name: "X", slug: "Bad Slug" })).toThrow();
  });
  it("rejects an unknown top-level key", () => {
    expect(() => projectYamlSchema.parse({ name: "X", slug: "x", nope: 1 })).toThrow();
  });
});

describe("ruleFileSchema", () => {
  it("accepts a list of valid rules", () => {
    const rules = ruleFileSchema.parse([
      { id: "a", request: { method: "POST", path: "/x" }, response: { status: 200, body: { ok: true } } },
      { id: "b", request: { method: "*", path: "/y/:id", match: [{ jsonPath: "$.a", equals: "1" }] }, response: { status: 201 } },
    ]);
    expect(rules).toHaveLength(2);
  });
  it("rejects a path without a leading slash", () => {
    expect(() => ruleFileSchema.parse([{ id: "a", request: { method: "GET", path: "x" }, response: { status: 200 } }])).toThrow();
  });
  it("rejects a match item with two operators", () => {
    expect(() => ruleFileSchema.parse([{
      id: "a", request: { method: "GET", path: "/x", match: [{ jsonPath: "$.a", equals: "1", contains: "1" }] },
      response: { status: 200 },
    }])).toThrow();
  });
  it("rejects a match item with no target", () => {
    expect(() => ruleFileSchema.parse([{
      id: "a", request: { method: "GET", path: "/x", match: [{ equals: "1" }] }, response: { status: 200 },
    }])).toThrow();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/compile/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Create `src/compile/schema.ts`**

```ts
import { z } from "zod";

const slugRe = /^[a-z0-9][a-z0-9-]{0,62}$/;

const mockResponseSchema = z
  .object({
    status: z.number().int().min(100).max(599),
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
  })
  .strict();

export const projectYamlSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().regex(slugRe, "slug must match ^[a-z0-9][a-z0-9-]{0,62}$"),
    basePath: z.string().startsWith("/").optional(),
    defaults: z
      .object({
        delayMs: z.number().int().min(0).max(9000).optional(),
        cors: z.boolean().optional(),
        notFound: mockResponseSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const TARGET_KEYS = ["jsonPath", "header", "query"] as const;
const OP_KEYS = ["equals", "notEquals", "contains", "regex", "exists"] as const;

const matchConditionSchema = z.record(z.unknown()).superRefine((obj, ctx) => {
  const targets = TARGET_KEYS.filter((k) => k in obj);
  const ops = OP_KEYS.filter((k) => k in obj);
  if (targets.length !== 1) ctx.addIssue({ code: "custom", message: `exactly one of ${TARGET_KEYS.join("/")} required` });
  if (ops.length !== 1) ctx.addIssue({ code: "custom", message: `exactly one of ${OP_KEYS.join("/")} required` });
  const extra = Object.keys(obj).filter((k) => !TARGET_KEYS.includes(k as never) && !OP_KEYS.includes(k as never));
  if (extra.length) ctx.addIssue({ code: "custom", message: `unknown key(s): ${extra.join(", ")}` });
  if ("regex" in obj) {
    try { new RegExp(String(obj.regex)); }
    catch { ctx.addIssue({ code: "custom", message: `invalid regex: ${String(obj.regex)}` }); }
  }
  if ("exists" in obj && typeof obj.exists !== "boolean") {
    ctx.addIssue({ code: "custom", message: "exists must be a boolean" });
  }
});

export const ruleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    request: z
      .object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "*"]),
        path: z.string().startsWith("/", "path must start with /"),
        match: z.array(matchConditionSchema).optional(),
      })
      .strict(),
    response: mockResponseSchema,
  })
  .strict();

export const ruleFileSchema = z.array(ruleSchema);

export type ProjectYaml = z.infer<typeof projectYamlSchema>;
export type Rule = z.infer<typeof ruleSchema>;
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/compile/schema.test.ts`
Expected: PASS — 3 + 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/compile/schema.ts src/compile/schema.test.ts
git commit -m "feat: zod schemas for project.yaml and route rule files"
```

---

## Task 7: Compile pipeline + CLI

**Files:**
- Create: `src/compile/compile.ts`
- Create: `src/compile/compile.test.ts`
- Create: `src/compile/__fixtures__/valid/card/project.yaml`
- Create: `src/compile/__fixtures__/valid/card/routes/main.yaml`
- Create: `src/compile/__fixtures__/bad-slug/wrong/project.yaml`
- Replace: `scripts/compile-cli.ts` (was the stub from Task 1)
- Create: `mocks/.gitkeep`

**Interfaces:**
- Consumes: `projectYamlSchema`, `ruleFileSchema`, `Rule` (schema.ts); `compileSegments` (match.ts); `parseTemplate`, `TemplateError` (template.ts); `MockResponse`, `ProjectConfig`, `Route` (engine/types.ts).
- Produces:
  ```ts
  export interface CompiledBundle {
    builtAt: string; commit: string; warnings: string[];
    projects: Record<string, import("../engine/types").ProjectConfig>;
  }
  export interface CompileResult { bundle: CompiledBundle; errors: string[]; warnings: string[]; }
  export function compileMocks(mocksDir: string, commit?: string, overlayFiles?: Record<string, string>): CompileResult
  ```
  (In Task 8 this becomes `async` / returns `Promise<CompileResult>`.)
- `overlayFiles` — a test-only hook: `{ "<dirName>/routes/x.yaml": "<yaml>" }` injects extra rule files into a fixture project.
- ERROR classes (each a string in `errors`; CLI exits 1 if `errors.length > 0`):
  - project dir with no `project.yaml`
  - `slug` !== directory name
  - duplicate slug across dirs
  - route `path` starting with `/__`
  - any `parseTemplate` throw in a response body/header string
  - any zod parse failure (message includes file path)
- WARNINGS (non-fatal): two rules, same method+path, both without `match` (second unreachable).

- [ ] **Step 1: Create fixtures**

`src/compile/__fixtures__/valid/card/project.yaml`:
```yaml
name: Card
slug: card
basePath: /commands
defaults:
  delayMs: 0
  cors: true
  notFound: { status: 404, body: { reason: UNKNOWN_ROUTE } }
```

`src/compile/__fixtures__/valid/card/routes/main.yaml`:
```yaml
- id: block-ok
  request:
    method: POST
    path: /BLOCK_CARD/v1
    match:
      - jsonPath: $.cardId
        equals: card-1
  response:
    status: 200
    body: { status: BLOCKED, id: "{{request.body.cardId}}" }
- id: block-default
  request: { method: POST, path: /BLOCK_CARD/v1 }
  response: { status: 200, body: { status: BLOCKED } }
```

`src/compile/__fixtures__/bad-slug/wrong/project.yaml`:
```yaml
name: Wrong
slug: not-wrong
```

- [ ] **Step 2: Write the failing test `src/compile/compile.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { resolve as pathResolve } from "node:path";
import { compileMocks } from "./compile";

const fx = (name: string) => pathResolve(__dirname, "__fixtures__", name);

describe("compileMocks", () => {
  it("compiles a valid project", () => {
    const r = compileMocks(fx("valid"), "abc123");
    expect(r.errors).toEqual([]);
    expect(r.bundle.commit).toBe("abc123");
    const card = r.bundle.projects.card!;
    expect(card.basePath).toBe("/commands");
    expect(card.routes.map((x) => x.id)).toEqual(["block-ok", "block-default"]);
    expect(card.routes[0]!.segments).toHaveLength(2);
    expect(card.defaults.notFound.status).toBe(404);
  });
  it("errors when slug does not equal the directory name", () => {
    const r = compileMocks(fx("bad-slug"));
    expect(r.errors.join("\n")).toMatch(/slug .* does not match directory name/i);
  });
  it("errors on a route path starting with /__", () => {
    const r = compileMocks(fx("valid"), "x", {
      "card/routes/extra.yaml": "- id: bad\n  request: { method: GET, path: /__x }\n  response: { status: 200 }\n",
    });
    expect(r.errors.join("\n")).toMatch(/reserved path/i);
  });
  it("errors on an unknown template token", () => {
    const r = compileMocks(fx("valid"), "x", {
      "card/routes/extra.yaml": '- id: t\n  request: { method: GET, path: /t }\n  response: { status: 200, body: "{{evil()}}" }\n',
    });
    expect(r.errors.join("\n")).toMatch(/unknown template token/i);
  });
  it("warns on two unconditional rules for the same method+path", () => {
    const r = compileMocks(fx("valid"), "x", {
      "card/routes/extra.yaml":
        "- id: d1\n  request: { method: POST, path: /dupe }\n  response: { status: 200 }\n" +
        "- id: d2\n  request: { method: POST, path: /dupe }\n  response: { status: 200 }\n",
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join("\n")).toMatch(/unreachable/i);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run src/compile/compile.test.ts`
Expected: FAIL — `Cannot find module './compile'`.

- [ ] **Step 4: Create `src/compile/compile.ts`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { compileSegments } from "../engine/match";
import { parseTemplate, TemplateError } from "../engine/template";
import type { MockResponse, ProjectConfig, Route } from "../engine/types";
import { projectYamlSchema, ruleFileSchema, type Rule } from "./schema";

export interface CompiledBundle {
  builtAt: string;
  commit: string;
  warnings: string[];
  projects: Record<string, ProjectConfig>;
}
export interface CompileResult {
  bundle: CompiledBundle;
  errors: string[];
  warnings: string[];
}

const DEFAULT_NOT_FOUND: MockResponse = { status: 404, body: { reason: "UNKNOWN_ROUTE" } };

function walkRuleFiles(dir: string): string[] {
  const routesDir = join(dir, "routes");
  try {
    return readdirSync(routesDir)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort()
      .map((f) => join(routesDir, f));
  } catch {
    return [];
  }
}

function assertTemplatesValid(resp: MockResponse): void {
  const visit = (v: unknown): void => {
    if (typeof v === "string") parseTemplate(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(resp.body);
  for (const h of Object.values(resp.headers ?? {})) parseTemplate(h);
}

function toRoute(rule: Rule): Route {
  return {
    id: rule.id,
    method: rule.request.method,
    path: rule.request.path,
    segments: compileSegments(rule.request.path),
    match: rule.request.match as Route["match"],
    response: rule.response,
  };
}

function detectDeadRules(routes: Route[], warnings: string[]): void {
  const seenUnconditional = new Set<string>();
  for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    if (!r.match || r.match.length === 0) {
      if (seenUnconditional.has(key)) {
        warnings.push(`rule "${r.id}": unreachable — an earlier rule already matches all "${key}"`);
      }
      seenUnconditional.add(key);
    }
  }
}

export function compileMocks(
  mocksDir: string,
  commit = "dev",
  overlayFiles: Record<string, string> = {},
): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const projects: Record<string, ProjectConfig> = {};

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(mocksDir).filter((d) => {
      try { return statSync(join(mocksDir, d)).isDirectory(); } catch { return false; }
    });
  } catch {
    errors.push(`mocks directory not found: ${mocksDir}`);
    return { bundle: { builtAt: new Date().toISOString(), commit, warnings, projects }, errors, warnings };
  }

  for (const dirName of projectDirs) {
    const dir = join(mocksDir, dirName);
    let rawProject: string;
    try {
      rawProject = readFileSync(join(dir, "project.yaml"), "utf8");
    } catch {
      errors.push(`${dirName}/: missing project.yaml`);
      continue;
    }

    let project;
    try {
      project = projectYamlSchema.parse(parseYaml(rawProject));
    } catch (e) {
      errors.push(`${dirName}/project.yaml: ${(e as Error).message}`);
      continue;
    }

    if (project.slug !== dirName) {
      errors.push(`${dirName}/project.yaml: slug "${project.slug}" does not match directory name "${dirName}"`);
      continue;
    }
    if (projects[project.slug]) {
      errors.push(`duplicate project slug "${project.slug}"`);
      continue;
    }

    const routes: Route[] = [];
    const ruleFiles: Array<{ label: string; raw: string }> = walkRuleFiles(dir).map((f) => ({
      label: f,
      raw: readFileSync(f, "utf8"),
    }));
    for (const [rel, raw] of Object.entries(overlayFiles)) {
      if (rel.startsWith(dirName + "/")) ruleFiles.push({ label: rel, raw });
    }

    for (const { label, raw } of ruleFiles) {
      let rules: Rule[];
      try {
        rules = ruleFileSchema.parse(parseYaml(raw) ?? []);
      } catch (e) {
        errors.push(`${label}: ${(e as Error).message}`);
        continue;
      }
      for (const rule of rules) {
        if (rule.request.path.startsWith("/__")) {
          errors.push(`${label}: rule "${rule.id}" uses reserved path prefix "/__"`);
          continue;
        }
        try {
          assertTemplatesValid(rule.response);
        } catch (e) {
          if (e instanceof TemplateError) { errors.push(`${label}: rule "${rule.id}": ${e.message}`); continue; }
          throw e;
        }
        routes.push(toRoute(rule));
      }
    }

    detectDeadRules(routes, warnings);

    projects[project.slug] = {
      name: project.name,
      slug: project.slug,
      basePath: project.basePath,
      defaults: {
        delayMs: project.defaults?.delayMs ?? 0,
        cors: project.defaults?.cors ?? true,
        notFound: project.defaults?.notFound ?? DEFAULT_NOT_FOUND,
      },
      routes,
    };
  }

  return {
    bundle: { builtAt: new Date().toISOString(), commit, warnings, projects },
    errors,
    warnings,
  };
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run src/compile/compile.test.ts`
Expected: PASS — 5 assertions green.

- [ ] **Step 6: Replace `scripts/compile-cli.ts` with the real CLI**

```ts
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileMocks } from "../src/compile/compile";

function gitCommit(): string {
  try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); }
  catch { return "dev"; }
}

const mocksDir = resolve(process.cwd(), "mocks");
const { bundle, errors, warnings } = compileMocks(mocksDir, gitCommit());

for (const w of warnings) console.warn(`[compile] WARN ${w}`);

if (errors.length > 0) {
  for (const e of errors) console.error(`[compile] ERROR ${e}`);
  console.error(`[compile] ${errors.length} error(s) — aborting build`);
  process.exit(1);
}

writeFileSync(resolve(process.cwd(), "mocks.generated.json"), JSON.stringify(bundle, null, 2));
console.log(`[compile] wrote mocks.generated.json — ${Object.keys(bundle.projects).length} project(s), ${warnings.length} warning(s)`);
```

- [ ] **Step 7: Create `mocks/.gitkeep` and run the CLI**

Run:
```bash
mkdir -p mocks && touch mocks/.gitkeep
npm run compile
```
Expected: `[compile] wrote mocks.generated.json — 0 project(s), 0 warning(s)`.

- [ ] **Step 8: Full check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass; `tsc` exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/compile scripts/compile-cli.ts mocks/.gitkeep
git commit -m "feat: mock compile pipeline and build-time CLI with fail-on-error"
```

---

## Task 8: OpenAPI import

**Files:**
- Create: `src/openapi/expand.ts`
- Create: `src/openapi/expand.test.ts`
- Create: `src/openapi/__fixtures__/with-examples.yaml`
- Create: `src/openapi/__fixtures__/no-examples.yaml`
- Create: `src/compile/__fixtures__/valid/card/openapi/api.yaml`
- Modify: `src/compile/compile.ts` (make `compileMocks` async; parse `openapi/*`; append expanded routes AFTER hand-written; set `openApiDoc`)
- Modify: `src/compile/compile.test.ts` (await calls; add merge-order test)
- Modify: `scripts/compile-cli.ts` (`await compileMocks(...)`)

**Interfaces:**
- Produces:
  ```ts
  export interface ExpandResult { routes: import("../engine/types").Route[]; warnings: string[]; mergedDoc: unknown; }
  export async function expandOpenApi(filePath: string): Promise<ExpandResult>
  ```
- Rules (spec section 4.4):
  - Parse + validate with `@apidevtools/swagger-parser` `.validate()` (dereferences `$ref`). It throws on an invalid doc; the caller turns that into a compile error.
  - For each `paths[p][method]`: `method` uppercased; OpenAPI `{param}` -> `:param`.
  - Response: the lowest declared 2xx status key; else the lowest declared status key.
  - Body: for that response, first `content[*].examples` -> first entry's `.value`; else `content[*].example`; else `null` + warning `operation <id>: no example`.
  - Route `id`: `openapi:` + (`operationId` ?? `<METHOD> <path>`).

- [ ] **Step 1: Create fixtures**

`src/openapi/__fixtures__/with-examples.yaml`:
```yaml
openapi: 3.0.3
info: { title: X, version: 1.0.0 }
paths:
  /users/{id}:
    get:
      operationId: getUser
      responses:
        "200":
          description: ok
          content:
            application/json:
              examples:
                sample: { value: { id: "u1", name: "Ada" } }
  /ping:
    post:
      responses:
        "201":
          description: created
          content:
            application/json:
              example: { pong: true }
```

`src/openapi/__fixtures__/no-examples.yaml`:
```yaml
openapi: 3.0.3
info: { title: X, version: 1.0.0 }
paths:
  /bare:
    get:
      operationId: bare
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { type: object, properties: { a: { type: string } } }
```

`src/compile/__fixtures__/valid/card/openapi/api.yaml`:
```yaml
openapi: 3.0.3
info: { title: Card, version: 1.0.0 }
paths:
  /status:
    get:
      operationId: cardStatus
      responses:
        "200": { description: ok, content: { application/json: { example: { up: true } } } }
```

- [ ] **Step 2: Write the failing test `src/openapi/expand.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { expandOpenApi } from "./expand";

const fx = (n: string) => resolve(__dirname, "__fixtures__", n);

describe("expandOpenApi", () => {
  it("generates routes from examples and maps {param} -> :param", async () => {
    const r = await expandOpenApi(fx("with-examples.yaml"));
    expect(r.warnings).toEqual([]);
    const get = r.routes.find((x) => x.id === "openapi:getUser")!;
    expect(get.method).toBe("GET");
    expect(get.path).toBe("/users/:id");
    expect(get.response).toEqual({ status: 200, body: { id: "u1", name: "Ada" } });
    const post = r.routes.find((x) => x.id === "openapi:POST /ping")!;
    expect(post.response).toEqual({ status: 201, body: { pong: true } });
  });
  it("emits a warning and a null body when an operation has no example", async () => {
    const r = await expandOpenApi(fx("no-examples.yaml"));
    expect(r.routes[0]!.response).toEqual({ status: 200, body: null });
    expect(r.warnings.join("\n")).toMatch(/no example/i);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run src/openapi/expand.test.ts`
Expected: FAIL — `Cannot find module './expand'`.

- [ ] **Step 4: Create `src/openapi/expand.ts`**

```ts
import SwaggerParser from "@apidevtools/swagger-parser";
import { compileSegments } from "../engine/match";
import type { HttpMethod, Route } from "../engine/types";

export interface ExpandResult {
  routes: Route[];
  warnings: string[];
  mergedDoc: unknown;
}

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function chosenStatus(responses: Record<string, unknown>): string | undefined {
  const keys = Object.keys(responses).filter((k) => /^\d{3}$/.test(k)).sort();
  return keys.find((k) => k.startsWith("2")) ?? keys[0];
}

function exampleBody(responseObj: Record<string, unknown>): { body: unknown; hasExample: boolean } {
  const content = (responseObj.content ?? {}) as Record<
    string,
    { example?: unknown; examples?: Record<string, { value?: unknown }> }
  >;
  for (const media of Object.values(content)) {
    if (media.examples) {
      const first = Object.values(media.examples)[0];
      if (first && "value" in first) return { body: first.value ?? null, hasExample: true };
    }
    if ("example" in media) return { body: media.example ?? null, hasExample: true };
  }
  return { body: null, hasExample: false };
}

export async function expandOpenApi(filePath: string): Promise<ExpandResult> {
  const doc = (await SwaggerParser.validate(filePath)) as {
    paths?: Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown> }>>;
  };
  const routes: Route[] = [];
  const warnings: string[] = [];

  for (const [oaPath, ops] of Object.entries(doc.paths ?? {})) {
    const path = oaPath.replace(/\{([^}]+)\}/g, ":$1");
    for (const method of METHODS) {
      const op = ops[method.toLowerCase()];
      if (!op) continue;
      const id = `openapi:${op.operationId ?? `${method} ${path}`}`;
      const responses = (op.responses ?? {}) as Record<string, Record<string, unknown>>;
      const statusKey = chosenStatus(responses);
      if (!statusKey) {
        warnings.push(`operation ${id}: no response declared — skipped`);
        continue;
      }
      const { body, hasExample } = exampleBody(responses[statusKey]!);
      if (!hasExample) warnings.push(`operation ${id}: no example — response body is empty`);
      routes.push({
        id,
        method,
        path,
        segments: compileSegments(path),
        response: { status: Number(statusKey), body },
      });
    }
  }

  return { routes, warnings, mergedDoc: doc };
}
```

- [ ] **Step 5: Run the expand tests, confirm pass**

Run: `npx vitest run src/openapi/expand.test.ts`
Expected: PASS — both assertions green.

- [ ] **Step 6: Make `compileMocks` async and wire OpenAPI in `src/compile/compile.ts`**

Change the signature to `export async function compileMocks(...): Promise<CompileResult>`.

After the hand-written rule loop and BEFORE `detectDeadRules(routes, warnings)`, insert:

```ts
    let mergedDoc: unknown;
    try {
      const openapiDir = join(dir, "openapi");
      const oaFiles = readdirSync(openapiDir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"))
        .sort();
      for (const f of oaFiles) {
        const full = join(openapiDir, f);
        try {
          const { expandOpenApi } = await import("../openapi/expand");
          const res = await expandOpenApi(full);
          for (const r of res.routes) {
            if (r.path.startsWith("/__")) { errors.push(`${full}: generated route "${r.id}" hits reserved path "/__"`); continue; }
            routes.push(r); // AFTER hand-written -> first-match-wins => hand-written overrides
          }
          for (const w of res.warnings) warnings.push(`${dirName}/openapi/${f}: ${w}`);
          mergedDoc = res.mergedDoc;
        } catch (e) {
          errors.push(`${full}: ${(e as Error).message}`);
        }
      }
    } catch { /* no openapi/ dir */ }
```

Add `openApiDoc: mergedDoc` to the `projects[project.slug] = { ... }` object literal.

- [ ] **Step 7: Update `scripts/compile-cli.ts`**

Change to:
```ts
const { bundle, errors, warnings } = await compileMocks(mocksDir, gitCommit());
```
The file is ESM `.ts` run by `tsx`; top-level `await` is allowed.

- [ ] **Step 8: Update `src/compile/compile.test.ts`** — prefix every `compileMocks(...)` call with `await` and make each `it(...)` callback `async`. Add:

```ts
  it("hand-written rules come before OpenAPI-generated ones", async () => {
    const r = await compileMocks(fx("valid"), "x");
    const ids = r.bundle.projects.card!.routes.map((x) => x.id);
    expect(ids.indexOf("block-ok")).toBeLessThan(ids.findIndex((i) => i.startsWith("openapi:")));
    expect(r.bundle.projects.card!.openApiDoc).toBeTruthy();
  });
```

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run && npm run compile && npx tsc --noEmit`
Expected: all tests pass; `npm run compile` still reports `0 project(s)` (real `mocks/` still empty); `tsc` exits 0.

- [ ] **Step 10: Commit**

```bash
git add src/openapi src/compile scripts/compile-cli.ts
git commit -m "feat: OpenAPI 3 spec import — one route per operation from examples"
```

---

## Task 9: Mock-serving route

**Files:**
- Create: `src/engine/request.ts`
- Create: `src/engine/request.test.ts`
- Create: `app/m/[...slug]/route.ts`
- Create: `app/m/[...slug]/route.test.ts`

**Interfaces:**
- Consumes: `resolve` (engine/resolve.ts); `CompiledBundle` (compile/compile.ts); `ParsedRequest`, `ProjectConfig` (engine/types.ts).
- Produces:
  - `src/engine/request.ts`:
    ```ts
    export async function parseRequest(req: Request, subPath: string): Promise<import("./types").ParsedRequest>
    ```
  - `app/m/[...slug]/route.ts`: exports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, all bound to one `handle(req, ctx)` where `ctx: { params: Promise<{ slug: string[] }> }` (Next 15 async params).
- Behavior per spec section 6:
  1. `slug = parts[0]`; `subPath = "/" + parts.slice(1).join("/")`.
  2. Unknown slug -> `404 {"error":"unknown project","slug":...}`.
  3. `OPTIONS` + `project.defaults.cors` -> `204` + permissive CORS headers.
  4. `resolve(parsedRequest, project)`.
  5. `delayMs > 0` -> `await new Promise(r => setTimeout(r, Math.min(delayMs, 9000)))`.
  6. One structured log line `console.log(JSON.stringify({ t, proj, m, path, rule, status, matched, warns }))`.
  7. CORS headers on every response when `project.defaults.cors`.
  8. Body: object -> `JSON.stringify`; string -> as-is; `null`/`undefined` -> empty body.

- [ ] **Step 1: Write the failing test `src/engine/request.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseRequest } from "./request";

describe("parseRequest", () => {
  it("parses JSON body, lowercases headers, splits query", async () => {
    const req = new Request("https://x/m/demo/verify?page=2&q=hi", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant": "acme" },
      body: JSON.stringify({ a: 1 }),
    });
    const p = await parseRequest(req, "/verify");
    expect(p.method).toBe("POST");
    expect(p.path).toBe("/verify");
    expect(p.headers["x-tenant"]).toBe("acme");
    expect(p.query).toEqual({ page: "2", q: "hi" });
    expect(p.body).toEqual({ a: 1 });
  });
  it("leaves body undefined for a non-JSON payload", async () => {
    const req = new Request("https://x/m/demo/x", { method: "POST", body: "not json {" });
    const p = await parseRequest(req, "/x");
    expect(p.body).toBeUndefined();
    expect(p.rawBody).toBe("not json {");
  });
  it("handles a bodyless GET", async () => {
    const p = await parseRequest(new Request("https://x/m/demo/x"), "/x");
    expect(p.body).toBeUndefined();
    expect(p.method).toBe("GET");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/engine/request.test.ts`
Expected: FAIL — `Cannot find module './request'`.

- [ ] **Step 3: Create `src/engine/request.ts`**

```ts
import type { ParsedRequest } from "./types";

export async function parseRequest(req: Request, subPath: string): Promise<ParsedRequest> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  let rawBody = "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    try { rawBody = await req.text(); } catch { rawBody = ""; }
  }
  let body: unknown;
  if (rawBody.length > 0) {
    try { body = JSON.parse(rawBody); } catch { body = undefined; }
  }

  return { method: req.method, path: subPath, headers, query, body, rawBody };
}
```

- [ ] **Step 4: Run request tests, confirm pass**

Run: `npx vitest run src/engine/request.test.ts`
Expected: PASS — 3 assertions green.

- [ ] **Step 5: Write the failing test `app/m/[...slug]/route.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/mocks.generated.json", () => ({
  default: {
    builtAt: "t", commit: "c", warnings: [],
    projects: {
      demo: {
        name: "Demo", slug: "demo", basePath: "/commands",
        defaults: { delayMs: 0, cors: true, notFound: { status: 404, body: { reason: "UNKNOWN_ROUTE" } } },
        routes: [{
          id: "ok", method: "POST", path: "/verify",
          segments: [{ kind: "literal", value: "verify" }],
          match: [{ jsonPath: "$.id", equals: "1" }],
          response: { status: 200, body: { verified: true } },
        }],
      },
    },
  },
}));

const { POST, OPTIONS, GET } = await import("./route");

type Ctx = { params: Promise<{ slug: string[] }> };
const call = (
  fn: (r: Request, c: Ctx) => Promise<Response>,
  url: string,
  init?: RequestInit,
) => {
  const slug = url.split("/m/")[1]!.split("?")[0]!.split("/");
  return fn(new Request(url, init), { params: Promise.resolve({ slug }) });
};

describe("mock route", () => {
  it("matches a rule and returns its response with CORS", async () => {
    const res = await call(POST, "https://x/m/demo/commands/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
  it("returns the project notFound default when nothing matches", async () => {
    const res = await call(POST, "https://x/m/demo/commands/nope", { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ reason: "UNKNOWN_ROUTE" });
  });
  it("404s an unknown project", async () => {
    const res = await call(GET, "https://x/m/ghost/x");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "unknown project", slug: "ghost" });
  });
  it("answers an OPTIONS preflight with 204", async () => {
    const res = await call(OPTIONS, "https://x/m/demo/commands/verify", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `npx vitest run app/m/`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Create `app/m/[...slug]/route.ts`**

```ts
import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";
import { parseRequest } from "@/src/engine/request";
import { resolve } from "@/src/engine/resolve";
import type { ProjectConfig } from "@/src/engine/types";

const bundle = bundleJson as unknown as CompiledBundle;

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });
}

async function handle(req: Request, ctx: { params: Promise<{ slug: string[] }> }): Promise<Response> {
  const { slug: parts } = await ctx.params;
  const slug = parts[0]!;
  const subPath = "/" + parts.slice(1).join("/");
  const project: ProjectConfig | undefined = bundle.projects[slug];

  if (!project) return json(404, { error: "unknown project", slug });

  const cors = project.defaults.cors ? CORS_HEADERS : {};

  if (req.method === "OPTIONS" && project.defaults.cors) {
    return new Response(null, { status: 204, headers: cors });
  }

  const parsed = await parseRequest(req, subPath);
  const result = resolve(parsed, project);

  if (result.delayMs > 0) {
    await new Promise((r) => setTimeout(r, Math.min(result.delayMs, 9000)));
  }

  console.log(JSON.stringify({
    t: new Date().toISOString(),
    proj: slug,
    m: req.method,
    path: subPath,
    rule: result.matchedRuleId,
    status: result.status,
    matched: result.matchedRuleId !== null,
    warns: result.warnings.length || undefined,
  }));

  const headers: Record<string, string> = { ...result.headers, ...cors };
  let payload: BodyInit | null;
  if (result.body === null || result.body === undefined) payload = null;
  else if (typeof result.body === "string") payload = result.body;
  else payload = JSON.stringify(result.body);

  return new Response(payload, { status: result.status, headers });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
```

- [ ] **Step 8: Run route tests, confirm pass**

Run: `npx vitest run app/m/`
Expected: PASS — 4 assertions green.

- [ ] **Step 9: Full check + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: tests pass; `tsc` exits 0; `next build` shows a `ƒ /m/[...slug]` dynamic route and completes.

- [ ] **Step 10: Commit**

```bash
git add app/m src/engine/request.ts src/engine/request.test.ts
git commit -m "feat: mock-serving catch-all route with CORS, delay, and structured logging"
```

---

## Task 10: Introspection endpoints + viewer page

**Files:**
- Create: `app/__mock/health/route.ts`
- Create: `app/__mock/projects/route.ts`
- Create: `app/m/[slug]/__spec/route.ts` (see routing note)
- Create: `app/__mock/health/route.test.ts`
- Replace: `app/page.tsx` (viewer)

**Routing note:** `app/m/[...slug]/route.ts` (catch-all) and `app/m/[slug]/__spec/route.ts` (dynamic + literal) can coexist — a more specific segment wins over a catch-all. If `npm run build` errors on a route conflict, delete `app/m/[slug]/` and instead handle `__spec` inside `handle` in `app/m/[...slug]/route.ts`: after computing `parts`, if `parts.length === 2 && parts[1] === "__spec"`, return `project.openApiDoc ? Response.json(project.openApiDoc) : json(404, { error: "no openapi spec", slug })` before `parseRequest`.

**Interfaces:**
- `GET /__mock/health` -> `{ ok: true, builtAt, commit, projectCount, warnings }`
- `GET /__mock/projects` -> `Array<{ slug, name, routeCount, hasOpenApi }>`
- `GET /m/<slug>/__spec` -> `project.openApiDoc` JSON, or `404 { error: "no openapi spec", slug }`

- [ ] **Step 1: Write the failing test `app/__mock/health/route.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/mocks.generated.json", () => ({
  default: {
    builtAt: "2026-08-28T00:00:00.000Z", commit: "abc123", warnings: ["w1"],
    projects: {
      demo: { name: "Demo", slug: "demo", defaults: { delayMs: 0, cors: true, notFound: { status: 404 } },
              routes: [{ id: "a" }, { id: "b" }], openApiDoc: { openapi: "3.0.3" } },
      bare: { name: "Bare", slug: "bare", defaults: { delayMs: 0, cors: true, notFound: { status: 404 } }, routes: [] },
    },
  },
}));

describe("__mock endpoints", () => {
  it("health reports build info", async () => {
    const { GET } = await import("./route");
    expect(await (await GET()).json()).toEqual({
      ok: true, builtAt: "2026-08-28T00:00:00.000Z", commit: "abc123", projectCount: 2, warnings: ["w1"],
    });
  });
  it("projects lists slug/name/routeCount/hasOpenApi", async () => {
    const { GET } = await import("../projects/route");
    expect(await (await GET()).json()).toEqual([
      { slug: "demo", name: "Demo", routeCount: 2, hasOpenApi: true },
      { slug: "bare", name: "Bare", routeCount: 0, hasOpenApi: false },
    ]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run app/__mock/`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Create `app/__mock/health/route.ts`**

```ts
import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";

const bundle = bundleJson as unknown as CompiledBundle;

export function GET(): Response {
  return Response.json({
    ok: true,
    builtAt: bundle.builtAt,
    commit: bundle.commit,
    projectCount: Object.keys(bundle.projects).length,
    warnings: bundle.warnings,
  });
}
```

- [ ] **Step 4: Create `app/__mock/projects/route.ts`**

```ts
import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";

const bundle = bundleJson as unknown as CompiledBundle;

export function GET(): Response {
  const list = Object.values(bundle.projects).map((p) => ({
    slug: p.slug,
    name: p.name,
    routeCount: p.routes.length,
    hasOpenApi: p.openApiDoc != null,
  }));
  return Response.json(list);
}
```

- [ ] **Step 5: Create `app/m/[slug]/__spec/route.ts`**

```ts
import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";

const bundle = bundleJson as unknown as CompiledBundle;

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const project = bundle.projects[slug];
  if (!project || project.openApiDoc == null) {
    return Response.json({ error: "no openapi spec", slug }, { status: 404 });
  }
  return Response.json(project.openApiDoc);
}
```

- [ ] **Step 6: Run introspection tests, confirm pass**

Run: `npx vitest run app/__mock/`
Expected: PASS — health + projects assertions green.

- [ ] **Step 7: Replace `app/page.tsx` with the viewer**

```tsx
import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";

const bundle = bundleJson as unknown as CompiledBundle;

export default function Viewer() {
  const projects = Object.values(bundle.projects);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>mockservers</h1>
      <p style={{ color: "#666" }}>
        build {bundle.commit} · {bundle.builtAt} · {projects.length} project(s)
        {bundle.warnings.length > 0 && ` · ${bundle.warnings.length} warning(s)`}
      </p>
      {projects.length === 0 && (
        <p>No projects configured. Add one under <code>mocks/</code>.</p>
      )}
      {projects.map((p) => (
        <section key={p.slug} style={{ borderTop: "1px solid #eee", paddingTop: 16, marginTop: 16 }}>
          <h2>
            {p.name} <code style={{ fontSize: 14, color: "#888" }}>/m/{p.slug}</code>
          </h2>
          {p.basePath && <p style={{ color: "#666" }}>basePath: <code>{p.basePath}</code></p>}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th align="left">method</th><th align="left">path</th>
                <th align="left">rule id</th><th align="left">status</th>
              </tr>
            </thead>
            <tbody>
              {p.routes.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f3f3" }}>
                  <td><code>{r.method}</code></td>
                  <td><code>{r.path}</code></td>
                  <td><code>{r.id}</code></td>
                  <td>{r.response.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 8: Build — check the `__spec` route does not conflict with the catch-all**

Run: `npm run build`
Expected: build completes; route list includes both `ƒ /m/[...slug]` and `ƒ /m/[slug]/__spec`. If it errors with a route conflict, apply the fallback in the Routing note (handle `__spec` inside the catch-all), `rm -rf app/m/[slug]`, and re-run `npm run build`.

- [ ] **Step 9: Full check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add app
git commit -m "feat: introspection endpoints (__mock/health, __mock/projects, __spec) and read-only viewer"
```

---

## Task 11: First example project — card-block-lost

**Files:**
- Create: `mocks/card-block-lost/project.yaml`
- Create: `mocks/card-block-lost/openapi/card-block-lost.yaml` (copied from the reference)
- Create: `mocks/card-block-lost/routes/customer.yaml`
- Create: `mocks/card-block-lost/routes/card.yaml`
- Create: `src/engine/scenarios.test.ts`
- Delete: `mocks/.gitkeep`

**Reference — read all three first:**
`~/hub/hub-workflow-application/card-block-lost-mock-openapi.yaml`,
`~/hub/hub-workflow-application/card-block-lost-mock-server.js`,
`~/hub/hub-workflow-application/card-block-lost-api-docs.md`.

The `.js` server's routes (`/commands/acropolis-card-mgmt/<CMD>/v1`) and lookup tables (keyed on `customerId` / `cardLast4` / `cardId`) are the branch scenarios to port. The `.yaml` OpenAPI gives the happy paths.

- [ ] **Step 1: Copy the OpenAPI spec**

```bash
mkdir -p mocks/card-block-lost/openapi mocks/card-block-lost/routes
cp ~/hub/hub-workflow-application/card-block-lost-mock-openapi.yaml mocks/card-block-lost/openapi/card-block-lost.yaml
```

- [ ] **Step 2: Create `mocks/card-block-lost/project.yaml`**

```yaml
name: Card Block (Lost Card)
slug: card-block-lost
basePath: /commands
defaults:
  delayMs: 0
  cors: true
  notFound:
    status: 404
    body: { reason: UNKNOWN_ROUTE }
```

- [ ] **Step 3: Create `mocks/card-block-lost/routes/customer.yaml`**

Port `CUSTOMER_SCENARIOS` from `card-block-lost-mock-server.js` (`verifyCustomer`):

```yaml
- id: verify-customer-bad-challenge
  request:
    method: POST
    path: /acropolis-card-mgmt/VERIFY_CUSTOMER/v1
    match: [{ jsonPath: $.customerId, equals: cust-bad-challenge }]
  response: { status: 200, body: { verified: false, reason: CHALLENGE_MISMATCH } }

- id: verify-customer-unknown
  request:
    method: POST
    path: /acropolis-card-mgmt/VERIFY_CUSTOMER/v1
    match: [{ jsonPath: $.customerId, equals: cust-unknown }]
  response: { status: 200, body: { verified: false, reason: CUSTOMER_NOT_FOUND } }

- id: verify-customer-unauth
  request:
    method: POST
    path: /acropolis-card-mgmt/VERIFY_CUSTOMER/v1
    match: [{ jsonPath: $.customerId, equals: cust-unauth }]
  response: { status: 401, body: { verified: false, reason: UNAUTHORIZED } }

- id: verify-customer-service-down
  request:
    method: POST
    path: /acropolis-card-mgmt/VERIFY_CUSTOMER/v1
    match: [{ jsonPath: $.customerId, equals: cust-verify-down }]
  response: { status: 500, body: { verified: false, reason: VERIFICATION_SERVICE_ERROR } }

- id: verify-customer-default
  request: { method: POST, path: /acropolis-card-mgmt/VERIFY_CUSTOMER/v1 }
  response: { status: 200, body: { verified: true, riskScore: 12 } }
```

- [ ] **Step 4: Create `mocks/card-block-lost/routes/card.yaml`**

Port `CARD_LAST4_SCENARIOS`, `ELIGIBILITY_BY_CARD_ID`, `BLOCK_BY_CARD_ID`, `NOTIFY_BY_CARD_ID`, and the `locateCard` / `confirmCard` / `checkEligibility` / `blockCard` / `notifyCustomer` functions. `GET_CARD` routes to `locateCard` when `cardLast4` is present, else `confirmCard` — express the `locate` rules with a `$.cardLast4 exists: true` condition plus the `cardLast4` value; the `confirm` rules omit the `exists` check.

Full concrete file (every scenario from the reference tables, no placeholders):

```yaml
# ---- GET_CARD: LocateCard (cardLast4 present) ----
- id: locate-card-not-found
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "0001" }] }
  response: { status: 404, body: { reason: CARD_NOT_FOUND } }
- id: locate-card-service-down
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "0002" }] }
  response: { status: 500, body: { reason: CARD_SERVICE_ERROR } }
- id: locate-card-already-blocked
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "1001" }] }
  response: { status: 200, body: { cardId: card-already-blocked, status: ACTIVE, last4: "1001" } }
- id: locate-card-closed
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "1002" }] }
  response: { status: 200, body: { cardId: card-closed, status: ACTIVE, last4: "1002" } }
- id: locate-card-replaced
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "1003" }] }
  response: { status: 200, body: { cardId: card-replaced, status: ACTIVE, last4: "1003" } }
- id: locate-card-elig-svc-down
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "1004" }] }
  response: { status: 200, body: { cardId: card-elig-svc-down, status: ACTIVE, last4: "1004" } }
- id: locate-card-block-race
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "2001" }] }
  response: { status: 200, body: { cardId: card-block-race, status: ACTIVE, last4: "2001" } }
- id: locate-card-block-fail
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "2002" }] }
  response: { status: 200, body: { cardId: card-block-fail, status: ACTIVE, last4: "2002" } }
- id: locate-card-stale-confirm
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "3001" }] }
  response: { status: 200, body: { cardId: card-stale-confirm, status: ACTIVE, last4: "3001" } }
- id: locate-card-notify-fail
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "4001" }] }
  response: { status: 200, body: { cardId: card-notify-fail, status: ACTIVE, last4: "4001" } }
- id: locate-card-notify-queued
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }, { jsonPath: $.cardLast4, equals: "4002" }] }
  response: { status: 200, body: { cardId: card-notify-queued, status: ACTIVE, last4: "4002" } }
- id: locate-card-happy
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardLast4, exists: true }] }
  response: { status: 200, body: { cardId: card-happy, status: ACTIVE, last4: "{{request.body.cardLast4}}" } }

# ---- GET_CARD: ConfirmCardBlocked (cardLast4 absent) ----
- id: confirm-card-stale
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1, match: [{ jsonPath: $.cardId, equals: card-stale-confirm }] }
  response: { status: 200, body: { cardId: card-stale-confirm, status: ACTIVE } }
- id: confirm-card-blocked
  request: { method: POST, path: /acropolis-card-mgmt/GET_CARD/v1 }
  response: { status: 200, body: { cardId: "{{request.body.cardId}}", status: BLOCKED } }

# ---- CHECK_CARD_ELIGIBILITY ----
- id: eligibility-already-blocked
  request: { method: POST, path: /acropolis-card-mgmt/CHECK_CARD_ELIGIBILITY/v1, match: [{ jsonPath: $.cardId, equals: card-already-blocked }] }
  response: { status: 200, body: { eligible: false, reason: ALREADY_BLOCKED } }
- id: eligibility-card-closed
  request: { method: POST, path: /acropolis-card-mgmt/CHECK_CARD_ELIGIBILITY/v1, match: [{ jsonPath: $.cardId, equals: card-closed }] }
  response: { status: 200, body: { eligible: false, reason: CARD_CLOSED } }
- id: eligibility-card-replaced
  request: { method: POST, path: /acropolis-card-mgmt/CHECK_CARD_ELIGIBILITY/v1, match: [{ jsonPath: $.cardId, equals: card-replaced }] }
  response: { status: 200, body: { eligible: false, reason: CARD_REPLACED } }
- id: eligibility-svc-down
  request: { method: POST, path: /acropolis-card-mgmt/CHECK_CARD_ELIGIBILITY/v1, match: [{ jsonPath: $.cardId, equals: card-elig-svc-down }] }
  response: { status: 500, body: { eligible: false, reason: ELIGIBILITY_SERVICE_ERROR } }
- id: eligibility-default
  request: { method: POST, path: /acropolis-card-mgmt/CHECK_CARD_ELIGIBILITY/v1 }
  response: { status: 200, body: { eligible: true } }

# ---- BLOCK_CARD ----
- id: block-race
  request: { method: POST, path: /acropolis-card-mgmt/BLOCK_CARD/v1, match: [{ jsonPath: $.cardId, equals: card-block-race }] }
  response: { status: 409, body: { status: FAILED, reason: ALREADY_BLOCKED } }
- id: block-fail
  request: { method: POST, path: /acropolis-card-mgmt/BLOCK_CARD/v1, match: [{ jsonPath: $.cardId, equals: card-block-fail }] }
  response: { status: 500, body: { status: FAILED, reason: BLOCK_FAILED } }
- id: block-default
  request: { method: POST, path: /acropolis-card-mgmt/BLOCK_CARD/v1 }
  response: { status: 200, body: { status: BLOCKED, blockId: "blk_{{request.body.cardId}}", blockedAt: "{{now}}" } }

# ---- NOTIFY_CUSTOMER ----
- id: notify-fail
  request: { method: POST, path: /acropolis-card-mgmt/NOTIFY_CUSTOMER/v1, match: [{ jsonPath: $.cardId, equals: card-notify-fail }] }
  response: { status: 500, body: { sent: false, reason: NOTIFY_SERVICE_ERROR } }
- id: notify-queued
  request: { method: POST, path: /acropolis-card-mgmt/NOTIFY_CUSTOMER/v1, match: [{ jsonPath: $.cardId, equals: card-notify-queued }] }
  response: { status: 200, body: { sent: true, status: QUEUED, notificationId: "ntf_{{request.body.cardId}}" } }
- id: notify-default
  request: { method: POST, path: /acropolis-card-mgmt/NOTIFY_CUSTOMER/v1 }
  response: { status: 200, body: { sent: true, channels: [SMS, IN_APP], notificationId: "ntf_{{request.body.cardId}}" } }
```

If reading the reference reveals a scenario not covered above, add a rule for it in the same shape. Do not leave any comment as a stand-in for a rule.

- [ ] **Step 5: Compile**

```bash
rm -f mocks/.gitkeep
npm run compile
```
Expected: `[compile] wrote mocks.generated.json — 1 project(s), N warning(s)`, warnings only from OpenAPI "no example" operations (if any). Zero `ERROR` lines.

- [ ] **Step 6: Write the end-to-end matrix test `src/engine/scenarios.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import bundle from "@/mocks.generated.json";
import { resolve } from "./resolve";
import type { CompiledBundle } from "../compile/compile";
import type { ParsedRequest, ProjectConfig } from "./types";

const project = (bundle as unknown as CompiledBundle).projects["card-block-lost"] as ProjectConfig;
const post = (path: string, body: unknown): ParsedRequest => ({
  method: "POST", path, headers: {}, query: {}, body, rawBody: JSON.stringify(body),
});
const CMD = "/commands/acropolis-card-mgmt";

describe("card-block-lost scenario matrix", () => {
  it("caller verifies (happy)", () => {
    const r = resolve(post(`${CMD}/VERIFY_CUSTOMER/v1`, { customerId: "cust-ok" }), project);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ verified: true });
  });
  it("unknown caller not verified", () => {
    const r = resolve(post(`${CMD}/VERIFY_CUSTOMER/v1`, { customerId: "cust-unknown" }), project);
    expect(r.body).toMatchObject({ verified: false, reason: "CUSTOMER_NOT_FOUND" });
  });
  it("unauthorised caller -> 401", () => {
    expect(resolve(post(`${CMD}/VERIFY_CUSTOMER/v1`, { customerId: "cust-unauth" }), project).status).toBe(401);
  });
  it("card 0001 not found", () => {
    expect(resolve(post(`${CMD}/GET_CARD/v1`, { cardLast4: "0001" }), project).status).toBe(404);
  });
  it("card 4242 -> card-happy", () => {
    const r = resolve(post(`${CMD}/GET_CARD/v1`, { cardLast4: "4242" }), project);
    expect(r.body).toMatchObject({ cardId: "card-happy", last4: "4242" });
  });
  it("confirm re-read of card-stale-confirm stays ACTIVE", () => {
    const r = resolve(post(`${CMD}/GET_CARD/v1`, { cardId: "card-stale-confirm" }), project);
    expect(r.body).toMatchObject({ status: "ACTIVE" });
  });
  it("eligibility default is eligible", () => {
    expect(resolve(post(`${CMD}/CHECK_CARD_ELIGIBILITY/v1`, { cardId: "card-happy" }), project).body)
      .toMatchObject({ eligible: true });
  });
  it("eligibility of an already-blocked card is false", () => {
    expect(resolve(post(`${CMD}/CHECK_CARD_ELIGIBILITY/v1`, { cardId: "card-already-blocked" }), project).body)
      .toMatchObject({ eligible: false, reason: "ALREADY_BLOCKED" });
  });
  it("block race -> 409", () => {
    expect(resolve(post(`${CMD}/BLOCK_CARD/v1`, { cardId: "card-block-race" }), project).status).toBe(409);
  });
  it("default block succeeds and templates the blockId", () => {
    const r = resolve(post(`${CMD}/BLOCK_CARD/v1`, { cardId: "card-happy" }), project);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "BLOCKED", blockId: "blk_card-happy" });
  });
  it("notify failure -> 500", () => {
    expect(resolve(post(`${CMD}/NOTIFY_CUSTOMER/v1`, { cardId: "card-notify-fail" }), project).status).toBe(500);
  });
  it("notify default sends on SMS + IN_APP", () => {
    expect(resolve(post(`${CMD}/NOTIFY_CUSTOMER/v1`, { cardId: "card-happy" }), project).body)
      .toMatchObject({ sent: true, channels: ["SMS", "IN_APP"] });
  });
});
```

- [ ] **Step 7: Run the matrix**

Run: `npx vitest run src/engine/scenarios.test.ts`
Expected: PASS — every scenario resolves to the status/body from the reference.

- [ ] **Step 8: Full gate + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green; `next build` succeeds.

- [ ] **Step 9: Commit**

```bash
git add mocks/card-block-lost src/engine/scenarios.test.ts
git commit -m "feat: card-block-lost example project + end-to-end scenario matrix"
```

---

## Task 12: Deploy config, local gate scripts, README, format docs

**Files:**
- Create: `vercel.json`
- Create: `scripts/check.mjs`
- Create: `scripts/new-project.mjs`
- Create: `README.md`
- Create: `docs/mock-format.md`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "functions": {
    "app/m/[...slug]/route.ts": { "maxDuration": 10 }
  }
}
```

- [ ] **Step 2: Create `scripts/check.mjs`**

```js
import { execSync } from "node:child_process";

const steps = [
  ["compile", "npm run compile"],
  ["typecheck", "npx tsc --noEmit"],
  ["lint", "npm run lint"],
  ["test", "npx vitest run"],
];

let failed = false;
for (const [name, cmd] of steps) {
  process.stdout.write(`\n▶ ${name}: ${cmd}\n`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch {
    console.error(`✗ ${name} failed`);
    failed = true;
    break;
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Create `scripts/new-project.mjs`**

```js
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const slug = process.argv[2];
if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
  console.error("usage: npm run new-project <slug>   (slug: ^[a-z0-9][a-z0-9-]{0,62}$)");
  process.exit(1);
}
const dir = join("mocks", slug);
if (existsSync(dir)) {
  console.error(`mocks/${slug}/ already exists`);
  process.exit(1);
}
mkdirSync(join(dir, "routes"), { recursive: true });
writeFileSync(join(dir, "project.yaml"),
`name: ${slug}
slug: ${slug}
defaults:
  delayMs: 0
  cors: true
  notFound: { status: 404, body: { reason: UNKNOWN_ROUTE } }
`);
writeFileSync(join(dir, "routes", "main.yaml"),
`- id: example
  request: { method: GET, path: /hello }
  response: { status: 200, body: { message: "hello from ${slug}" } }
`);
console.log(`created mocks/${slug}/ — run 'npm run compile' then hit /m/${slug}/hello`);
```

- [ ] **Step 4: Create `docs/mock-format.md`**

Write the authoring reference. Include, in this order:
1. One-paragraph intro: mocks are files under `mocks/<slug>/`; a change is a PR; production picks it up on the next deploy.
2. `project.yaml` — reproduce the field table from `docs/specs/2026-08-28-mockservers-design.md` section 4.1, framed as "set `slug` to the directory name; `basePath` is stripped before matching".
3. `routes/*.yaml` — reproduce the rule example and the match-condition table from spec section 4.2; state "first match wins" and "to express OR, write two rules".
4. Templating — reproduce the grammar table from spec section 4.3; note unknown tokens fail the build.
5. OpenAPI import — reproduce spec section 4.4; note "examples only; no example -> empty body + build warning" and "hand-written rules override generated ones".
6. Worked example — a copy-pasteable session:
   ```bash
   npm run new-project payments
   # edit mocks/payments/routes/main.yaml
   npm run compile
   npm run dev
   curl -s localhost:3000/m/payments/hello
   ```
7. Reserved paths — `/__` prefix is rejected.

- [ ] **Step 5: Create `README.md`**

Sections:
- **What it is** — one paragraph; link `docs/specs/2026-08-28-mockservers-design.md`.
- **Live** — `https://mockservers.dailyuze.com` (viewer at `/`, `GET /__mock/health`).
- **Add a mock** — `npm run new-project <slug>`; edit `mocks/<slug>/`; open a PR; on merge Vercel redeploys (~40s); hit `https://mockservers.dailyuze.com/m/<slug>/<path>`. Link `docs/mock-format.md`.
- **Local dev** — `npm install`; `npm run dev` (compiles then starts on :3000); `npm run check` before every PR.
- **How it works** — `mocks/` -> `npm run compile` -> `mocks.generated.json` -> `/m/[...slug]` resolves in-memory. No database, no runtime I/O.
- **Deploy / DNS** — reproduce spec section 10: Vercel project -> Settings -> Domains -> add `mockservers.dailyuze.com`; GoDaddy DNS -> CNAME `mockservers` -> `cname.vercel-dns.com`; TLS auto-issued.
- **Deferred** — the bullet list from spec section 13.
- **Repo conventions** — Conventional Commits; after bootstrap, feature branch + PR only; commits use the repo-local personal git identity.

- [ ] **Step 6: Run the gate**

Run: `npm run check`
Expected: `▶ compile`, `▶ typecheck`, `▶ lint`, `▶ test` each pass; exit 0.

- [ ] **Step 7: Smoke test the dev server**

Run:
```bash
npm run dev &
sleep 5
curl -s -X POST localhost:3000/m/card-block-lost/commands/acropolis-card-mgmt/BLOCK_CARD/v1 -H 'content-type: application/json' -d '{"cardId":"card-happy"}'
echo
curl -s localhost:3000/__mock/health
kill %1
```
Expected: first curl -> `{"status":"BLOCKED","blockId":"blk_card-happy","blockedAt":"..."}`; health -> `{"ok":true,...,"projectCount":1,...}`.

- [ ] **Step 8: Commit**

```bash
git add vercel.json scripts/check.mjs scripts/new-project.mjs README.md docs/mock-format.md
git commit -m "docs: README + mock authoring guide; chore: vercel config and local gate scripts"
```

- [ ] **Step 9: Push the bootstrap**

```bash
git log --oneline
git push -u origin main
```
Expected: the design-doc commit + Tasks 1-12 commits pushed to `github.com/KolaparthiDeepak/mockservers`.

---

## Post-plan (manual, outside this plan)

1. Import the repo into Vercel under the personal GitHub account; confirm the first production deploy is green.
2. Add `mockservers.dailyuze.com` in Vercel -> Settings -> Domains; add the GoDaddy CNAME.
3. Verify `https://mockservers.dailyuze.com/__mock/health` and one mock URL.
4. Write the **harness spec** (spec section 13 item 1): `.claude/` hooks (block commit on `main`, block force-push, enforce personal identity, validate `mocks/**` on edit), CI, `main` branch protection.

---

## Self-Review

**Spec coverage:**
- section 3 architecture -> Tasks 1, 9, 10 ✓
- section 4.1 project.yaml -> Task 6 (schema), Task 7 (compile) ✓
- section 4.2 routes/rules + match -> Tasks 3, 6, 7 ✓
- section 4.3 templating -> Task 4; build-time validation wired in Task 7 ✓
- section 4.4 OpenAPI import -> Task 8 ✓
- section 4.5 collisions/warnings -> Task 7 (dead rules), Task 8 (no example) ✓
- section 5 compile pipeline + fail-on-error -> Task 7 ✓
- section 6 runtime request flow -> Task 9 ✓
- section 7 reserved endpoints -> Task 10 ✓
- section 8 error handling -> Tasks 7 (build), 9 (unknown project / notFound), 4-5 (template) ✓
- section 9 testing strategy -> engine Tasks 2-5, compile 6-8, route 9, matrix 11 ✓
- section 10 deployment -> Task 12 (`vercel.json`, README DNS steps) ✓
- section 11 repo bootstrap -> Global Constraints + Task 12 Step 9 ✓
- section 12 first example -> Task 11 ✓
- section 13 deferred -> README (Task 12) + Post-plan ✓

**Placeholder scan:** Task 4 (`no example -> empty body`), Task 8, Task 11 give full concrete YAML — no `# ...` stand-ins remain. Tasks 12 Steps 4-5 describe doc content by numbered section rather than reproducing every table; acceptable because the source (design spec) is in-repo and each item cites the exact section. No `TBD` / "add error handling" / "similar to Task N" anywhere.

**Type consistency:** `ParsedRequest`, `ProjectConfig`, `Route`, `Segment`, `MatchCondition`, `MockResponse`, `ResolveResult`, `HttpMethod` — defined once in Task 2, used unchanged in Tasks 3-11. `TemplateContext` — Task 4, used in Task 5. `CompiledBundle` / `CompileResult` — Task 7, imported in Tasks 8-10. `compileMocks` returns `CompileResult` in Task 7, becomes `async` returning `Promise<CompileResult>` in Task 8 with all call sites (`compile-cli.ts`, `compile.test.ts`) updated in the same task. `expandOpenApi(filePath)` — Task 8, matches its `compile.ts` call site. `parseRequest(req, subPath)` — Task 9, matches its call in `app/m/[...slug]/route.ts`. `resolve(req, project)` — Task 5, called in Task 9 and Task 11.
