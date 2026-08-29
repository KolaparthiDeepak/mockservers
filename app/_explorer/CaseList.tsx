"use client";
import type { CaseVM } from "@/src/viewer/model";
import { statusClass } from "./status";

export function CaseList({
  cases,
  selectedId,
  onSelect,
  rowRef,
}: {
  cases: CaseVM[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  rowRef: (el: HTMLElement | null) => void;
}) {
  return (
    <div role="listbox" aria-label="Cases">
      {cases.map((c) => (
        <div
          key={c.id}
          role="option"
          tabIndex={0}
          aria-selected={c.id === selectedId}
          ref={c.id === selectedId ? rowRef : undefined}
          className={`mx-row${c.isOpenApiGenerated ? " mx-row--openapi" : ""}`}
          onClick={() => onSelect(c.id)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              onSelect(c.id);
            }
          }}
        >
          <span>{c.label}</span>
          <span className={statusClass(c.expected.status)}>{c.expected.status}</span>
        </div>
      ))}
    </div>
  );
}
