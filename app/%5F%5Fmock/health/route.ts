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
