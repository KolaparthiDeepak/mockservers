import { execSync } from "node:child_process";

const steps = [
  ["compile", "npm run compile"],
  ["typecheck", "npx tsc --noEmit"],
  ["lint", "npm run lint"],
  ["test", "npx vitest run"],
];

let failed = false;
for (const [name, cmd] of steps) {
  process.stdout.write(`\n▶ ${name}: ${cmd}\n`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch {
    console.error(`✗ ${name} failed`);
    failed = true;
    break;
  }
}
process.exit(failed ? 1 : 0);
