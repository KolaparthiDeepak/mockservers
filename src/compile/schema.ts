import { z } from "zod";

const slugRe = /^[a-z0-9][a-z0-9-]{0,62}$/;

const mockResponseSchema = z
  .object({
    status: z.number().int().min(100).max(599),
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
  })
  .strict();

export const projectYamlSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().regex(slugRe, "slug must match ^[a-z0-9][a-z0-9-]{0,62}$"),
    basePath: z.string().startsWith("/").optional(),
    defaults: z
      .object({
        delayMs: z.number().int().min(0).max(9000).optional(),
        cors: z.boolean().optional(),
        notFound: mockResponseSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const TARGET_KEYS = ["jsonPath", "header", "query"] as const;
const OP_KEYS = ["equals", "notEquals", "contains", "regex", "exists"] as const;

const matchConditionSchema = z.record(z.unknown()).superRefine((obj, ctx) => {
  const targets = TARGET_KEYS.filter((k) => k in obj);
  const ops = OP_KEYS.filter((k) => k in obj);
  if (targets.length !== 1) ctx.addIssue({ code: "custom", message: `exactly one of ${TARGET_KEYS.join("/")} required` });
  if (ops.length !== 1) ctx.addIssue({ code: "custom", message: `exactly one of ${OP_KEYS.join("/")} required` });
  const extra = Object.keys(obj).filter((k) => !TARGET_KEYS.includes(k as never) && !OP_KEYS.includes(k as never));
  if (extra.length) ctx.addIssue({ code: "custom", message: `unknown key(s): ${extra.join(", ")}` });
  if ("regex" in obj) {
    try { new RegExp(String(obj.regex)); }
    catch { ctx.addIssue({ code: "custom", message: `invalid regex: ${String(obj.regex)}` }); }
  }
  if ("exists" in obj && typeof obj.exists !== "boolean") {
    ctx.addIssue({ code: "custom", message: "exists must be a boolean" });
  }
});

export const ruleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    request: z
      .object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "*"]),
        path: z.string().startsWith("/", "path must start with /"),
        match: z.array(matchConditionSchema).optional(),
      })
      .strict(),
    response: mockResponseSchema,
  })
  .strict();

export const ruleFileSchema = z.array(ruleSchema);

export type ProjectYaml = z.infer<typeof projectYamlSchema>;
export type Rule = z.infer<typeof ruleSchema>;
