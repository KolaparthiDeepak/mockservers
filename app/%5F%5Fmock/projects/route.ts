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
