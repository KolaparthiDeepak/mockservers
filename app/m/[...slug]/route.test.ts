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
        openApiDoc: { openapi: "3.0.3", info: { title: "Demo", version: "1" } },
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
  it("serves the OpenAPI doc on GET /<slug>/__spec but not on POST", async () => {
    const ok = await call(GET, "https://x/m/demo/__spec");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ openapi: "3.0.3" });

    const post = await call(POST, "https://x/m/demo/__spec", { method: "POST", body: "{}" });
    expect(post.status).toBe(404);
    expect(await post.json()).toEqual({ reason: "UNKNOWN_ROUTE" });
  });
  it("answers an OPTIONS preflight with 204", async () => {
    const res = await call(OPTIONS, "https://x/m/demo/commands/verify", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
