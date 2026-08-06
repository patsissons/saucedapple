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
 * (unmodified original markup, "id_" flag) snapshot URL, or null when no
 * snapshot exists or the availability API is unreachable.
 */
export async function findWaybackSnapshot(
  fetchImpl: typeof fetch,
  env: Env,
  url: string,
): Promise<string | null> {
  const apiOrigin = env.WAYBACK_API_ORIGIN ?? "https://archive.org/wayback";
  const archiveOrigin = env.WEB_ARCHIVE_ORIGIN ?? "https://web.archive.org/web";

  let closest: ClosestSnapshot | undefined;
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${apiOrigin}/available?url=${encodeURIComponent(url)}`,
      WAYBACK_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    closest = ((await response.json()) as AvailabilityResponse)
      .archived_snapshots?.closest;
  } catch {
    return null; // availability API is best-effort
  }

  if (!closest?.available || !closest.timestamp) return null;
  return `${archiveOrigin}/${closest.timestamp}id_/${url}`;
}
