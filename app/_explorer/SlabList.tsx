"use client";
import type { ProjectVM } from "@/src/viewer/model";

export function SlabList({
  projects,
  onSelect,
}: {
  projects: ProjectVM[];
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="mx-landing">
      {projects.length === 0 ? (
        <p className="mx-empty">
          No projects configured. Add one under <code>mocks/</code>.
        </p>
      ) : (
        <div className="mx-project-grid">
          {projects.map((p) => (
            <button key={p.slug} className="mx-project-card" onClick={() => onSelect(p.slug)}>
              <span className="mx-project-name">{p.name}</span>
              <span className="mx-project-slug">/m/{p.slug}</span>
              <span className="mx-project-stats">
                <span>
                  <strong>{p.endpoints.length}</strong> endpoints
                </span>
                <span>
                  <strong>{p.caseCount}</strong> cases
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
