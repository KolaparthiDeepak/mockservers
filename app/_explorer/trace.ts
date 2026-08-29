/** SVG path from the right edge of `from` to the left edge of `to`, with two 90-degree elbows through a mid gutter. */
export function elbowPath(from: DOMRect, to: DOMRect): string {
  const x1 = from.right;
  const y1 = from.top + from.height / 2;
  const x2 = to.left;
  const y2 = to.top + to.height / 2;
  const midX = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}
