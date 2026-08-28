import { describe, expect, it } from "vitest";
import { compileSegments, matchPath } from "./match";

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
