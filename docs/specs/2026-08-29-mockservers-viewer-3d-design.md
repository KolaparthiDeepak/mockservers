# mockservers viewer — 3D explorer + inline runner

Date: 2026-08-29
Status: design approved (brainstorm), pending implementation plan
Supersedes: the `app/page.tsx` static viewer (46-line table dump)

## 1. Goal

Replace the read-only table viewer with an explorer that lets someone:

1. See every project as a physical object on load (persistent WebGL scene).
2. Drill project → endpoint → case, where a **case** is one configured route
   (its `match` rules define the exact request that triggers it).
3. Read the synthesized `curl` for any case, edit it, and **execute it from the
   browser** against the live mock, seeing status / latency / headers / body.
4. Get a verdict: did the request land on the case I picked, or divert to
   another route?

No backend work beyond one response header. Execution is a same-origin
`fetch` to the existing `/m/<slug>/…` routes.

## 2. Non-goals

- No editing of `mocks/**` from the UI (that is the deferred "browser editing"
  item in the README).
- No request history / saved collections / persistence.
- No auth — the viewer and the mocks are already public.
- No SSR of the WebGL scene.
- No new server route, no proxy, no logging of executed requests beyond what
  `app/m/[...slug]/route.ts` already logs.

## 3. Architecture

```
mocks.generated.json
      │  (imported in app/page.tsx — server component, as today)
      ▼
src/viewer/model.ts ──────── buildViewModel(bundle): ViewModel
      │                      pure, deterministic, unit-tested
      ▼
app/page.tsx (server) renders <ExplorerApp model={viewModel} />
      │
      ├── <Monolith>  — client island, next/dynamic, ssr:false, lazy chunk
      │      react-three-fiber ring of one slab per project.
      │      Orbit (damped). Click slab → onSelectProject(slug).
      │      WebGL unavailable OR prefers-reduced-motion → render nothing,
      │      ExplorerApp shows the flat <SlabList> fallback instead.
      │
      └── <Explorer> — client island, plain React + CSS.
             3 panes: Endpoints │ Cases │ Runner.
             Runner executes fetch(runUrl, {...}) and renders the result.
```

- `app/page.tsx` stays a server component; it only imports the bundle and the
  model builder, then hands a plain serializable `ViewModel` to the client
  `ExplorerApp`. No `"use client"` in `page.tsx`.
- `ExplorerApp` (`app/_explorer/ExplorerApp.tsx`, `"use client"`) owns the
  top-level state machine: `phase: "orbit" | "explore"`, `selectedProject`,
  `selectedEndpoint`, `selectedCase`. It mounts `<Monolith>` always (when
  supported) and `<Explorer>` when `phase === "explore"`.
- The monolith does not unmount on drill-in. On `onSelectProject` the camera
  dollies toward that slab and the scene is pushed behind the panels (lower
  opacity, continues slow auto-rotate) as an ambient backdrop. An "⟲ orbit"
  control in the Explorer header returns to `phase: "orbit"` (camera dollies
  back out).

### 3.1 File layout

```
app/page.tsx                     server: import bundle, build model, render ExplorerApp
app/_explorer/ExplorerApp.tsx    client: phase/selection state, composes Monolith + Explorer
app/_explorer/Monolith.tsx       client: react-three-fiber <Canvas> + Slab ring + camera rig
app/_explorer/Slab.tsx           client: one slab mesh + silk-screen label (drei <Text>)
app/_explorer/Explorer.tsx       client: 3-pane layout, selection wiring
app/_explorer/EndpointList.tsx   client
app/_explorer/CaseList.tsx       client
app/_explorer/Runner.tsx         client: editable request + execute + response + verdict
app/_explorer/SignalTrace.tsx    client: SVG brass trace, case-row anchor → runner anchor
app/_explorer/SlabList.tsx       client: non-WebGL fallback (plain buttons)
app/_explorer/theme.css          design tokens + component styles
src/viewer/model.ts              buildViewModel(bundle) → ViewModel
src/viewer/model.test.ts
src/viewer/curl.ts               synthesizeRequest(caseRoute, endpointOpenApi) → RequestDraft
src/viewer/curl.test.ts
src/viewer/verdict.ts            classifyResult(...) → Verdict
src/viewer/verdict.test.ts
```

