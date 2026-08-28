import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { expandOpenApi } from "./expand";

const fx = (n: string) => resolve(__dirname, "__fixtures__", n);

describe("expandOpenApi", () => {
  it("generates routes from examples and maps {param} -> :param", async () => {
    const r = await expandOpenApi(fx("with-examples.yaml"));
    expect(r.warnings).toEqual([]);
    const get = r.routes.find((x) => x.id === "openapi:getUser")!;
    expect(get.method).toBe("GET");
    expect(get.path).toBe("/users/:id");
    expect(get.response).toEqual({ status: 200, body: { id: "u1", name: "Ada" } });
    const post = r.routes.find((x) => x.id === "openapi:POST /ping")!;
    expect(post.response).toEqual({ status: 201, body: { pong: true } });
  });
  it("emits a warning and a null body when an operation has no example", async () => {
    const r = await expandOpenApi(fx("no-examples.yaml"));
    expect(r.routes[0]!.response).toEqual({ status: 200, body: null });
    expect(r.warnings.join("\n")).toMatch(/no example/i);
  });
  it("treats an explicit `example: null` as no example", async () => {
    const r = await expandOpenApi(fx("null-example.yaml"));
    expect(r.routes[0]!.response).toEqual({ status: 200, body: null });
    expect(r.warnings.join("\n")).toMatch(/no example/i);
  });
});
