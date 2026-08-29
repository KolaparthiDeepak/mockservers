export function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "mx-status--2";
  if (status >= 400 && status < 500) return "mx-status--4";
  if (status >= 500 && status < 600) return "mx-status--5";
  return "mx-status";
}
