import {
  DEFAULT_CAPABILITIES,
  type Capability,
} from "../../../src/capabilities";
import type { ApiKeySummary } from "./auth";

export const masked = (key: ApiKeySummary) =>
  `${key.prefix ?? ""}${key.start ?? "•••"}…`;

export const scopeOf = (key: ApiKeySummary) =>
  key.metadata?.repository ?? null;

export const capabilitiesOf = (key: ApiKeySummary) =>
  (key.metadata?.capabilities ?? DEFAULT_CAPABILITIES) as Capability[];

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 864e5],
  ["month", 30 * 864e5],
  ["week", 7 * 864e5],
  ["day", 864e5],
  ["hour", 36e5],
  ["minute", 6e4],
];

/** "3 days ago"; anything under a minute reads "just now". */
export function ago(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const elapsed = now - new Date(iso).getTime();
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return format.format(-Math.floor(elapsed / size), unit);
  }
  return "just now";
}

/** The first request an agent would make, with the key filled in. */
export const snippet = (key: string, repository: string | null) =>
  `curl "https://proxycroc.4kshat.dev/api/issues?repository=${repository ?? "owner/name"}" \\
  -H "Authorization: Bearer ${key}"`;
