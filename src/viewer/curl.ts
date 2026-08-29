export interface MatchCondition {
  jsonPath?: string;
  header?: string;
  query?: string;
  equals?: string;
  notEquals?: string;
  contains?: string;
  regex?: string;
  exists?: boolean;
}

export interface SchemaProp {
  enum?: unknown[];
  example?: unknown;
}

export interface SynthInput {
  method: string;
  runUrl: string;
  match: MatchCondition[];
  requestExample?: Record<string, unknown>;
  requestSchemaProps?: Record<string, SchemaProp>;
}

export interface RequestDraft {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  curl: string;
  notes: string[];
}

const PLACEHOLDER = "<value>";
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const DOT_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

/** "$.a.b" -> "a.b"; null if the path uses filters/wildcards/brackets. */
function jsonPathToDot(jp: string): string | null {
  if (!jp.startsWith("$.")) return null;
  const rest = jp.slice(2);
  return DOT_PATH.test(rest) ? rest : null;
}

export function looseSetPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    const next = cur[k];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function hasPath(obj: Record<string, unknown>, dotPath: string): boolean {
  let cur: unknown = obj;
  for (const k of dotPath.split(".")) {
    if (typeof cur !== "object" || cur === null || !(k in cur)) return false;
    cur = (cur as Record<string, unknown>)[k];
  }
  return true;
}

function describeOp(c: MatchCondition): string {
  if (c.regex !== undefined) return `must match /${c.regex}/`;
  if (c.notEquals !== undefined) return `must not equal ${JSON.stringify(c.notEquals)}`;
  if (c.exists === false) return "must be absent";
  return "has an unrepresentable constraint";
}

function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
): string {
  const parts = [`curl -sS -X ${method} "$ORIGIN${url}"`];
  for (const [k, v] of Object.entries(headers)) parts.push(`  -H '${k}: ${v}'`);
  if (body !== undefined) parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  return parts.join(" \\\n");
}

export function synthesizeRequest(input: SynthInput): RequestDraft {
  const method = input.method.toUpperCase();
  const hasBody = BODY_METHODS.has(method);
  const notes: string[] = [];
  const headers: Record<string, string> = {};
  const body: Record<string, unknown> = hasBody
    ? (structuredClone(input.requestExample ?? {}) as Record<string, unknown>)
    : {};
  const query = new URLSearchParams();

  if (hasBody) headers["content-type"] = "application/json";

  for (const c of input.match) {
    if (c.jsonPath !== undefined) {
      const dot = jsonPathToDot(c.jsonPath);
      if (dot === null) {
        notes.push(`adjust: ${c.jsonPath} — unsupported path shape, set the body by hand`);
        continue;
      }
      if (c.equals !== undefined) looseSetPath(body, dot, c.equals);
      else if (c.contains !== undefined) looseSetPath(body, dot, c.contains);
      else if (c.exists === true) {
        if (!hasPath(body, dot)) {
          const prop = input.requestSchemaProps?.[dot];
          const v = prop?.enum?.[0] ?? prop?.example ?? PLACEHOLDER;
          looseSetPath(body, dot, v);
        }
      } else {
        notes.push(`adjust: body ${c.jsonPath} ${describeOp(c)}`);
      }
    } else if (c.header !== undefined) {
      if (c.equals !== undefined) headers[c.header.toLowerCase()] = c.equals;
      else if (c.contains !== undefined) headers[c.header.toLowerCase()] = c.contains;
      else notes.push(`adjust: header ${c.header} ${describeOp(c)}`);
    } else if (c.query !== undefined) {
      if (c.equals !== undefined) query.set(c.query, c.equals);
      else if (c.contains !== undefined) query.set(c.query, c.contains);
      else notes.push(`adjust: query ${c.query} ${describeOp(c)}`);
    }
  }

  const qs = query.toString();
  const url = qs ? `${input.runUrl}${input.runUrl.includes("?") ? "&" : "?"}${qs}` : input.runUrl;
  const bodyStr = hasBody ? JSON.stringify(body, null, 2) : undefined;

  return { method, url, headers, body: bodyStr, curl: buildCurl(method, url, headers, bodyStr), notes };
}
