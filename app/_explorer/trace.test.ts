import { describe, expect, it } from "vitest";
import { elbowPath } from "./trace";

const rect = (x: number, y: number, w = 100, h = 32): DOMRect =>
  ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;

describe("elbowPath", () => {
  it("starts at the right-mid of `from` and ends at the left-mid of `to`", () => {
    const d = elbowPath(rect(0, 100), rect(400, 300));
    expect(d.startsWith("M 100 116 ")).toBe(true);
    expect(d.endsWith(" 400 316")).toBe(true);
  });
  it("routes through a vertical mid-gutter (3 line segments)", () => {
    const d = elbowPath(rect(0, 100), rect(400, 300));
    expect((d.match(/L /g) ?? []).length).toBe(3);
  });
});
