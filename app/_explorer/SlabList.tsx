"use client";
import type { ProjectVM } from "@/src/viewer/model";

export function SlabList({
  projects,
  onSelect,
  overlay = false,
}: {
  projects: ProjectVM[];
  onSelect: (slug: string) => void;
  overlay?: boolean;
}) {
  if (projects.length === 0) {
    return (
      <p style={{ padding: "2rem", color: "var(--ink-dim)" }}>
        No projects configured. Add one under <code>mocks/</code>.
      </p>
    );
  }
  return (
    <div className={`mx-slablist${overlay ? " mx-slablist--overlay" : ""}`}>
      {projects.map((p) => (
        <button key={p.slug} className="mx-slab-card" onClick={() => onSelect(p.slug)}>
          <span className="mx-wordmark" style={{ fontSize: "1rem" }}>{p.name}</span>
          <span className="mx-build">
            {p.endpoints.length} endpoints · {p.caseCount} cases
            <br />
            <code>/m/{p.slug}</code>
          </span>
        </button>
      ))}
    </div>
  );
}
