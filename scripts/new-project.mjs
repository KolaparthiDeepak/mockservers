import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const slug = process.argv[2];
if (!slug || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
  console.error("usage: npm run new-project <slug>   (slug: ^[a-z0-9][a-z0-9-]{0,62}$)");
  process.exit(1);
}
const dir = join("mocks", slug);
if (existsSync(dir)) {
  console.error(`mocks/${slug}/ already exists`);
  process.exit(1);
}
mkdirSync(join(dir, "routes"), { recursive: true });
writeFileSync(join(dir, "project.yaml"),
`name: ${slug}
slug: ${slug}
defaults:
  delayMs: 0
  cors: true
  notFound: { status: 404, body: { reason: UNKNOWN_ROUTE } }
`);
writeFileSync(join(dir, "routes", "main.yaml"),
`- id: example
  request: { method: GET, path: /hello }
  response: { status: 200, body: { message: "hello from ${slug}" } }
`);
console.log(`created mocks/${slug}/ — run 'npm run compile' then hit /m/${slug}/hello`);
