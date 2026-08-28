import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileMocks } from "../src/compile/compile";

function gitCommit(): string {
  try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); }
  catch { return "dev"; }
}

const mocksDir = resolve(process.cwd(), "mocks");
const { bundle, errors, warnings } = compileMocks(mocksDir, gitCommit());

for (const w of warnings) console.warn(`[compile] WARN ${w}`);

if (errors.length > 0) {
  for (const e of errors) console.error(`[compile] ERROR ${e}`);
  console.error(`[compile] ${errors.length} error(s) — aborting build`);
  process.exit(1);
}

writeFileSync(resolve(process.cwd(), "mocks.generated.json"), JSON.stringify(bundle, null, 2));
console.log(`[compile] wrote mocks.generated.json — ${Object.keys(bundle.projects).length} project(s), ${warnings.length} warning(s)`);
