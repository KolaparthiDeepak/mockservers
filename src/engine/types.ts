export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

export interface ParsedRequest {
  method: string;
  path: string;                          // subpath after /m/<slug>, always starts with "/"
  headers: Record<string, string>;       // lowercased keys
  query: Record<string, string>;
  body: unknown;                         // parsed JSON, or undefined if body absent/not JSON
  rawBody: string;
}

export type Segment =
  | { kind: "literal"; value: string }
  | { kind: "param"; name: string }
  | { kind: "wildcard" }                 // single segment "*"
  | { kind: "catchall" };                // trailing "**"

export type Operator =
  | { equals: string } | { notEquals: string } | { contains: string }
  | { regex: string } | { exists: boolean };

export type MatchCondition =
  | ({ jsonPath: string } & Operator)
  | ({ header: string } & Operator)
  | ({ query: string } & Operator);

export interface MockResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;                        // object | string | null
}

export interface Route {
  id: string;
  method: HttpMethod | "*";
  path: string;                          // original, for diagnostics
  segments: Segment[];
  match?: MatchCondition[];
  response: MockResponse;
}

export interface ProjectConfig {
  name: string;
  slug: string;
  basePath?: string;
  defaults: {
    delayMs: number;
    cors: boolean;
    notFound: MockResponse;
  };
  routes: Route[];
  openApiDoc?: unknown;                  // merged OpenAPI, if any
}

export interface ResolveResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  matchedRuleId: string | null;
  delayMs: number;
  warnings: string[];                    // runtime template warnings
}
