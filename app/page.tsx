import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";
import { buildViewModel } from "@/src/viewer/model";
import ExplorerApp from "@/app/_explorer/ExplorerApp";

export const metadata = {
  title: "mockservers — explorer",
};

export default function ViewerPage() {
  const model = buildViewModel(bundleJson as unknown as CompiledBundle);
  return (
    <>
      <noscript>
        <div style={{ padding: "1rem", fontFamily: "monospace" }}>
          The explorer and request runner need JavaScript. Configured projects:
          <ul>
            {model.projects.map((p) => (
              <li key={p.slug}>
                <code>/m/{p.slug}</code> — {p.name} ({p.endpoints.length} endpoints, {p.caseCount} cases)
              </li>
            ))}
          </ul>
        </div>
      </noscript>
      <ExplorerApp model={model} />
    </>
  );
}