`app/_explorer/` uses the underscore prefix so Next.js treats it as a private,
non-routable folder. Literal `_explorer` (not `%5F%5F`-encoded) is correct
here: only route segments that must stay *reachable* need the encoding — this
folder holds components, not routes, and being unroutable is the point.

## 4. Data model

```ts
// src/viewer/model.ts

export interface ViewModel {
  build: { commit: string; builtAt: string; warnings: string[] };
  projects: ProjectVM[];
}

export interface ProjectVM {
  slug: string;
  name: string;
  basePath?: string;
  endpoints: EndpointVM[];
  caseCount: number;          // sum over endpoints, for the slab label
}

export interface EndpointVM {
  key: string;                // `${method} ${path}` — stable id
  method: string;
  path: string;               // basePath-relative, as stored in the bundle
  runUrl: string;             // `/m/${slug}${basePath ?? ""}${path}` — what the runner hits
  summary?: string;           // from OpenAPI operation.summary if present
  cases: CaseVM[];
}

export interface CaseVM {
  id: string;                 // Route.id
  label: string;              // id with `openapi:` prefix trimmed for display
  isOpenApiGenerated: boolean;// id.startsWith("openapi:")
  match: MatchCondition[];    // [] for the catch-all / default route
  expected: { status: number; body?: unknown; headers?: Record<string,string> };
  request: RequestDraft;      // synthesized, see §5
}
```

### 4.1 Grouping rules

- Endpoint key = `method + " " + path` on `Route`. Every route with the same
  key is a case of that endpoint.
- Case order = bundle order, which is match-precedence order (first match wins
  at runtime). Shown top-to-bottom in that order so the UI mirrors resolution
  priority.
- `openapi:`-prefixed routes are kept but visually de-emphasised (fallback
  example responses, always last, no `match`).
- `runUrl`: `path` in the bundle is basePath-relative (see `compile.ts` — paths
  are stored stripped of `basePath`). `runUrl` re-adds it:
  `/m/<slug>` + `basePath` + `path`.
- `summary`: looked up in
  `project.openApiDoc.paths[basePath + path][method.toLowerCase()].summary`.

## 5. Request synthesis (`src/viewer/curl.ts`)

```ts
export interface RequestDraft {
  method: string;
  url: string;                       // runUrl (relative), plus any ?query=
  headers: Record<string, string>;   // includes content-type: application/json for POST/PUT/PATCH
  body?: string;                     // pretty-printed JSON string, or undefined
  curl: string;                      // `curl` command; stored form uses a `$ORIGIN` placeholder
  notes: string[];                   // e.g. "adjust: body.foo must match /bar/"
}

export function synthesizeRequest(c: CaseInput, oaOperation?: OpenApiOperation): RequestDraft
```

Body construction, in order:

1. **Base**: the OpenAPI operation's request example
   (`requestBody.content["application/json"].example`, else the first of
   `...examples[*].value`). If none, `{}`.
2. **Overlay from `match`**: for each `MatchCondition` with a `jsonPath` of the
   form `$.a.b.c` (dot path, no filters/wildcards — the only shape the repo
   uses):
   - `{ equals: v }` → set `a.b.c = v`
   - `{ exists: true }` and the path is absent after step 1 → set
     `a.b.c` to the property's OpenAPI `enum[0]` / `example` if present, else
     the literal string `"<value>"`.
   - `{ contains: v }` → set `a.b.c = v`.
   - `{ notEquals }`, `{ regex }`, `{ exists: false }` → leave the base value,
     push a `notes[]` entry. (None occur in current `mocks/`; must not throw.)
