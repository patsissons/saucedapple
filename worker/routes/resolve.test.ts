// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FakeCache,
  fixture,
  makeDeps,
  resolveRequest,
  testEnv,
  type FakeUpstream,
} from "../test-support";
import { handleResolve } from "./resolve";

const ID = "AtPew8L70RNexncdCICfcUg";
const ARTICLE_URL = `https://apple.news/${ID}`;

function wsjUpstream(): FakeUpstream {
  return {
    calls: [],
    routes: {
      [`https://apple-news.test/${ID}`]: () =>
        new Response(fixture("apple-news-wsj.html")),
    },
  };
}

describe("handleResolve", () => {
  it("resolves a valid apple.news link", async () => {
    const response = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      makeDeps(wsjUpstream()),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: ID,
      appleNewsUrl: ARTICLE_URL,
      canonicalUrl:
        "https://www.wsj.com/cio-journal/why-chilis-isnt-going-all-in-on-ai-bddef245",
      title: "Why Chili’s Isn’t Going ‘All In’ on AI",
      publisher: "The Wall Street Journal",
      description: expect.stringContaining("restaurant chain"),
      image: "https://c.apple.news/AgEXQWVBM0l1Z3UwUmdXN3JDVE1INlg0TkEAMA",
    });
  });

  it("returns invalid_url for a missing or non-apple-news url", async () => {
    for (const bad of [null, "", "https://example.com/story"]) {
      const response = await handleResolve(
        resolveRequest(bad),
        testEnv,
        makeDeps({ calls: [], routes: {} }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_url");
    }
  });

  it("maps upstream 404 to not_found", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        "*": () =>
          new Response(fixture("apple-news-notfound.html"), { status: 404 }),
      },
    };
    const response = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("treats a 200 non-article page as not_found", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        "*": () => new Response(fixture("apple-news-notfound.html")),
      },
    };
    const response = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );
    expect(response.status).toBe(404);
  });

  it("maps upstream 5xx to upstream_error", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: { "*": () => new Response("boom", { status: 503 }) },
    };
    const response = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("upstream_error");
  });

  it("maps fetch timeouts to upstream_timeout", async () => {
    const deps = makeDeps({ calls: [], routes: {} });
    deps.fetch = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };
    const response = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      deps,
    );
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("upstream_timeout");
  });

  it("resolves a News+ exclusive with canonicalUrl null", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: {
        "*": () => new Response(fixture("apple-news-exclusive.html")),
      },
    };
    const response = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      canonicalUrl: null,
      title: "An Exclusive Story",
      publisher: "Apple News+ Magazine",
    });
  });

  it("serves the second request from cache without refetching", async () => {
    const upstream = wsjUpstream();
    const cache = new FakeCache();

    const first = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream, cache),
    );
    expect(first.status).toBe(200);
    expect(upstream.calls).toHaveLength(1);

    const second = await handleResolve(
      resolveRequest(ARTICLE_URL),
      testEnv,
      makeDeps(upstream, cache),
    );
    expect(second.status).toBe(200);
    expect(upstream.calls).toHaveLength(1);
    expect((await second.json()).title).toBe(
      "Why Chili’s Isn’t Going ‘All In’ on AI",
    );
  });
});
