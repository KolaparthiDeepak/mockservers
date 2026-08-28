import { randomUUID } from "node:crypto";
import { resolveJsonPath } from "./match";

export class TemplateError extends Error {}

export interface TemplateContext {
  body: unknown;
  path: Record<string, string>;
  query: Record<string, string>;
  header: Record<string, string>;
}

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const IDENT = "[A-Za-z0-9_\\-]+";
const PATTERNS: RegExp[] = [
  new RegExp(`^request\\.body\\.${IDENT}(?:\\.${IDENT}|\\[\\d+\\])*$`),
  new RegExp(`^request\\.path\\.${IDENT}$`),
  new RegExp(`^request\\.query\\.${IDENT}$`),
  new RegExp(`^request\\.header\\.${IDENT}$`),
  /^uuid$/,
  /^now$/,
  /^now\.epochMs$/,
  /^randomInt\s+-?\d+\s+-?\d+$/,
];

function isAllowed(expr: string): boolean {
  return PATTERNS.some((p) => p.test(expr));
}

export function parseTemplate(input: string): void {
  const bad: string[] = [];
  for (const m of input.matchAll(TOKEN_RE)) {
    const expr = m[1]!.trim();
    if (!isAllowed(expr)) bad.push(expr);
  }
  if (bad.length > 0) {
    throw new TemplateError(`unknown template token(s): ${bad.map((b) => `{{${b}}}`).join(", ")}`);
  }
}

function evalToken(expr: string, ctx: TemplateContext, warnings: string[]): string {
  if (expr === "uuid") return randomUUID();
  if (expr === "now") return new Date().toISOString();
  if (expr === "now.epochMs") return String(Date.now());
  const ri = expr.match(/^randomInt\s+(-?\d+)\s+(-?\d+)$/);
  if (ri) {
    let lo = Number(ri[1]!);
    let hi = Number(ri[2]!);
    if (lo > hi) [lo, hi] = [hi, lo];
    return String(lo + Math.floor(Math.random() * (hi - lo + 1)));
  }
  let value: unknown;
  if (expr.startsWith("request.body.")) value = resolveJsonPath(ctx.body, "$." + expr.slice("request.body.".length));
  else if (expr.startsWith("request.path.")) value = ctx.path[expr.slice("request.path.".length)];
  else if (expr.startsWith("request.query.")) value = ctx.query[expr.slice("request.query.".length)];
  else if (expr.startsWith("request.header.")) value = ctx.header[expr.slice("request.header.".length).toLowerCase()];
  if (value === undefined || value === null) {
    warnings.push(`template value not found: {{${expr}}}`);
    return "";
  }
  if (typeof value === "function") {
    warnings.push(`template value not usable: {{${expr}}}`);
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function renderTemplate(input: string, ctx: TemplateContext, warnings: string[]): string {
  return input.replace(TOKEN_RE, (_m, expr: string) => evalToken(expr.trim(), ctx, warnings));
}

export function renderDeep(value: unknown, ctx: TemplateContext, warnings: string[]): unknown {
  if (typeof value === "string") return renderTemplate(value, ctx, warnings);
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, ctx, warnings));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(value)) out[k] = renderDeep(v, ctx, warnings);
    return out;
  }
  return value;
}