3. **Header conditions**: `{ header: "x-foo", equals|contains: v }` →
   `headers["x-foo"] = v`. Other operators → `notes[]`, no header set.
4. **Query conditions**: `{ query: "q", equals|contains: v }` → append `?q=v`
   (URL-encoded) to `url`. Other operators → `notes[]`.

`curl` string:
`curl -sS -X <METHOD> "$ORIGIN<url>" -H 'content-type: application/json' [-H '<k>: <v>' ...] [-d '<body>']`.
Rendered in the UI with `$ORIGIN` → `window.location.origin`. Copy button
copies the rendered form.

Determinism: no randomness, no faker. Placeholder is the literal `"<value>"`.
Keeps `curl.test.ts` stable.

## 6. Runner (`app/_explorer/Runner.tsx`) + verdict

### 6.1 Execute

- The draft is editable: method (select), url (text), headers (key/value
  rows), body (textarea). "Reset to case" restores the synthesized draft.
- `execute()`:
  ```ts
  const started = performance.now();
  const res = await fetch(url, { method, headers, body: bodyOrUndefined });
  const ms = Math.round(performance.now() - started);
  const text = await res.text();
  ```
- Render: status pill (colour by class — 2xx pass, 4xx divert, 5xx fault),
  `ms`, response headers table, body (pretty JSON if parseable else raw text).
- Errors: `fetch` rejection (network / offline) → red banner
  `✗ request failed: <message>`. Never swallowed. Non-JSON body → shown raw,
  not an error.
- In-flight: button → spinner, disabled. No double-submit.

### 6.2 Verdict (`src/viewer/verdict.ts`)

Needs to know which route actually matched. `resolve()` computes
`matchedRuleId` but `app/m/[...slug]/route.ts` does not expose it.

**Backend change (small):** in `route.ts`, add to the response headers built at
the end of `handle()`:

```ts
"x-mock-rule-id": result.matchedRuleId ?? "",
"x-mock-matched": String(result.matchedRuleId !== null),
```

Same-origin, so the browser reads them with no CORS `expose-headers` work. The
`__spec` and `OPTIONS` branches are unaffected (they return before this point).

```ts
export type Verdict =
  | { kind: "hit"; caseId: string }        // matchedRuleId === selectedCase.id
  | { kind: "divert"; landedOn: string }   // matched a different route
  | { kind: "nomatch" }                    // x-mock-matched: false (fell through to notFound)
  | { kind: "unknown" };                   // header absent → fell back to body compare, inconclusive

export function classifyResult(
  resHeaders: Headers,
  resStatus: number,
  resBodyText: string,
  selectedCase: CaseVM,
): Verdict
```

- Primary signal: `x-mock-rule-id` / `x-mock-matched`.
- Fallback when `x-mock-rule-id` is absent (older deploy): `hit` iff
  `resStatus === expected.status` **and** a loose body match — every leaf in
  `expected.body` whose string value does **not** contain `{{` is deep-equal to
  the same path in the response body (templated leaves like
  `"{{request.body.cardLast4}}"` are skipped). Otherwise `unknown`.
- UI: `hit` → green `✓ matched case: <id>`; `divert` → amber
  `→ landed on: <id>` (that id clickable to jump to the case); `nomatch` →
  amber `→ no route matched (fell through to notFound)`; `unknown` → grey
  `· could not confirm which case matched`.

## 7. Visual design

**Thesis: a fault-injection bench.** The tool exists to force a downstream
workflow down a chosen branch — failure, race, stale read — by choosing
inputs. The UI is an instrument panel, not API docs. The 3D slabs read as
rack-mounted hardware; the panes read as a patch bay.

### 7.1 Type

- **Chivo** (Google Fonts, `next/font/google`) — grotesque, squared terminals.
  Chrome only: wordmark (heavy), pane labels (tracked uppercase, small),
  buttons.
