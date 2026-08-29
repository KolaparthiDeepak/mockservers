"use client";
import type { EndpointVM } from "@/src/viewer/model";

function lastSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

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
          className="mx-row"
          onClick={() => onSelect(e.key)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              onSelect(e.key);
            } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
              ev.preventDefault();
              const next = endpoints[i + (ev.key === "ArrowDown" ? 1 : -1)];
              if (!next) return;
              onSelect(next.key);
              const sib = ev.currentTarget.parentElement?.children[
                i + (ev.key === "ArrowDown" ? 1 : -1)
              ] as HTMLElement | undefined;
              sib?.focus();
            }
          }}
        >
          <span>
            {e.method} {lastSegment(e.path)}
          </span>
          <span className="mx-status">{e.cases.length}</span>
        </div>
      ))}
    </div>
  );
}
