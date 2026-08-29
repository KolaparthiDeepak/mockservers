import bundleJson from "@/mocks.generated.json";
import type { CompiledBundle } from "@/src/compile/compile";
import { buildViewModel } from "@/src/viewer/model";
import ExplorerApp from "@/app/_explorer/ExplorerApp";

export default function Viewer() {
  const model = buildViewModel(bundleJson as unknown as CompiledBundle);
  return <ExplorerApp model={model} />;
}
