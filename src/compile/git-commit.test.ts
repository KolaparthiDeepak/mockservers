import { afterEach, describe, expect, it, vi } from "vitest";
import { gitCommit } from "./git-commit";

describe("gitCommit", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers VERCEL_GIT_COMMIT_SHA, truncated to 7 chars", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef");
    expect(gitCommit()).toBe("0123456");
  });

  it("falls through when VERCEL_GIT_COMMIT_SHA is empty", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    // no vercel sha => local git sha (this repo) or "dev"; never the empty string
    expect(gitCommit()).not.toBe("");
    expect(gitCommit()).toMatch(/^[0-9a-f]{7,}$|^dev$/);
  });

  it("falls through when VERCEL_GIT_COMMIT_SHA is unset", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined as unknown as string);
    expect(gitCommit()).not.toBe("");
    expect(gitCommit()).toMatch(/^[0-9a-f]{7,}$|^dev$/);
  });
});
