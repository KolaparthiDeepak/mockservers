import type { ParsedRequest } from "./types";

export async function parseRequest(req: Request, subPath: string): Promise<ParsedRequest> {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  let rawBody = "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    try { rawBody = await req.text(); } catch { rawBody = ""; }
  }
  let body: unknown;
  if (rawBody.length > 0) {
    try { body = JSON.parse(rawBody); } catch { body = undefined; }
  }

  return { method: req.method, path: subPath, headers, query, body, rawBody };
}
