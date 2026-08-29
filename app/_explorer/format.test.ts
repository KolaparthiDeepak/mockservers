import { describe, expect, it } from "vitest";
import { parseHeaderLines, prettyBody, verdictText } from "./format";

describe("prettyBody", () => {
  it("pretty-prints JSON", () => {
    expect(prettyBody('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
  it("returns non-JSON unchanged", () => {
    expect(prettyBody("<html>nope")).toBe("<html>nope");
  });
});

describe("verdictText", () => {
  it("labels each verdict kind with a class", () => {
    expect(verdictText({ kind: "hit", caseId: "x" })).toEqual({ text: "✓ matched case: x", cls: "mx-verdict--hit" });
    expect(verdictText({ kind: "divert", landedOn: "y" }).cls).toBe("mx-verdict--divert");
    expect(verdictText({ kind: "nomatch" }).cls).toBe("mx-verdict--nomatch");
    expect(verdictText({ kind: "unknown" }).cls).toBe("mx-verdict--unknown");
  });
});

describe("parseHeaderLines", () => {
  it("parses `k: v` lines, lowercasing keys, ignoring blanks", () => {
    expect(parseHeaderLines("Content-Type: application/json\n\nX-Tenant: acme")).toEqual({
      "content-type": "application/json",
      "x-tenant": "acme",
    });
  });
});
