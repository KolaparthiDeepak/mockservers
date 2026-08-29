"use client";
import type { CaseVM } from "@/src/viewer/model";

export function Runner({ case_ }: { case_: CaseVM }) {
  return <pre className="mx-code">{case_.request.curl}</pre>;
}
