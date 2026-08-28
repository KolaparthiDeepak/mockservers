import { describe, expect, it } from "vitest";
import { projectYamlSchema, ruleFileSchema } from "./schema";

describe("projectYamlSchema", () => {
  it("accepts a minimal valid project", () => {
    expect(projectYamlSchema.parse({ name: "X", slug: "x" }).slug).toBe("x");
  });
  it("rejects a bad slug", () => {
    expect(() => projectYamlSchema.parse({ name: "X", slug: "Bad Slug" })).toThrow();
  });
  it("rejects an unknown top-level key", () => {
    expect(() => projectYamlSchema.parse({ name: "X", slug: "x", nope: 1 })).toThrow();
  });
});

describe("ruleFileSchema", () => {
  it("accepts a list of valid rules", () => {
    const rules = ruleFileSchema.parse([
      { id: "a", request: { method: "POST", path: "/x" }, response: { status: 200, body: { ok: true } } },
      { id: "b", request: { method: "*", path: "/y/:id", match: [{ jsonPath: "$.a", equals: "1" }] }, response: { status: 201 } },
    ]);
    expect(rules).toHaveLength(2);
  });
  it("rejects a path without a leading slash", () => {
    expect(() => ruleFileSchema.parse([{ id: "a", request: { method: "GET", path: "x" }, response: { status: 200 } }])).toThrow();
  });
  it("rejects a match item with two operators", () => {
    expect(() => ruleFileSchema.parse([{
      id: "a", request: { method: "GET", path: "/x", match: [{ jsonPath: "$.a", equals: "1", contains: "1" }] },
      response: { status: 200 },
    }])).toThrow();
  });
  it("rejects a match item with no target", () => {
    expect(() => ruleFileSchema.parse([{
      id: "a", request: { method: "GET", path: "/x", match: [{ equals: "1" }] }, response: { status: 200 },
    }])).toThrow();
  });
});
