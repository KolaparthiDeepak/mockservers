"use client";
import { useEffect, useState } from "react";
import type { ProjectVM } from "@/src/viewer/model";
import { EndpointList } from "./EndpointList";
import { CaseList } from "./CaseList";
import { Runner } from "./Runner";
import { SignalTrace } from "./SignalTrace";
import { ThemeToggle } from "./ThemeToggle";
import { commandCode } from "./endpointLabel";

export function Explorer({
  project,
  projects,
  onPickProject,
  onBack,
}: {
  project: ProjectVM;
  projects: ProjectVM[];
  onPickProject: (slug: string) => void;
  onBack: () => void;
}) {
  const [endpointKey, setEndpointKey] = useState<string | null>(project.endpoints[0]?.key ?? null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [caseEl, setCaseEl] = useState<HTMLElement | null>(null);
  const [runnerEl, setRunnerEl] = useState<HTMLElement | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    setEndpointKey(project.endpoints[0]?.key ?? null);
    setCaseId(null);
    setCaseEl(null);
  }, [project.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const endpoint = project.endpoints.find((e) => e.key === endpointKey) ?? null;
  const activeCase = endpoint?.cases.find((c) => c.id === caseId) ?? null;
  const stage: 0 | 1 | 2 = activeCase ? 2 : endpoint ? 1 : 0;

  return (
    <>
      <div className="mx-topbar">
        <button
          className="mx-wordmark mx-wordmark-btn"
          onClick={onBack}
          title="Back to projects"
        >
          MOCKSERVERS
        </button>
        <div className="mx-topbar-right">
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
          <ThemeToggle />
          <button className="mx-btn" onClick={onBack}>
            ← projects
          </button>
        </div>
      </div>

      <div className="mx-crumbs">
        <button
          className="mx-crumb-btn"
          onClick={() => {
            setEndpointKey(null);
            setCaseId(null);
            setCaseEl(null);
          }}
        >
          {project.slug}
        </button>
        {endpoint && (
          <button
            className="mx-crumb-btn"
            onClick={() => {
              setCaseId(null);
              setCaseEl(null);
            }}
          >
            › {endpoint.method} {endpoint.path}
          </button>
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
              setCaseEl(null);
            }}
          />
        </div>

        <div className="mx-pane" data-collapsed={stage !== 1 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">
            Cases{endpoint ? ` · ${endpoint.summary ?? commandCode(endpoint.path)}` : ""}
          </div>
          {endpoint && (
            <CaseList
              cases={endpoint.cases}
              selectedId={caseId}
              onSelect={setCaseId}
              rowRef={setCaseEl}
            />
          )}
        </div>

        <div className="mx-pane" data-collapsed={stage !== 2 ? "true" : undefined}>
          <div className="mx-pane-head mx-label">Runner</div>
          {activeCase ? (
            <Runner
              key={activeCase.id}
              case_={activeCase}
              requestBlockRef={setRunnerEl}
              onExecuted={() => setPulseKey((k) => k + 1)}
            />
          ) : (
            <p style={{ color: "var(--ink-dim)" }}>Pick a case to build and run its request.</p>
          )}
        </div>
      </div>

      <SignalTrace fromEl={caseEl} toEl={runnerEl} pulseKey={pulseKey} />
    </>
  );
}
