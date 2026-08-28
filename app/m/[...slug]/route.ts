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
