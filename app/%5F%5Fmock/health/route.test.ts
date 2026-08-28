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
