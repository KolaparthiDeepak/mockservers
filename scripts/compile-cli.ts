// Replaced fully in Task 7. Stub: writes an empty bundle so `next build` succeeds pre-engine.
import { writeFileSync } from "node:fs";

const stub = { builtAt: new Date().toISOString(), commit: "dev", warnings: [], projects: {} };
writeFileSync("mocks.generated.json", JSON.stringify(stub, null, 2));
console.log("[compile] wrote stub mocks.generated.json (Task 7 replaces this)");
