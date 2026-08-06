import type { Env } from "../cloudflare";
import { fetchWithTimeout } from "./http";

const WAYBACK_TIMEOUT_MS = 8_000;

interface ClosestSnapshot {
  available?: boolean;
  url?: string;
  timestamp?: string;
}

interface AvailabilityResponse {
  archived_snapshots?: { closest?: ClosestSnapshot };
}

/**
 * Look up the newest Wayback Machine snapshot of a URL. Returns the raw
 * (unmodified original markup, "id_" flag) snapshot URL, or null when the
 * API definitively reports no snapshot.
 *
 * When the availability API itself fails (it rate-limits busy IPs), fall
 * back to the blind "nearest snapshot" URL — web.archive.org treats the
 * partial timestamp "2" as "closest capture since 2000" and redirects, or
 * 404s when none exists (which the caller's fetch handles).
 */
export async function findWaybackSnapshot(
  fetchImpl: typeof fetch,
  env: Env,
  url: string,
): Promise<string | null> {
  const apiOrigin = env.WAYBACK_API_ORIGIN ?? "https://archive.org/wayback";
  const archiveOrigin = env.WEB_ARCHIVE_ORIGIN ?? "https://web.archive.org/web";
  const blindProbe = `${archiveOrigin}/2id_/${url}`;

  let closest: ClosestSnapshot | undefined;
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${apiOrigin}/available?url=${encodeURIComponent(url)}`,
      WAYBACK_TIMEOUT_MS,
    );
    if (!response.ok) return blindProbe;
    closest = ((await response.json()) as AvailabilityResponse)
      .archived_snapshots?.closest;
  } catch {
    return blindProbe;
  }

  if (!closest?.available || !closest.timestamp) return null;
  return `${archiveOrigin}/${closest.timestamp}id_/${url}`;
}
