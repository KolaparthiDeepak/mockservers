"use client";
import type { EndpointVM } from "@/src/viewer/model";
import { commandCode } from "./endpointLabel";

export function EndpointList({
  endpoints,
  selectedKey,
  onSelect,
}: {
  endpoints: EndpointVM[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div role="listbox" aria-label="Endpoints">
      {endpoints.map((e, i) => (
        <div
          key={e.key}
          role="option"
          tabIndex={0}
          aria-selected={e.key === selectedKey}
          className="mx-row mx-row--two"
          onClick={() => onSelect(e.key)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              onSelect(e.key);
            } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
              ev.preventDefault();
              const j = i + (ev.key === "ArrowDown" ? 1 : -1);
              const next = endpoints[j];
              if (!next) return;
              onSelect(next.key);
              const sib = ev.currentTarget.parentElement?.children[j] as HTMLElement | undefined;
              sib?.focus();
            }
          }}
        >
          <span className="mx-ep" title={e.summary}>
            <span className="mx-ep-title">{commandCode(e.path)}</span>
            <span className="mx-ep-sub">{e.summary ?? `${e.method} ${e.path}`}</span>
          </span>
          <span className="mx-status">{e.cases.length}</span>
        </div>
      ))}
    </div>
  );
}
