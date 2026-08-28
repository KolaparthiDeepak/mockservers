import { describe, expect, it } from "vitest";
import { resolve } from "./resolve";
import { compileSegments } from "./match";
import type { ParsedRequest, ProjectConfig } from "./types";

const project: ProjectConfig = {
  name: "Demo",
  slug: "demo",
  basePath: "/commands",
  defaults: { delayMs: 25, cors: true, notFound: { status: 404, body: { reason: "UNKNOWN_ROUTE" } } },
  routes: [
    {
      id: "verify-ok",
      method: "POST",
      path: "/verify/:machine",
      segments: compileSegments("/verify/:machine"),
      match: [{ jsonPath: "$.customerId", equals: "cust-ok" }],
      response: { status: 200, body: { verified: true, machine: "{{request.path.machine}}" } },
    },
    {
      id: "verify-default",
      method: "POST",
      path: "/verify/:machine",
      segments: compileSegments("/verify/:machine"),
      response: { status: 200, body: { verified: false } },
    },
  ],
};

const req = (over: Partial<ParsedRequest> = {}): ParsedRequest => ({
  method: "POST", path: "/commands/verify/acropolis", headers: {}, query: {},
  body: { customerId: "cust-ok" }, rawBody: "", ...over,
});

describe("resolve", () => {
  it("first matching rule wins, basePath stripped, path param templated", () => {
    const r = resolve(req(), project);
    expect(r.matchedRuleId).toBe("verify-ok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ verified: true, machine: "acropolis" });
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.delayMs).toBe(25);
  });
  it("falls through to the unconditional rule when match fails", () => {
    const r = resolve(req({ body: { customerId: "other" } }), project);
    expect(r.matchedRuleId).toBe("verify-default");
    expect(r.body).toEqual({ verified: false });
  });
  it("returns notFound default when nothing matches", () => {
    const r = resolve(req({ path: "/commands/nope" }), project);
    expect(r.matchedRuleId).toBeNull();
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ reason: "UNKNOWN_ROUTE" });
  });
  it("string body gets text/plain and is templated", () => {
    const p: ProjectConfig = {
      ...project,
      routes: [{
        id: "s", method: "GET", path: "/hi", segments: compileSegments("/hi"),
        response: { status: 200, body: "hello {{request.query.name}}" },
      }],
    };
    const r = resolve(req({ method: "GET", path: "/commands/hi", query: { name: "x" }, body: undefined }), p);
    expect(r.body).toBe("hello x");
    expect(r.headers["content-type"]).toBe("text/plain");
  });
});
