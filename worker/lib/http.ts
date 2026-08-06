/** Realistic browser UA — some publishers serve bots a different page. */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class UpstreamTimeoutError extends Error {
  constructor(url: string) {
    super(`Timed out fetching ${url}`);
    this.name = "UpstreamTimeoutError";
  }
}

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      redirect: "follow",
      ...init,
      headers: { "user-agent": BROWSER_UA, ...init?.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new UpstreamTimeoutError(url);
    }
    throw error;
  }
}
