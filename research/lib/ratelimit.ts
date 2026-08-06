// Per-host politeness so probes never get the dev (or, later, Worker) IP
// banned. This is a hard product constraint: web.archive.org's CDX API
// already returns 503 x-rl:1 on a first request from a residential IP, and
// archive.today blocks server-shaped fetchers outright.

/** Minimum delay between requests to the same host (ms). */
const DEFAULT_MIN_INTERVAL_MS = 1_500;

/** Hosts that need extra breathing room, keyed by hostname suffix. */
const HOST_MIN_INTERVAL_MS: Array<[string, number]> = [
  ["web.archive.org", 3_000],
  ["archive.org", 3_000],
  ["r.jina.ai", 3_000], // ~20 rpm free tier — stay well under
  ["gdeltproject.org", 6_000],
  ["api.gdeltproject.org", 6_000],
  ["hn.algolia.com", 1_000],
  ["news.google.com", 2_000],
];

function minIntervalFor(host: string): number {
  for (const [suffix, ms] of HOST_MIN_INTERVAL_MS) {
    if (host === suffix || host.endsWith("." + suffix)) return ms;
  }
  return DEFAULT_MIN_INTERVAL_MS;
}

const lastHitAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Await this before every outbound request. Serializes per-host so N probes
 * sharing a host still respect the interval. Returns immediately when enough
 * time has already elapsed.
 */
export async function throttle(host: string): Promise<void> {
  const interval = minIntervalFor(host);
  const now = Date.now();
  const last = lastHitAt.get(host) ?? 0;
  const wait = last + interval - now;
  if (wait > 0) await sleep(wait);
  lastHitAt.set(host, Date.now());
}

/** A hard ceiling on requests per host for a single probe run (safety net). */
export class RequestBudget {
  private used = new Map<string, number>();
  constructor(private readonly perHost: number) {}

  /** Throws when the per-host budget is exhausted — fail loud, not silent. */
  spend(host: string): void {
    const n = (this.used.get(host) ?? 0) + 1;
    if (n > this.perHost) {
      throw new Error(
        `Request budget exhausted for ${host} (${this.perHost}) — stop and reassess`,
      );
    }
    this.used.set(host, n);
  }

  report(): Record<string, number> {
    return Object.fromEntries(this.used);
  }
}
