// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FakeCache,
  makeDeps,
  testEnv,
  type FakeUpstream,
} from "../test-support";
import { handleRelated } from "./related";

const ID = "AtPew8L70RNexncdCICfcUg";
const ARTICLE_URL = `https://apple.news/${ID}`;
const STORY = "https://publisher.test/story";

function appleNewsPage(): string {
  return `
    <script>redirectToUrl("${STORY}")</script>
    <meta property="og:title" content="Story Title — Test Publisher" />
  `;
}

/** Mirrors Bing News RSS: apiclick redirect + <News:Source> outlet name. */
function feed(items: Array<[string, string]>): string {
  const rendered = items
    .map(
      ([article, outlet]) =>
        `<item><title>Story Title</title>` +
        `<link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=${encodeURIComponent(article)}&amp;c=1</link>` +
        `<News:Source>${outlet}</News:Source></item>`,
    )
    .join("");
  return `<?xml version="1.0"?><rss><channel>${rendered}</channel></rss>`;
}

function relatedRequest(url: string): Request {
  const base = new URL("https://saucedapple.test/api/related");
  base.searchParams.set("id", url);
  return new Request(base);
}

function upstreamWith(feedBody: string): FakeUpstream {
  return {
    calls: [],
    routes: {
      [`https://apple-news.test/${ID}`]: () => new Response(appleNewsPage()),
      "https://news.test/search*": () => new Response(feedBody),
    },
  };
}

/** The cache also holds the resolve/ entry, so select the related/ one. */
function relatedEntry(cache: FakeCache): Response {
  for (const [key, response] of cache.store) {
    if (key.includes("/related/")) return response;
  }
  throw new Error("no related/ cache entry");
}

function maxAgeOf(response: Response): number | null {
  const match = /max-age=(\d+)/.exec(
    response.headers.get("cache-control") ?? "",
  );
  return match ? Number(match[1]) : null;
}

describe("handleRelated", () => {
  it("returns other outlets covering the same story", async () => {
    const response = await handleRelated(
      relatedRequest(ARTICLE_URL),
      testEnv,
      makeDeps(
        upstreamWith(feed([["https://www.reuters.com/story", "Reuters"]])),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      outlets: [
        {
          outlet: "Reuters",
          host: "reuters.com",
          title: "Story Title",
          url: "https://www.reuters.com/story",
        },
      ],
    });
  });

  it("rejects a non-Apple-News url", async () => {
    const response = await handleRelated(
      relatedRequest("https://example.com/story"),
      testEnv,
      makeDeps(upstreamWith(feed([]))),
    );

    expect(response.status).toBe(400);
  });

  // An empty list usually means "not indexed yet" or a transient upstream
  // problem. Caching that for a day would hide coverage that shows up minutes
  // later, so empties get a much shorter TTL than real results.
  it("caches an empty result only briefly", async () => {
    const cache = new FakeCache();
    await handleRelated(
      relatedRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstreamWith(feed([])), cache),
    );

    expect(maxAgeOf(relatedEntry(cache))).toBe(300);
  });

  it("caches a non-empty result for a day", async () => {
    const cache = new FakeCache();
    await handleRelated(
      relatedRequest(ARTICLE_URL),
      testEnv,
      makeDeps(
        upstreamWith(feed([["https://www.npr.org/story", "NPR"]])),
        cache,
      ),
    );

    expect(maxAgeOf(relatedEntry(cache))).toBe(86_400);
  });

  it("serves a cached result without re-querying the feed", async () => {
    const cache = new FakeCache();
    const upstream = upstreamWith(feed([["https://www.npr.org/story", "NPR"]]));

    await handleRelated(
      relatedRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream, cache),
    );
    const callsAfterFirst = upstream.calls.length;

    const second = await handleRelated(
      relatedRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream, cache),
    );

    expect(upstream.calls.length).toBe(callsAfterFirst);
    await expect(second.json()).resolves.toMatchObject({
      outlets: [{ host: "npr.org" }],
    });
  });
});
