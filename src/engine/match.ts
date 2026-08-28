import type { Segment } from "./types";

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
