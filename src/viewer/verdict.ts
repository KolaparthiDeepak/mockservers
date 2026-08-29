export interface SelectedCase {
  id: string;
  expected: { status: number; body?: unknown };
}

export type Verdict =
  | { kind: "hit"; caseId: string }
  | { kind: "divert"; landedOn: string }
  | { kind: "nomatch" }
  | { kind: "unknown" };

function parseMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function looseBodyMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "string" && expected.includes("{{")) return true; // templated — skip
  if (expected === null || typeof expected !== "object") return expected === actual;
  if (actual === null || typeof actual !== "object") return false;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((v, i) => looseBodyMatch(v, actual[i]));
  }
  const a = actual as Record<string, unknown>;
  for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
    if (!looseBodyMatch(v, a[k])) return false;
  }
  return true;
}

export function classifyResult(
  headers: Headers,
  status: number,
  bodyText: string,
  selected: SelectedCase,
): Verdict {
  if (headers.get("x-mock-matched") === "false") return { kind: "nomatch" };

  const ruleId = headers.get("x-mock-rule-id");
  if (ruleId) {
    return ruleId === selected.id
      ? { kind: "hit", caseId: ruleId }
      : { kind: "divert", landedOn: ruleId };
  }

  if (status === selected.expected.status && looseBodyMatch(selected.expected.body, parseMaybe(bodyText))) {
    return { kind: "hit", caseId: selected.id };
  }
  return { kind: "unknown" };
}
