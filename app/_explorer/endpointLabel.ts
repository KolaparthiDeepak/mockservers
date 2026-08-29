/** The distinguishing part of a mock endpoint path.
 *  `/acropolis-card-mgmt/GET_CARD/v1` -> `GET_CARD` (skips a trailing version segment);
 *  falls back to the last segment, then the whole path. */
export function commandCode(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && /^v\d+$/i.test(last) && parts.length >= 2) return parts[parts.length - 2]!;
  return last ?? path;
}
