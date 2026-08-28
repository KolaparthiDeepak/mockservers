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

describe("card-block-lost scenario matrix", () => {
  it("caller verifies (happy)", () => {
    const r = resolve(post(`${CMD}/VERIFY_CUSTOMER/v1`, { customerId: "cust-ok" }), project);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ verified: true });
  });
  it("unknown caller not verified", () => {
    const r = resolve(post(`${CMD}/VERIFY_CUSTOMER/v1`, { customerId: "cust-unknown" }), project);
    expect(r.body).toMatchObject({ verified: false, reason: "CUSTOMER_NOT_FOUND" });
  });
  it("unauthorised caller -> 401", () => {
    expect(resolve(post(`${CMD}/VERIFY_CUSTOMER/v1`, { customerId: "cust-unauth" }), project).status).toBe(401);
  });
  it("card 0001 not found", () => {
    expect(resolve(post(`${CMD}/GET_CARD/v1`, { cardLast4: "0001" }), project).status).toBe(404);
  });
  it("card 4242 -> card-happy", () => {
    const r = resolve(post(`${CMD}/GET_CARD/v1`, { cardLast4: "4242" }), project);
    expect(r.body).toMatchObject({ cardId: "card-happy", last4: "4242" });
  });
  it("confirm re-read (no cardLast4) reports the card BLOCKED", () => {
    const r = resolve(post(`${CMD}/GET_CARD/v1`, { cardId: "card-happy" }), project);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "BLOCKED" });
  });
  it("confirm re-read of card-stale-confirm stays ACTIVE", () => {
    const r = resolve(post(`${CMD}/GET_CARD/v1`, { cardId: "card-stale-confirm" }), project);
    expect(r.body).toMatchObject({ status: "ACTIVE" });
  });
  it("eligibility default is eligible", () => {
    expect(resolve(post(`${CMD}/CHECK_CARD_ELIGIBILITY/v1`, { cardId: "card-happy" }), project).body)
      .toMatchObject({ eligible: true });
  });
  it("eligibility of an already-blocked card is false", () => {
    expect(resolve(post(`${CMD}/CHECK_CARD_ELIGIBILITY/v1`, { cardId: "card-already-blocked" }), project).body)
      .toMatchObject({ eligible: false, reason: "ALREADY_BLOCKED" });
  });
  it("block race -> 409", () => {
    expect(resolve(post(`${CMD}/BLOCK_CARD/v1`, { cardId: "card-block-race" }), project).status).toBe(409);
  });
  it("default block succeeds and templates the blockId", () => {
    const r = resolve(post(`${CMD}/BLOCK_CARD/v1`, { cardId: "card-happy" }), project);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "BLOCKED", blockId: "blk_card-happy" });
  });
  it("notify failure -> 500", () => {
    expect(resolve(post(`${CMD}/NOTIFY_CUSTOMER/v1`, { cardId: "card-notify-fail" }), project).status).toBe(500);
  });
  it("notify default sends on SMS + IN_APP", () => {
    expect(resolve(post(`${CMD}/NOTIFY_CUSTOMER/v1`, { cardId: "card-happy" }), project).body)
      .toMatchObject({ sent: true, channels: ["SMS", "IN_APP"] });
  });
});
