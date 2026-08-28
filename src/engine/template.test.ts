import { describe, expect, it } from "vitest";
import { parseTemplate, renderDeep, renderTemplate, TemplateError } from "./template";
import type { TemplateContext } from "./template";

const ctx: TemplateContext = {
  body: { cardId: "card-1", nested: { n: 7 } },
  path: { id: "42" },
  query: { q: "hello" },
  header: { "x-req": "abc" },
};

describe("parseTemplate", () => {
  it("accepts every allowed token", () => {
    for (const t of [
      "{{request.body.cardId}}", "{{request.body.nested.n}}", "{{request.path.id}}",
      "{{request.query.q}}", "{{request.header.x-req}}", "{{uuid}}", "{{now}}",
      "{{now.epochMs}}", "{{randomInt 1 100}}",
    ]) {
      expect(() => parseTemplate(`x ${t} y`)).not.toThrow();
    }
  });
  it("rejects unknown tokens", () => {
    expect(() => parseTemplate("{{eval('x')}}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{request.cookies.sid}}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{randomInt 1}}")).toThrow(TemplateError);
  });
  it("ignores strings with no tokens", () => {
    expect(() => parseTemplate("plain text")).not.toThrow();
  });
});

describe("renderTemplate", () => {
  it("substitutes body/path/query/header", () => {
    const w: string[] = [];
    expect(renderTemplate("{{request.body.cardId}}/{{request.path.id}}/{{request.query.q}}/{{request.header.x-req}}", ctx, w))
      .toBe("card-1/42/hello/abc");
    expect(w).toEqual([]);
  });
  it("uuid is a v4 uuid, now is ISO, randomInt is in range", () => {
    const w: string[] = [];
    expect(renderTemplate("{{uuid}}", ctx, w)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(renderTemplate("{{now}}", ctx, w)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number(renderTemplate("{{randomInt 5 5}}", ctx, w))).toBe(5);
  });
  it("missing value renders empty and warns", () => {
    const w: string[] = [];
    expect(renderTemplate("[{{request.body.missing}}]", ctx, w)).toBe("[]");
    expect(w).toHaveLength(1);
  });
  it("function-valued resolution renders empty and warns", () => {
    const w: string[] = [];
    expect(renderTemplate("[{{request.body.constructor}}]", ctx, w)).toBe("[]");
    expect(w).toEqual(["template value not usable: {{request.body.constructor}}"]);
  });
  it("randomInt swaps reversed bounds", () => {
    const w: string[] = [];
    const n = Number(renderTemplate("{{randomInt 5 1}}", ctx, w));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
  });
});

describe("renderDeep", () => {
  it("renders string leaves inside objects and arrays", () => {
    const w: string[] = [];
    expect(renderDeep({ a: "{{request.body.cardId}}", b: [1, "{{request.path.id}}"], c: 3 }, ctx, w))
      .toEqual({ a: "card-1", b: [1, "42"], c: 3 });
  });
});
