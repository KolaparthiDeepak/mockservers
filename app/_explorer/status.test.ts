import { describe, expect, it } from "vitest";
import { statusClass } from "./status";

describe("statusClass", () => {
  it("maps by hundreds digit", () => {
    expect(statusClass(200)).toBe("mx-status--2");
    expect(statusClass(404)).toBe("mx-status--4");
    expect(statusClass(500)).toBe("mx-status--5");
  });
  it("falls back to the base class for anything else", () => {
    expect(statusClass(101)).toBe("mx-status");
    expect(statusClass(302)).toBe("mx-status");
  });
});
