import { describe, expect, it } from "vitest";
import { compileSegments, matchPath, allMatch, evalCondition, methodMatches, resolveJsonPath } from "./match";
import type { ParsedRequest } from "./types";

describe("compileSegments", () => {
  it("splits a literal path", () => {
    expect(compileSegments("/a/b")).toEqual([
      { kind: "literal", value: "a" },
      { kind: "literal", value: "b" },
    ]);
  });
  it("parses :param, * and **", () => {
    expect(compileSegments("/users/:id/*/**")).toEqual([
      { kind: "literal", value: "users" },
      { kind: "param", name: "id" },
      { kind: "wildcard" },
      { kind: "catchall" },
    ]);
  });
  it("treats the root path as zero segments", () => {
    expect(compileSegments("/")).toEqual([]);
  });
});

describe("matchPath", () => {
  const seg = compileSegments("/commands/:machine/:cmd/v1");
  it("matches and extracts params", () => {
    expect(matchPath(seg, "/commands/acropolis/BLOCK_CARD/v1")).toEqual({
      matched: true,
      params: { machine: "acropolis", cmd: "BLOCK_CARD" },
    });
  });
  it("fails on segment-count mismatch", () => {
    expect(matchPath(seg, "/commands/acropolis/BLOCK_CARD").matched).toBe(false);
  });
  it("fails on literal mismatch", () => {
    expect(matchPath(seg, "/commands/acropolis/BLOCK_CARD/v2").matched).toBe(false);
  });
  it("wildcard matches exactly one segment", () => {
    const s = compileSegments("/a/*/c");
    expect(matchPath(s, "/a/x/c").matched).toBe(true);
    expect(matchPath(s, "/a/x/y/c").matched).toBe(false);
  });
  it("catchall matches the rest, including nothing", () => {
    const s = compileSegments("/a/**");
    expect(matchPath(s, "/a").matched).toBe(true);
    expect(matchPath(s, "/a/b/c/d").matched).toBe(true);
    expect(matchPath(s, "/b").matched).toBe(false);
  });
});

const req = (over: Partial<ParsedRequest> = {}): ParsedRequest => ({
  method: "POST",
  path: "/x",
  headers: { "x-tenant": "acme", "content-type": "application/json" },
  query: { page: "2" },
  body: { customerId: "cust-ok", card: { last4: "4242" }, tags: ["a", "b"] },
  rawBody: "",
  ...over,
});

describe("methodMatches", () => {
  it("exact and wildcard", () => {
    expect(methodMatches("POST", "POST")).toBe(true);
    expect(methodMatches("POST", "GET")).toBe(false);
    expect(methodMatches("*", "DELETE")).toBe(true);
  });
  it("is case-insensitive on the request method", () => {
    expect(methodMatches("POST", "post")).toBe(true);
  });
});

describe("resolveJsonPath", () => {
  it("dot and index access", () => {
    expect(resolveJsonPath(req().body, "$.customerId")).toBe("cust-ok");
    expect(resolveJsonPath(req().body, "$.card.last4")).toBe("4242");
    expect(resolveJsonPath(req().body, "$.tags[1]")).toBe("b");
  });
  it("returns undefined for missing paths", () => {
    expect(resolveJsonPath(req().body, "$.nope.deep")).toBeUndefined();
  });
});

describe("evalCondition", () => {
  it("jsonPath equals / notEquals / contains / regex / exists", () => {
    expect(evalCondition({ jsonPath: "$.customerId", equals: "cust-ok" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.customerId", equals: "cust-bad" }, req())).toBe(false);
    expect(evalCondition({ jsonPath: "$.customerId", notEquals: "cust-bad" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.customerId", contains: "ok" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.card.last4", regex: "^\\d{4}$" }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.card.last4", exists: true }, req())).toBe(true);
    expect(evalCondition({ jsonPath: "$.missing", exists: false }, req())).toBe(true);
  });
  it("header and query conditions (header name case-insensitive)", () => {
    expect(evalCondition({ header: "X-Tenant", equals: "acme" }, req())).toBe(true);
    expect(evalCondition({ query: "page", equals: "2" }, req())).toBe(true);
    expect(evalCondition({ header: "x-missing", exists: false }, req())).toBe(true);
  });
});

describe("allMatch", () => {
  it("undefined conditions always match", () => {
    expect(allMatch(undefined, req())).toBe(true);
  });
  it("AND semantics", () => {
    expect(allMatch(
      [{ jsonPath: "$.customerId", equals: "cust-ok" }, { header: "x-tenant", equals: "acme" }],
      req(),
    )).toBe(true);
    expect(allMatch(
      [{ jsonPath: "$.customerId", equals: "cust-ok" }, { header: "x-tenant", equals: "other" }],
      req(),
    )).toBe(false);
  });
});
