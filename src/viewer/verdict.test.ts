import { describe, expect, it } from "vitest";
import { classifyResult, looseBodyMatch } from "./verdict";

const h = (obj: Record<string, string>) => new Headers(obj);
const sel = { id: "not-found", expected: { status: 404, body: { reason: "CARD_NOT_FOUND" } } };

describe("classifyResult", () => {
  it("hit when x-mock-rule-id equals the selected case id", () => {
    expect(classifyResult(h({ "x-mock-rule-id": "not-found", "x-mock-matched": "true" }), 404, "{}", sel))
      .toEqual({ kind: "hit", caseId: "not-found" });
  });

  it("divert when a different route matched", () => {
    expect(classifyResult(h({ "x-mock-rule-id": "happy", "x-mock-matched": "true" }), 200, "{}", sel))
      .toEqual({ kind: "divert", landedOn: "happy" });
  });

  it("nomatch when x-mock-matched is false", () => {
    expect(classifyResult(h({ "x-mock-rule-id": "", "x-mock-matched": "false" }), 404, "{}", sel))
      .toEqual({ kind: "nomatch" });
  });

  it("falls back to status+body compare when the header is absent -> hit", () => {
    expect(classifyResult(h({}), 404, JSON.stringify({ reason: "CARD_NOT_FOUND" }), sel))
      .toEqual({ kind: "hit", caseId: "not-found" });
  });

  it("falls back to unknown when the header is absent and the body differs", () => {
    expect(classifyResult(h({}), 200, JSON.stringify({ reason: "OTHER" }), sel))
      .toEqual({ kind: "unknown" });
  });

  it("unknown when status matches expected but the body differs", () => {
    expect(
      classifyResult(new Headers({}), 404, JSON.stringify({ reason: "OTHER" }), {
        id: "not-found",
        expected: { status: 404, body: { reason: "CARD_NOT_FOUND" } },
      }),
    ).toEqual({ kind: "unknown" });
  });
});

describe("looseBodyMatch", () => {
  it("ignores templated leaves in expected", () => {
    expect(looseBodyMatch({ last4: "{{request.body.cardLast4}}", status: "ACTIVE" }, { last4: "0001", status: "ACTIVE" }))
      .toBe(true);
  });
  it("fails on a concrete mismatch", () => {
    expect(looseBodyMatch({ status: "ACTIVE" }, { status: "BLOCKED" })).toBe(false);
  });
  it("allows the response to carry extra keys", () => {
    expect(looseBodyMatch({ a: 1 }, { a: 1, b: 2 })).toBe(true);
  });
  it("compares arrays element-wise", () => {
    expect(looseBodyMatch([1, 2], [1, 2])).toBe(true);
    expect(looseBodyMatch([1, 2], [1, 3])).toBe(false);
  });
});