- **IBM Plex Mono** (`next/font/google`) — everything that is data: URL paths,
  method, curl, JSON, case ids, status codes, latency, headers.
- No third face.
- Scale (rem): wordmark 1.5 / pane-label 0.6875 (tracked 0.12em, uppercase) /
  body-data 0.8125 / code-block 0.8125 / status-pill 0.75. Line-height 1.5 for
  code, 1.3 for chrome.

### 7.2 Palette (warm graphite — deliberately not blue-black)

```
--ground     #12100E   page background
--panel      #1B1815   pane surfaces
--panel-2    #211D19   inset (code blocks, textarea)
--rule       #322D28   hairline borders (1px, no shadows)
--ink        #E8E2D9   primary text
--ink-dim    #8A8177   secondary text, inactive
--pass       #6FB86A   2xx / verdict hit
--divert     #D99A4E   4xx / verdict divert
--fault      #D5563F   5xx / request failed
--trace      #C9A15E   brass — signal-trace lines, wordmark accent, active slab edge
```

Dark-only — this is an instrument, it commits to one look. `body` background is
set explicitly to `--ground`. No light-mode variant.

### 7.3 Layout

Landing (`phase: "orbit"`):

```
┌───────────────────────────────────────────────┐
│ MOCKSERVERS                     build f881493 │
│                                               │
│          ▟▔▔▙    ▟▔▔▙    ▟▔▔▙                 │  ring of slabs, y-axis
│         ▕CARD ▏ ▕ …  ▏ ▕ …  ▏                 │  auto-rotate ~0.2 rad/s
│         ▕BLOCK▏ ▕    ▏ ▕    ▏                 │  drag = orbit (OrbitControls, damped,
│         ▕5·31 ▏ ▕    ▏ ▕    ▏                 │  no zoom, no pan, polar clamped)
│          ▜▁▁▛    ▜▁▁▛    ▜▁▁▛                 │
│                                               │
│      drag to orbit · click a slab · skip →    │
└───────────────────────────────────────────────┘
```

Explorer (`phase: "explore"` — scene recedes to backdrop at ~0.15 opacity):

```
┌ MOCKSERVERS ────────────── card-block-lost ▾ ──────────── ⟲ orbit ┐
├───────────────┬────────────────────┬──────────────────────────────┤
│ ENDPOINTS     │ CASES · GET_CARD   │ RUNNER                       │
│               │                    │ POST  /m/card-block-lost/    │
│ ▸GET_CARD  13 │ ●not-found     404 ╞══╗    commands/acropolis-... │
│  CHECK_ELIG  5│ ○service-down  500 │  ║  ┌ headers ──────────────┐│
│  BLOCK_CARD  4│ ○already-blk   200 │  ║  │ content-type: applica…││
│  NOTIFY      3│ ○card-closed   200 │  ║  ├ body ──────── editable┤│
│  VERIFY      6│ ○card-replaced 200 │  ║  │ { "cardLast4": "0001" }││
│               │ ○…                 │  ║  └───────────────────────┘│
│               │ ─ openapi:getCard  │  ╚═▶ [ execute ]   ⧗ 34 ms  │
│               │                    │ ┌ response ───────────── 404┐│
│               │                    │ │ { "reason":"CARD_NOT_FND"}││
│               │                    │ └──────────────────────────┘│
│               │                    │ ✓ matched case: not-found   │
└───────────────┴────────────────────┴──────────────────────────────┘
```

- Panes: fixed 3-column grid on ≥ 960px
  (`minmax(180px,1fr) minmax(220px,1.2fr) minmax(360px,2fr)`), each
  independently scrollable, 1px `--rule` dividers.
- Endpoint / case rows: no borders, 32px height, hover = `--panel-2`, selected
  = `--trace` left-border 2px + `--ink` text.
