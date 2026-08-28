import { describe, expect, it } from "vitest";
import { parseRequest } from "./request";

describe("parseRequest", () => {
  it("parses JSON body, lowercases headers, splits query", async () => {
    const req = new Request("https://x/m/demo/verify?page=2&q=hi", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant": "acme" },
      body: JSON.stringify({ a: 1 }),
    });
    const p = await parseRequest(req, "/verify");
    expect(p.method).toBe("POST");
    expect(p.path).toBe("/verify");
    expect(p.headers["x-tenant"]).toBe("acme");
    expect(p.query).toEqual({ page: "2", q: "hi" });
    expect(p.body).toEqual({ a: 1 });
  });
  it("leaves body undefined for a non-JSON payload", async () => {
    const req = new Request("https://x/m/demo/x", { method: "POST", body: "not json {" });
    const p = await parseRequest(req, "/x");
    expect(p.body).toBeUndefined();
    expect(p.rawBody).toBe("not json {");
  });
  it("handles a bodyless GET", async () => {
    const p = await parseRequest(new Request("https://x/m/demo/x"), "/x");
    expect(p.body).toBeUndefined();
    expect(p.method).toBe("GET");
  });
});
