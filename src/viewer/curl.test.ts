import { describe, expect, it } from "vitest";
import { synthesizeRequest } from "./curl";

const base = { method: "POST", runUrl: "/m/p/x/GET_CARD/v1" } as const;

describe("synthesizeRequest", () => {
  it("overlays an `equals` jsonPath condition onto the OpenAPI example", () => {
    const d = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.cardLast4", equals: "0001" }],
      requestExample: { customerId: "cust_1", cardLast4: "4242" },
    });
    expect(JSON.parse(d.body!)).toEqual({ customerId: "cust_1", cardLast4: "0001" });
    expect(d.headers["content-type"]).toBe("application/json");
    expect(d.method).toBe("POST");
    expect(d.url).toBe("/m/p/x/GET_CARD/v1");
  });

  it("fills an `exists: true` path from the schema enum, else a literal placeholder", () => {
    const withEnum = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.reason", exists: true }],
      requestSchemaProps: { reason: { enum: ["LOST_OR_STOLEN"] } },
    });
    expect(JSON.parse(withEnum.body!)).toEqual({ reason: "LOST_OR_STOLEN" });

    const noHint = synthesizeRequest({ ...base, match: [{ jsonPath: "$.cardId", exists: true }] });
    expect(JSON.parse(noHint.body!)).toEqual({ cardId: "<value>" });
  });

  it("does not overwrite a value the example already supplies for an `exists` path", () => {
    const d = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.cardLast4", exists: true }],
      requestExample: { cardLast4: "4242" },
    });
    expect(JSON.parse(d.body!)).toEqual({ cardLast4: "4242" });
  });

  it("maps header and query conditions, not the body", () => {
    const d = synthesizeRequest({
      ...base,
      match: [
        { header: "X-Tenant", equals: "acme" },
        { query: "trace", equals: "1" },
      ],
    });
    expect(d.headers["x-tenant"]).toBe("acme");
    expect(d.url).toBe("/m/p/x/GET_CARD/v1?trace=1");
  });

  it("records a note for operators it cannot render exactly, and never throws", () => {
    const d = synthesizeRequest({
      ...base,
      match: [
        { jsonPath: "$.name", regex: "^A" },
        { jsonPath: "$.k", notEquals: "v" },
        { jsonPath: "$[*].bad", equals: "x" },
      ],
    });
    expect(d.notes.length).toBe(3);
    expect(d.notes[0]).toContain("must match");
  });

  it("omits the body and content-type for GET", () => {
    const d = synthesizeRequest({ ...base, method: "GET", match: [] });
    expect(d.body).toBeUndefined();
    expect(d.headers["content-type"]).toBeUndefined();
  });

  it("renders a deterministic curl string with a $ORIGIN prefix", () => {
    const d = synthesizeRequest({
      ...base,
      match: [{ jsonPath: "$.cardLast4", equals: "0001" }],
      requestExample: { cardLast4: "x" },
    });
    expect(d.curl).toContain(`curl -sS -X POST "$ORIGIN/m/p/x/GET_CARD/v1"`);
    expect(d.curl).toContain(`-H 'content-type: application/json'`);
    expect(d.curl).toContain(`"cardLast4": "0001"`);
  });
});
