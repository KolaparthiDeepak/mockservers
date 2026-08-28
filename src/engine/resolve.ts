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
