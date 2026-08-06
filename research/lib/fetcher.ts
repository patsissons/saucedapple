// Polite, cached, budget-aware fetch for probes. Every response is written to
// research/corpus/cache/ (gitignored) so re-runs cost zero network — this is
// both a speed and an IP-safety measure. Set PROBE_REPLAY=1 to fail instead of
// hitting the network on a cache miss (fully offline re-scoring).

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { RequestBudget, throttle } from "./ratelimit.ts";

const CACHE_DIR = new URL("../corpus/cache/", import.meta.url).pathname;
const REPLAY_ONLY = process.env.PROBE_REPLAY === "1";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 2_000_000;

/** User-agent profiles probes A/B against publishers. */
export const UA = {
  // Matches worker/lib/http.ts BROWSER_UA — the production baseline.
  chrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // Apple News app client UA (public string form) — probed by P1.
  appleNews: "AppleNews/1.0 Version/17.5 Model/iPhone",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot:
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  // A polite, identifiable UA for archives with a contact URL.
  polite:
    "saucedapple-research/0.1 (+https://saucedapple.com; contact: patricksissons@gmail.com)",
} as const;

export type UAName = keyof typeof UA;

export interface FetchOptions {
  ua?: UAName;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  /** Skip disk cache (e.g. when measuring real latency). */
  noCache?: boolean;
  budget?: RequestBudget;
  /** Override the followed-redirect policy (default "follow"). */
  redirect?: RequestRedirect;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  latencyMs: number;
  /** True when served from disk cache (latency is not meaningful then). */
  fromCache: boolean;
}

function cacheKey(url: string, ua: string): string {
  return createHash("sha256").update(`${ua}\n${url}`).digest("hex").slice(0, 40);
}

function readCache(key: string): FetchResult | null {
  const path = join(CACHE_DIR, key + ".json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as FetchResult;
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

function writeCache(key: string, result: FetchResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    join(CACHE_DIR, key + ".json"),
    JSON.stringify({ ...result, fromCache: false }),
  );
}

/**
 * Fetch with a UA profile, timeout, byte cap, per-host throttle, disk cache,
 * and optional per-run budget. Never throws on HTTP errors — inspect `.ok` /
 * `.status`. Throws only on a genuine network failure or a budget breach.
 */
export async function politeFetch(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const uaName = opts.ua ?? "chrome";
  const key = cacheKey(url, uaName);

  if (!opts.noCache) {
    const cached = readCache(key);
    if (cached) return cached;
  }
  if (REPLAY_ONLY) {
    throw new Error(`PROBE_REPLAY: cache miss for ${url} (ua=${uaName})`);
  }

  const host = new URL(url).hostname;
  opts.budget?.spend(host);
  await throttle(host);

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA[uaName], ...opts.headers },
      redirect: opts.redirect ?? "follow",
      signal: controller.signal,
    });

    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const buf = await readCapped(response, maxBytes);
    const result: FetchResult = {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      headers: Object.fromEntries(response.headers.entries()),
      body: buf,
      bytes: Buffer.byteLength(buf),
      latencyMs: Date.now() - started,
      fromCache: false,
    };
    if (!opts.noCache) writeCache(key, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}
