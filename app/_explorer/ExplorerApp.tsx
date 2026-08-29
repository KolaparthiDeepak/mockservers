"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { ViewModel } from "@/src/viewer/model";
import { Explorer } from "./Explorer";
import { SlabList } from "./SlabList";
import { useSupports3D } from "./useSupports3D";

const Monolith = dynamic(() => import("./Monolith"), { ssr: false });

export default function ExplorerApp({ model }: { model: ViewModel }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const supports3D = useSupports3D();
  const project = model.projects.find((p) => p.slug === selectedSlug) ?? null;
  const phase: "orbit" | "explore" = project ? "explore" : "orbit";
  const has3D = supports3D && model.projects.length > 0;

  return (
    <div className="mx-app">
      {has3D && (
        <div className={`mx-scene${phase === "explore" ? " mx-scene--backdrop" : ""}`}>
          <Monolith projects={model.projects} activeSlug={selectedSlug} onSelect={setSelectedSlug} />
        </div>
      )}

      {phase === "explore" && project ? (
        <Explorer
          project={project}
          projects={model.projects}
          onPickProject={setSelectedSlug}
          onBackToOrbit={() => setSelectedSlug(null)}
        />
      ) : (
        <>
          <div
            className="mx-topbar"
            style={has3D ? { background: "transparent", borderBottom: 0 } : undefined}
          >
            <span className="mx-wordmark">MOCKSERVERS</span>
            <span className="mx-build">
              build {model.build.commit} · {model.projects.length} project(s)
              {has3D && " · drag to orbit · click a slab"}
            </span>
          </div>
          {/* Always render a keyboard-reachable project list in orbit phase:
              as the sole UI when there is no 3D, or as a translucent overlay over the canvas. */}
          <SlabList projects={model.projects} onSelect={setSelectedSlug} overlay={has3D} />
        </>
      )}
    </div>
  );
}
