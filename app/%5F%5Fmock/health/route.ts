// Do not rename the app/%5F%5Fmock/ folder: Next.js 15 treats any _-prefixed
// folder as private/non-routable, so app/__mock/ would silently 404. The
// URL-encoded %5F%5Fmock name is Next's documented opt-out that keeps
// /__mock/health and /__mock/projects reachable.
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
