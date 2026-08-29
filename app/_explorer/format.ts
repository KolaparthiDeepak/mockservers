import type { Verdict } from "@/src/viewer/verdict";

export function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function renderCurl(curl: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "$ORIGIN";
  return curl.split("$ORIGIN").join(origin);
}

export function verdictText(v: Verdict): { text: string; cls: string } {
  switch (v.kind) {
    case "hit":
      return { text: `✓ matched case: ${v.caseId}`, cls: "mx-verdict--hit" };
    case "divert":
      return { text: `→ landed on: ${v.landedOn}`, cls: "mx-verdict--divert" };
    case "nomatch":
      return { text: "→ no route matched (fell through to notFound)", cls: "mx-verdict--nomatch" };
    case "unknown":
      return { text: "· could not confirm which case matched", cls: "mx-verdict--unknown" };
  }
}

export function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}
