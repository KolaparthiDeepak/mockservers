"use client";
import { useLayoutEffect, useState } from "react";
import { elbowPath } from "./trace";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function SignalTrace({
  fromEl,
  toEl,
  pulseKey,
}: {
  fromEl: HTMLElement | null;
  toEl: HTMLElement | null;
  pulseKey: number;
}) {
  const [d, setD] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!fromEl || !toEl) {
      setD(null);
      return;
    }
    const recompute = () => setD(elbowPath(fromEl.getBoundingClientRect(), toEl.getBoundingClientRect()));
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [fromEl, toEl]);

  if (!d) return null;

  return (
    <svg className="mx-trace-layer" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--trace)" strokeWidth={1} strokeOpacity={0.5} />
      {!reducedMotion() && (
        <path
          key={pulseKey}
          d={d}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="90 4000"
          style={{ filter: "drop-shadow(0 0 3px var(--ink))" }}
        >
          <animate attributeName="stroke-dashoffset" from="90" to="-4000" dur="0.45s" begin="0s" fill="freeze" />
          <animate attributeName="opacity" from="1" to="0" dur="0.5s" begin="0.4s" fill="freeze" />
        </path>
      )}
    </svg>
  );
}