- Status shown as a bare 3-digit number in Plex Mono, coloured by class.

### 7.4 Signature: signal traces

`SignalTrace.tsx` renders an SVG overlay (`position: fixed`, `pointer-events:
none`) spanning the cases + runner columns. One brass polyline with 90° elbows
from the right edge of the **selected case row** to the left edge of the
runner's request block, routed through the column gutter. Anchor coordinates
come from `getBoundingClientRect()` on the selected row and the request block,
recomputed on scroll / resize / selection change.

- Idle: 1px `--trace` at 0.5 opacity.
- On `execute()`: a 3px light segment (`--ink` glow) travels the polyline
  case → runner over ~450ms (single pass), then the runner-end node fills with
  the verdict colour (`--pass` / `--divert` / `--fault`).
- `prefers-reduced-motion`: no travelling pulse — the end node just switches
  colour on result. The trace itself is static either way.

The one deliberate risk. It encodes the actual data path (this input selects
this outcome), not decoration. Everything else stays quiet: hairlines, one
accent, no shadows outside the 3D canvas.

### 7.5 3D scene detail

- `<Canvas>` `dpr={[1, 1.75]}`, `gl={{ antialias: true }}`,
  `camera={{ position: [0, 1.5, 7], fov: 45 }}`.
- One `Slab` per project:
  `<RoundedBox args={[1.3, 2, 0.18]} radius={0.03}>`, `meshStandardMaterial`
  `#2A2622`, roughness 0.6, metalness 0.35. On a circle of radius
  `max(2.4, projectCount * 0.5)` in the XZ plane, each facing outward.
- Silk-screen: drei `<Text>` (Plex Mono woff, see §13), colour `--ink-dim`,
  `name \n endpoints·cases`. A small emissive quad (`--trace`,
  `emissiveIntensity` 0.6–1.0 over 3s) bottom-left as a "power" light.
- Lighting: one warm `directionalLight` `#FFECD8` intensity 1.2 front-top-right;
  one cool `ambientLight` `#20263A` intensity 0.4; a dim rim `pointLight`
  behind. No `Environment` HDR (keeps the chunk small).
- Hover: slab scale 1.04, edge emissive `--trace`. Click → `onSelectProject`.
- Active slab (explore phase): `--trace` emissive edge stays on.
- Camera rig: `useFrame` lerp of camera position + `OrbitControls` target
  toward the selected slab on drill-in, back to origin on "orbit".
- Auto-rotate: `OrbitControls autoRotate autoRotateSpeed={0.6}`, off under
  `prefers-reduced-motion`.

### 7.6 Styling mechanism

Plain CSS in `app/_explorer/theme.css`, imported by `ExplorerApp`. Tokens as
`:root` custom properties; component classes namespaced `.mx-*` to avoid the
selector-specificity traps in the frontend-design guidance. No CSS framework.
(`app/layout.tsx` currently ships no global CSS; this is the first.)

## 8. Responsive / accessibility / quality floor

- **< 960px**: panes collapse to a single-column drill stack with a breadcrumb
  bar (`card-block-lost › GET_CARD › not-found`) and back navigation. Runner is
  full-width at the bottom when a case is selected.
- **< 960px 3D**: `<Monolith>` renders a single static slab (no auto-rotate, no
  OrbitControls) with an "enter" button, or the `<SlabList>` fallback. No full
  WebGL orbit scene on small screens.
- **No WebGL** (`!window.WebGLRenderingContext` or context creation throws):
  `<SlabList>` — a plain vertical list of project buttons — replaces the
  canvas. Explorer fully usable.
- **prefers-reduced-motion**: no auto-rotate, no camera dolly (instant cut), no
  trace pulse, no slab hover-scale transition.
- **Keyboard**: endpoint and case lists are `role="listbox"` / `role="option"`
  with arrow-key navigation and visible `--trace` 2px focus outline. Runner is
  ordinary form controls. The 3D canvas is not keyboard-interactive; project
  selection is *always also* possible via the `card-block-lost ▾` dropdown in
  the Explorer header, so the scene is never the only path.
