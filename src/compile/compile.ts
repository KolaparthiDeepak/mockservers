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

export async function compileMocks(
  mocksDir: string,
  commit = "dev",
  overlayFiles: Record<string, string> = {},
): Promise<CompileResult> {
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
      openApiDoc: mergedDoc,
    };
  }

  return {
    bundle: { builtAt: new Date().toISOString(), commit, warnings, projects },
    errors,
    warnings,
  };
}
