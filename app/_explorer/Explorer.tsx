"use client";
import { useEffect, useState } from "react";
import type { ProjectVM } from "@/src/viewer/model";
import { EndpointList } from "./EndpointList";
import { CaseList } from "./CaseList";
import { Runner } from "./Runner";

function lastSeg(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function Explorer({
  project,
  projects,
  onPickProject,
  onBackToOrbit,
}: {
  project: ProjectVM;
  projects: ProjectVM[];
  onPickProject: (slug: string) => void;
  onBackToOrbit: () => void;
}) {
  const [endpointKey, setEndpointKey] = useState<string | null>(project.endpoints[0]?.key ?? null);
  const [caseId, setCaseId] = useState<string | null>(null);

  useEffect(() => {
    setEndpointKey(project.endpoints[0]?.key ?? null);
    setCaseId(null);
  }, [project.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const endpoint = project.endpoints.find((e) => e.key === endpointKey) ?? null;
  const activeCase = endpoint?.cases.find((c) => c.id === caseId) ?? null;
  const stage: 0 | 1 | 2 = activeCase ? 2 : endpoint ? 1 : 0;

  return (
    <>
      <div className="mx-topbar">
        <span className="mx-wordmark">MOCKSERVERS</span>
        <label className="mx-label">
          project{" "}
          <select
            value={project.slug}
            onChange={(e) => onPickProject(e.target.value)}
            style={{
              background: "var(--panel-2)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.slug}
              </option>
            ))}
          </select>
        </label>
        <button className="mx-btn" onClick={onBackToOrbit}>
          ⟲ orbit
        </button>
      </div>

      <div className="mx-crumbs">
        <span>{project.slug}</span>
        {endpoint && (
          <span>
            › {endpoint.method} {endpoint.path}
          </span>
        )}
        {activeCase && <span>› {activeCase.label}</span>}
      </div>

      <div className="mx-panes">
        <div className="mx-pane" data-collapsed={stage !== 0 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">Endpoints</div>
          <EndpointList
            endpoints={project.endpoints}
            selectedKey={endpointKey}
            onSelect={(k) => {
              setEndpointKey(k);
              setCaseId(null);
            }}
          />
        </div>

        <div className="mx-pane" data-collapsed={stage !== 1 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">
            Cases{endpoint ? ` · ${endpoint.method} ${lastSeg(endpoint.path)}` : ""}
          </div>
          {endpoint && (
            <CaseList
              cases={endpoint.cases}
              selectedId={caseId}
              onSelect={setCaseId}
              rowRef={() => {
                /* trace anchor wired in Task 8 */
              }}
            />
          )}
        </div>

        <div className="mx-pane" data-collapsed={stage !== 2 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">Runner</div>
          {activeCase ? (
            <Runner key={activeCase.id} case_={activeCase} />
          ) : (
            <p style={{ color: "var(--ink-dim)" }}>Pick a case to build and run its request.</p>
          )}
        </div>
      </div>
    </>
  );
}
