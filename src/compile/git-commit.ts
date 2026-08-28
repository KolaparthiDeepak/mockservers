import { execSync } from "node:child_process";

/** Resolve the current commit sha: Vercel build env first, then local git, then "dev". */
export function gitCommit(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  if (vercelSha) return vercelSha;
  try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); }
  catch { return "dev"; }
}
