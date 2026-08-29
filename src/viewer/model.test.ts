import { describe, expect, it } from "vitest";
import type { CompiledBundle } from "@/src/compile/compile";
import { buildViewModel } from "./model";

const bundle = {
  builtAt: "2026-08-29T00:00:00Z",
  commit: "abc1234",
  warnings: ["w1"],
  projects: {
    demo: {
      name: "Demo",
      slug: "demo",
      basePath: "/commands",
      defaults: { delayMs: 0, cors: true, notFound: { status: 404, body: { reason: "UNKNOWN_ROUTE" } } },
      routes: [
        {
          id: "not-found", method: "POST", path: "/svc/GET_CARD/v1",
          segments: [], match: [{ jsonPath: "$.cardLast4", equals: "0001" }],
          response: { status: 404, body: { reason: "CARD_NOT_FOUND" } },
        },
        {
          id: "happy", method: "POST", path: "/svc/GET_CARD/v1",
          segments: [], match: [{ jsonPath: "$.cardLast4", exists: true }],
          response: { status: 200, body: { status: "ACTIVE" } },
        },
        {
          id: "openapi:getCard", method: "POST", path: "/svc/GET_CARD/v1",
          segments: [], response: { status: 200, body: { status: "ACTIVE" } },
        },
        {
          id: "block", method: "POST", path: "/svc/BLOCK_CARD/v1",
          segments: [], response: { status: 200, body: { status: "BLOCKED" } },
        },
      ],
      openApiDoc: {
        openapi: "3.0.3",
        paths: {
          "/commands/svc/GET_CARD/v1": {
            post: {
              summary: "Look up a card",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { cardLast4: { type: "string" } } },
                    examples: { ok: { value: { customerId: "cust_1", cardLast4: "4242" } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as unknown as CompiledBundle;

describe("buildViewModel", () => {
  it("carries build metadata through", () => {
    const vm = buildViewModel(bundle);
    expect(vm.build).toEqual({ commit: "abc1234", builtAt: "2026-08-29T00:00:00Z", warnings: ["w1"] });
  });

  it("groups routes into endpoints by method+path, preserving route order as case order", () => {
    const p = buildViewModel(bundle).projects[0]!;
    expect(p.endpoints.map((e) => e.key)).toEqual(["POST /svc/GET_CARD/v1", "POST /svc/BLOCK_CARD/v1"]);
    expect(p.endpoints[0]!.cases.map((c) => c.id)).toEqual(["not-found", "happy", "openapi:getCard"]);
    expect(p.caseCount).toBe(4);
  });

  it("rebuilds runUrl from slug + basePath + route path", () => {
    const p = buildViewModel(bundle).projects[0]!;
    expect(p.endpoints[0]!.runUrl).toBe("/m/demo/commands/svc/GET_CARD/v1");
  });

  it("pulls the OpenAPI summary and feeds the example into request synthesis", () => {
    const ep = buildViewModel(bundle).projects[0]!.endpoints[0]!;
    expect(ep.summary).toBe("Look up a card");
    // "not-found" case: example cardLast4 "4242" overridden by equals "0001"
    expect(JSON.parse(ep.cases[0]!.request.body!)).toEqual({ customerId: "cust_1", cardLast4: "0001" });
  });

  it("ignores an array-shaped OpenAPI example, still applying the match overlay", () => {
    const arrExample = {
      builtAt: "t", commit: "c", warnings: [],
      projects: { demo: {
        name: "Demo", slug: "demo", basePath: "/commands",
        defaults: { delayMs: 0, cors: true, notFound: { status: 404, body: {} } },
        routes: [{
          id: "not-found", method: "POST", path: "/svc/GET_CARD/v1",
          segments: [], match: [{ jsonPath: "$.cardLast4", equals: "0001" }],
          response: { status: 404, body: { reason: "CARD_NOT_FOUND" } },
        }],
        openApiDoc: {
          openapi: "3.0.3",
          paths: { "/commands/svc/GET_CARD/v1": { post: {
            requestBody: { content: { "application/json": {
              examples: { bad: { value: [{ cardLast4: "4242" }] } },
            } } },
          } } },
        },
      } },
    } as unknown as CompiledBundle;
    const c = buildViewModel(arrExample).projects[0]!.endpoints[0]!.cases[0]!;
    expect(JSON.parse(c.request.body!)).toEqual({ cardLast4: "0001" });
  });

  it("fills OpenAPI-required request props a case's match rules don't cover", () => {
    const req = {
      builtAt: "t", commit: "c", warnings: [],
      projects: { demo: {
        name: "Demo", slug: "demo", basePath: "/commands",
        defaults: { delayMs: 0, cors: true, notFound: { status: 404, body: {} } },
        routes: [{
          id: "verify-default", method: "POST", path: "/svc/VERIFY_CUSTOMER/v1",
          segments: [], response: { status: 200, body: { verified: true } },
        }],
        openApiDoc: {
          openapi: "3.0.3",
          paths: { "/commands/svc/VERIFY_CUSTOMER/v1": { post: {
            requestBody: { content: { "application/json": {
              schema: {
                type: "object",
                required: ["customerId", "contactChannel"],
                properties: { contactChannel: { enum: ["SMS", "EMAIL"] } },
              },
            } } },
          } } },
        },
      } },
    } as unknown as CompiledBundle;
    const c = buildViewModel(req).projects[0]!.endpoints[0]!.cases[0]!;
    expect(JSON.parse(c.request.body!)).toEqual({ customerId: "<value>", contactChannel: "SMS" });
  });

  it("flags openapi-generated cases", () => {
    const cases = buildViewModel(bundle).projects[0]!.endpoints[0]!.cases;
    expect(cases[2]).toMatchObject({ id: "openapi:getCard", label: "getCard", isOpenApiGenerated: true });
    expect(cases[0]!.isOpenApiGenerated).toBe(false);
  });

  it("handles a project with no basePath and no openApiDoc", () => {
    const bare = {
      builtAt: "t", commit: "c", warnings: [],
      projects: { bare: {
        name: "Bare", slug: "bare",
        defaults: { delayMs: 0, cors: true, notFound: { status: 404, body: {} } },
        routes: [{ id: "r", method: "GET", path: "/ping", segments: [], response: { status: 200, body: { ok: true } } }],
      } },
    } as unknown as CompiledBundle;
    const ep = buildViewModel(bare).projects[0]!.endpoints[0]!;
    expect(ep.runUrl).toBe("/m/bare/ping");
    expect(ep.summary).toBeUndefined();
    expect(ep.cases[0]!.request.body).toBeUndefined(); // GET
  });

  it("returns an empty projects array for an empty bundle", () => {
    const vm = buildViewModel({ builtAt: "t", commit: "c", warnings: [], projects: {} } as CompiledBundle);
    expect(vm.projects).toEqual([]);
  });
});
