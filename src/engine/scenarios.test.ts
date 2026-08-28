import { describe, expect, it } from "vitest";
import bundle from "@/mocks.generated.json";
import { resolve } from "./resolve";
import type { CompiledBundle } from "../compile/compile";
import type { ParsedRequest, ProjectConfig } from "./types";

const project = (bundle as unknown as CompiledBundle).projects["card-block-lost"] as ProjectConfig;
const post = (path: string, body: unknown): ParsedRequest => ({
  method: "POST", path, headers: {}, query: {}, body, rawBody: JSON.stringify(body),
});
const CMD = "/commands/acropolis-card-mgmt";

interface Row {
  name: string;
  op: string;
  body: unknown;
  status?: number;
  match?: Record<string, unknown>;
  ruleId?: string;
}

const rows: Row[] = [
  { name: "caller verifies (happy)", op: "VERIFY_CUSTOMER", body: { customerId: "cust-ok" }, status: 200, match: { verified: true } },
  { name: "bad challenge -> CHALLENGE_MISMATCH", op: "VERIFY_CUSTOMER", body: { customerId: "cust-bad-challenge" }, status: 200, match: { verified: false, reason: "CHALLENGE_MISMATCH" } },
  { name: "unknown caller not verified", op: "VERIFY_CUSTOMER", body: { customerId: "cust-unknown" }, match: { verified: false, reason: "CUSTOMER_NOT_FOUND" } },
  { name: "unauthorised caller -> 401", op: "VERIFY_CUSTOMER", body: { customerId: "cust-unauth" }, status: 401 },
  { name: "verification service down -> 500", op: "VERIFY_CUSTOMER", body: { customerId: "cust-verify-down" }, status: 500, match: { reason: "VERIFICATION_SERVICE_ERROR" } },

  { name: "card 0001 not found", op: "GET_CARD", body: { cardLast4: "0001" }, status: 404 },
  { name: "card 0002 service error -> 500", op: "GET_CARD", body: { cardLast4: "0002" }, status: 500, match: { reason: "CARD_SERVICE_ERROR" } },
  { name: "card 4242 -> card-happy", op: "GET_CARD", body: { cardLast4: "4242" }, match: { cardId: "card-happy", last4: "4242" } },
  { name: "confirm re-read reports the card BLOCKED", op: "GET_CARD", body: { cardId: "card-happy" }, status: 200, match: { status: "BLOCKED" }, ruleId: "confirm-card-blocked" },
  { name: "confirm re-read of card-stale-confirm stays ACTIVE", op: "GET_CARD", body: { cardId: "card-stale-confirm" }, match: { status: "ACTIVE" } },

  { name: "eligibility default is eligible", op: "CHECK_CARD_ELIGIBILITY", body: { cardId: "card-happy" }, match: { eligible: true } },
  { name: "eligibility of an already-blocked card is false", op: "CHECK_CARD_ELIGIBILITY", body: { cardId: "card-already-blocked" }, match: { eligible: false, reason: "ALREADY_BLOCKED" } },

  { name: "block race -> 409", op: "BLOCK_CARD", body: { cardId: "card-block-race" }, status: 409 },
  { name: "default block succeeds and templates the blockId", op: "BLOCK_CARD", body: { cardId: "card-happy" }, status: 200, match: { status: "BLOCKED", blockId: "blk_card-happy" } },

  { name: "notify failure -> 500", op: "NOTIFY_CUSTOMER", body: { cardId: "card-notify-fail" }, status: 500 },
  { name: "notify queued -> 200 QUEUED", op: "NOTIFY_CUSTOMER", body: { cardId: "card-notify-queued" }, status: 200, match: { sent: true, status: "QUEUED" } },
  { name: "notify default sends on SMS + IN_APP", op: "NOTIFY_CUSTOMER", body: { cardId: "card-happy" }, match: { sent: true, channels: ["SMS", "IN_APP"] } },
];

describe("card-block-lost scenario matrix", () => {
  it.each(rows)("$name", ({ op, body, status, match, ruleId }) => {
    const r = resolve(post(`${CMD}/${op}/v1`, body), project);
    if (status !== undefined) expect(r.status).toBe(status);
    if (match !== undefined) expect(r.body).toMatchObject(match);
    if (ruleId !== undefined) expect(r.matchedRuleId).toBe(ruleId);
  });
});
