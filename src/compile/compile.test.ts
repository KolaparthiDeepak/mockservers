import { describe, expect, it } from "vitest";
import { resolve as pathResolve } from "node:path";
import { compileMocks } from "./compile";

const fx = (name: string) => pathResolve(__dirname, "__fixtures__", name);

describe("compileMocks", () => {
  it("compiles a valid project", async () => {
    const r = await compileMocks(fx("valid"), "abc123");
    expect(r.errors).toEqual([]);
    expect(r.bundle.commit).toBe("abc123");
    const card = r.bundle.projects.card!;
    expect(card.basePath).toBe("/commands");
    expect(card.routes.map((x) => x.id)).toEqual(["block-ok", "block-default", "openapi:cardStatus"]);
    expect(card.routes[0]!.segments).toHaveLength(2);
    expect(card.defaults.notFound.status).toBe(404);
  });
  it("errors when slug does not equal the directory name", async () => {
    const r = await compileMocks(fx("bad-slug"));
    expect(r.errors.join("\n")).toMatch(/slug .* does not match directory name/i);
  });
  it("errors on a route path starting with /__", async () => {
    const r = await compileMocks(fx("valid"), "x", {
      "card/routes/extra.yaml": "- id: bad\n  request: { method: GET, path: /__x }\n  response: { status: 200 }\n",
    });
    expect(r.errors.join("\n")).toMatch(/reserved path/i);
  });
  it("errors on an unknown template token", async () => {
    const r = await compileMocks(fx("valid"), "x", {
      "card/routes/extra.yaml": '- id: t\n  request: { method: GET, path: /t }\n  response: { status: 200, body: "{{evil()}}" }\n',
    });
    expect(r.errors.join("\n")).toMatch(/unknown template token/i);
  });
  it("warns on two unconditional rules for the same method+path", async () => {
    const r = await compileMocks(fx("valid"), "x", {
      "card/routes/extra.yaml":
        "- id: d1\n  request: { method: POST, path: /dupe }\n  response: { status: 200 }\n" +
        "- id: d2\n  request: { method: POST, path: /dupe }\n  response: { status: 200 }\n",
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join("\n")).toMatch(/unreachable/i);
  });
  it("hand-written rules come before OpenAPI-generated ones", async () => {
    const r = await compileMocks(fx("valid"), "x");
    const ids = r.bundle.projects.card!.routes.map((x) => x.id);
    expect(ids.indexOf("block-ok")).toBeLessThan(ids.findIndex((i) => i.startsWith("openapi:")));
    expect(r.bundle.projects.card!.openApiDoc).toBeTruthy();
  });
});