- **Focus**: visible ring on every interactive element, never removed.
- Colour is never the only signal: verdict has icon + text, status has the
  number, case selection has the left border + bold.

## 9. Error handling summary

| Condition | Behaviour |
|---|---|
| `fetch` rejects | red `✗ request failed: <message>`, verdict hidden |
| response body not JSON | shown raw, not an error |
| no `x-mock-rule-id` (older deploy) | verdict → status + loose-body compare → `hit` or `unknown` |
| endpoint has 0 non-openapi cases | only the `openapi:` fallback shown, de-emphasised, still runnable |
| project has no `openApiDoc` | no summaries, base body `{}`; rest works |
| WebGL context lost mid-session | error boundary around `<Canvas>` → swap to `<SlabList>`, keep explorer state |
| bundle has 0 projects | landing shows "No projects configured", no canvas |
| `match` operator the synthesizer can't render exactly | body still produced (best effort) + `notes[]` entry shown in UI; never throws |

## 10. Testing

Vitest is already configured (`npm run check` runs it).

- `src/viewer/model.test.ts` — `buildViewModel`: grouping by method+path, case
  order preserved, `caseCount`, `runUrl` rebuilds basePath, `summary` lookup,
  0-project and no-openapi bundles.
- `src/viewer/curl.test.ts` — `synthesizeRequest`: `equals` overlay onto
  OpenAPI example; `exists:true` → enum/example else `"<value>"`; header and
  query conditions; unsupported operators produce `notes[]` and don't throw;
  deterministic output; `curl` string shape with `$ORIGIN`.
- `src/viewer/verdict.test.ts` — `classifyResult`: `hit` / `divert` /
  `nomatch` from headers; fallback loose-body compare skips `{{…}}` leaves;
  header-absent + differing body → `unknown`.
- `app/m/[...slug]/route.test.ts` — extend: `x-mock-rule-id` / `x-mock-matched`
  present and correct on a matched and an unmatched request.
- One React Testing Library smoke test on `<Explorer>` (mocked `fetch`):
  select endpoint → select case → curl renders → execute → response + verdict
  render. No `<Monolith>` / WebGL test.

## 11. Dependencies added

| Package | Why | Approx cost |
|---|---|---|
| `three` | WebGL engine | ~600 kB (lazy chunk only) |
| `@react-three/fiber` | React renderer for three | ~50 kB |
| `@react-three/drei` | `OrbitControls`, `RoundedBox`, `Text` | tree-shaken, ~30–60 kB used |

All three load only in the `Monolith` dynamic chunk — `app/page.tsx`, the
explorer, and the runner carry zero three.js. `next.config.mjs` may need
`transpilePackages: ["three"]` (verify during implementation).

## 12. Rollout

- Single PR, feature branch (repo rule: no direct commits to `main`).
- Vercel preview deploy exercises the real `/m/*` routes — runner testable live
  on the preview URL before merge.
- `npm run check` green (compile + tsc + eslint + vitest) is the gate.
- The old `app/page.tsx` table is fully replaced; `/` stays the only viewer
  route. With JS disabled it shows `<SlabList>` + a `<noscript>` note (the
  runner needs JS — acceptable for an interactive tool).

## 13. Open items for the implementation plan

- Confirm `next/font/google` has `Chivo` + `IBM Plex Mono` (both on Google
  Fonts — expected fine).
- drei `<Text>` needs a font file URL; self-host Plex Mono `.woff` in
  `public/fonts/` and point `<Text font=...>` at it.
- Camera dolly easing + duration — tune by feel during build.
- `transpilePackages` / any Next 15 + three ESM interop wrinkle.
- Exact `.mx-*` class inventory + the responsive breakpoint CSS.
</content>
