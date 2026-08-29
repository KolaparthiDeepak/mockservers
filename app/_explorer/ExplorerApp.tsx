"use client";
import { useState } from "react";
import type { ViewModel } from "@/src/viewer/model";
import { Explorer } from "./Explorer";
import { SlabList } from "./SlabList";
import { ThemeToggle } from "./ThemeToggle";

export default function ExplorerApp({ model }: { model: ViewModel }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const project = model.projects.find((p) => p.slug === selectedSlug) ?? null;
  const n = model.projects.length;

  return (
    <div className="mx-app">
      {project ? (
        <Explorer
          project={project}
          projects={model.projects}
          onPickProject={setSelectedSlug}
          onBack={() => setSelectedSlug(null)}
        />
      ) : (
        <>
          <div className="mx-topbar">
            <span className="mx-wordmark">MOCKSERVERS</span>
            <div className="mx-topbar-right">
              <span className="mx-build">
                build {model.build.commit} · {n} project{n === 1 ? "" : "s"}
                {model.build.warnings.length > 0 && ` · ${model.build.warnings.length} warning(s)`}
              </span>
              <ThemeToggle />
            </div>
          </div>
          <SlabList projects={model.projects} onSelect={setSelectedSlug} />
        </>
      )}
    </div>
  );
}
