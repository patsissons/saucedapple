// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FakeCache,
  fixture,
  makeDeps,
  testEnv,
  type FakeUpstream,
} from "../test-support";
import { handleExtract } from "./extract";

const ID = "AtPew8L70RNexncdCICfcUg";
const ARTICLE_URL = `https://apple.news/${ID}`;
const STORY = "https://publisher.test/story";
const SNAPSHOT = `https://snapshots.test/20260728182004id_/${STORY}`;

function appleNewsPage(canonical: string): string {
  return `
    <script>redirectToUrl("${canonical}")</script>
    <meta property="og:title" content="Story Title — Test Publisher" />
  `;
}

function extractRequest(url: string): Request {
  const base = new URL("https://saucedapple.test/api/extract");
  base.searchParams.set("id", url);
  return new Request(base);
}

function baseRoutes(): FakeUpstream["routes"] {
  return {
    [`https://apple-news.test/${ID}`]: () => new Response(appleNewsPage(STORY)),
  };
}

describe("handleExtract", () => {
  it("extracts from the publisher when the page is freely readable", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        ...baseRoutes(),
        [STORY]: () => new Response(fixture("publisher-article.html")),
      },
    };
    const response = await handleExtract(
      extractRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("publisher");
    expect(body.sourceUrl).toBe(STORY);
    expect(body.textLength).toBeGreaterThan(800);
    expect(body.html).toContain("cider");
  });

  it("falls back to a Wayback snapshot when the publisher paywalls", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        ...baseRoutes(),
        [STORY]: () => new Response(fixture("publisher-paywalled.html")),
        [`https://wayback.test/available?url=${encodeURIComponent(STORY)}`]:
          () => new Response(fixture("wayback-available.json")),
        [SNAPSHOT]: () => new Response(fixture("publisher-article.html")),
      },
    };
    const response = await handleExtract(
      extractRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("wayback");
    expect(body.sourceUrl).toBe(SNAPSHOT);
    expect(body.html).toContain("cider");
  });

  it("falls back when the publisher blocks with a 403", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        ...baseRoutes(),
        [STORY]: () => new Response("Forbidden", { status: 403 }),
        [`https://wayback.test/available?url=${encodeURIComponent(STORY)}`]:
          () => new Response(fixture("wayback-available.json")),
        [SNAPSHOT]: () => new Response(fixture("publisher-article.html")),
      },
    };
    const response = await handleExtract(
      extractRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );
    expect((await response.json()).source).toBe("wayback");
  });

  it("returns extraction_failed when publisher and archive both fail", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        ...baseRoutes(),
        [STORY]: () => new Response(fixture("publisher-paywalled.html")),
        "*": () => new Response(fixture("wayback-unavailable.json")),
      },
    };
    const response = await handleExtract(
      extractRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("extraction_failed");
  });

  it("returns no_canonical for News+ exclusives", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        [`https://apple-news.test/${ID}`]: () =>
          new Response(fixture("apple-news-exclusive.html")),
      },
    };
    const response = await handleExtract(
      extractRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("no_canonical");
  });

  it("returns invalid_url for non-apple-news input", async () => {
    const response = await handleExtract(
      extractRequest("https://example.com"),
      testEnv,
      makeDeps({ calls: [], routes: {} }),
    );
    expect(response.status).toBe(400);
  });

  it("serves repeat requests from cache without refetching", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        ...baseRoutes(),
        [STORY]: () => new Response(fixture("publisher-article.html")),
      },
    };
    const cache = new FakeCache();

    await handleExtract(
      extractRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream, cache),
    );
    const callsAfterFirst = upstream.calls.length;

    const second = await handleExtract(
      extractRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream, cache),
    );
    expect(second.status).toBe(200);
    expect(upstream.calls.length).toBe(callsAfterFirst);
  });
});
