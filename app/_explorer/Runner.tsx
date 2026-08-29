"use client";
import { useMemo, useState } from "react";
import type { CaseVM } from "@/src/viewer/model";
import { classifyResult, type Verdict } from "@/src/viewer/verdict";
import { parseHeaderLines, prettyBody, renderCurl, verdictText } from "./format";
import { statusClass } from "./status";

interface RunResult {
  status: number;
  ms: number;
  headers: [string, string][];
  bodyText: string;
  verdict: Verdict;
}

function headersToText(h: Record<string, string>): string {
  return Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function Runner({
  case_,
  requestBlockRef,
  onExecuted,
}: {
  case_: CaseVM;
  requestBlockRef?: (el: HTMLElement | null) => void;
  onExecuted?: () => void;
}) {
  const draft = case_.request;
  const [method, setMethod] = useState(draft.method);
  const [url, setUrl] = useState(draft.url);
  const [headersText, setHeadersText] = useState(headersToText(draft.headers));
  const [body, setBody] = useState(draft.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const curl = useMemo(() => renderCurl(draft.curl), [draft.curl]);

  function reset() {
    setMethod(draft.method);
    setUrl(draft.url);
    setHeadersText(headersToText(draft.headers));
    setBody(draft.body ?? "");
    setResult(null);
    setError(null);
  }

  async function execute() {
    setBusy(true);
    setError(null);
    setResult(null);
    const noBody = ["GET", "HEAD"].includes(method) || body.trim() === "";
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers: parseHeaderLines(headersText),
        body: noBody ? undefined : body,
      });
      const ms = Math.round(performance.now() - started);
      const bodyText = await res.text();
      setResult({
        status: res.status,
        ms,
        headers: [...res.headers.entries()],
        bodyText,
        verdict: classifyResult(res.headers, res.status, bodyText, { id: case_.id, expected: case_.expected }),
      });
      onExecuted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div ref={requestBlockRef}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="mx-code"
            style={{ width: "auto" }}
            aria-label="Request method"
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="mx-code" aria-label="Request URL" />
        </div>

        <div className="mx-label">headers</div>
        <textarea
          className="mx-code"
          rows={2}
          value={headersText}
          onChange={(e) => setHeadersText(e.target.value)}
          aria-label="Request headers"
        />

        <div className="mx-label" style={{ marginTop: "0.5rem" }}>
          body
        </div>
        <textarea
          className="mx-code"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Request body"
        />

        {case_.request.notes.map((n) => (
          <div key={n} className="mx-note">
            ⚠ {n}
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.75rem 0" }}>
          <button className="mx-btn" onClick={execute} disabled={busy}>
            {busy ? "running…" : "execute"}
          </button>
          <button className="mx-btn" onClick={reset} disabled={busy}>
            reset to case
          </button>
          <button className="mx-btn" onClick={() => void navigator.clipboard?.writeText(curl)}>
            copy curl
          </button>
          {result && <span className="mx-build">⧗ {result.ms} ms</span>}
        </div>
      </div>

      <details>
        <summary className="mx-label">curl</summary>
        <pre className="mx-code">{curl}</pre>
      </details>

      {error && (
        <div className="mx-verdict mx-verdict--fault" role="alert">
          ✗ request failed: {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "0.75rem" }}>
          <div className="mx-label">
            response <span className={statusClass(result.status)}>{result.status}</span>
          </div>
          <pre className="mx-code">{prettyBody(result.bodyText)}</pre>
          <details>
            <summary className="mx-label">response headers</summary>
            <pre className="mx-code">{result.headers.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
          </details>
          <VerdictLine verdict={result.verdict} />
        </div>
      )}
    </div>
  );
}

function VerdictLine({ verdict }: { verdict: Verdict }) {
  const { text, cls } = verdictText(verdict);
  return <div className={`mx-verdict ${cls}`}>{text}</div>;
}
