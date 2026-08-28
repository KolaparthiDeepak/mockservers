import type { MatchCondition, ParsedRequest, Segment } from "./types";

export function compileSegments(path: string): Segment[] {
  const parts = path.split("/").filter((p) => p.length > 0);
  return parts.map((p): Segment => {
    if (p === "**") return { kind: "catchall" };
    if (p === "*") return { kind: "wildcard" };
    if (p.startsWith(":")) return { kind: "param", name: p.slice(1) };
    return { kind: "literal", value: p };
  });
}

export function matchPath(
  segments: Segment[],
  requestPath: string,
): { matched: boolean; params: Record<string, string> } {
  const reqParts = requestPath.split("/").filter((p) => p.length > 0);
  const params: Record<string, string> = {};

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === "catchall") {
      return { matched: i === segments.length - 1, params };
    }
    const part = reqParts[i];
    if (part === undefined) return { matched: false, params };
    if (seg.kind === "literal") {
      if (seg.value !== part) return { matched: false, params };
    } else if (seg.kind === "param") {
      params[seg.name] = part;
    }
    // wildcard: any single part, no capture
  }
  return { matched: reqParts.length === segments.length, params };
}

export function methodMatches(routeMethod: string, requestMethod: string): boolean {
  return routeMethod === "*" || routeMethod.toUpperCase() === requestMethod.toUpperCase();
}

export function resolveJsonPath(body: unknown, path: string): unknown {
  if (body == null) return undefined;
  const trimmed = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  const tokens = trimmed
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((t) => t.length > 0);
  let cur: unknown = body;
  for (const tok of tokens) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[tok];
  }
  return cur;
}

function asString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function applyOperator(cond: MatchCondition, actual: string | undefined): boolean {
  if ("exists" in cond) return cond.exists ? actual !== undefined : actual === undefined;
  if (actual === undefined) return false;
  if ("equals" in cond) return actual === cond.equals;
  if ("notEquals" in cond) return actual !== cond.notEquals;
  if ("contains" in cond) return actual.includes(cond.contains);
  if ("regex" in cond) return new RegExp(cond.regex).test(actual);
  return false;
}

export function evalCondition(cond: MatchCondition, req: ParsedRequest): boolean {
  let actual: string | undefined;
  if ("jsonPath" in cond) actual = asString(resolveJsonPath(req.body, cond.jsonPath));
  else if ("header" in cond) actual = req.headers[cond.header.toLowerCase()];
  else actual = req.query[cond.query];
  return applyOperator(cond, actual);
}

export function allMatch(conds: MatchCondition[] | undefined, req: ParsedRequest): boolean {
  if (!conds || conds.length === 0) return true;
  return conds.every((c) => evalCondition(c, req));
}
