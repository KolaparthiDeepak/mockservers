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
  if (mt.example && typeof mt.example === "object" && !Array.isArray(mt.example)) {
    return mt.example as Record<string, unknown>;
  }
  const first = mt.examples ? Object.values(mt.examples)[0]?.value : undefined;
  return first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : undefined;
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
