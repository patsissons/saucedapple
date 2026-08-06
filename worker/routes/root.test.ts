// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Env } from "../cloudflare";
import { fixture, makeDeps, testEnv, type FakeUpstream } from "../test-support";
import { handleRoot } from "./root";

const INDEX_HTML = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);

const ID = "AtPew8L70RNexncdCICfcUg";
const ARTICLE_URL = `https://apple.news/${ID}`;

const envWithAssets: Env = {
  ...testEnv,
  ASSETS: {
    fetch: async () =>
      new Response(INDEX_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  },
};

function rootRequest(url: string | null): Request {
  const base = new URL("https://saucedapple.com/");
  if (url !== null) base.searchParams.set("url", url);
  return new Request(base);
}

function wsjUpstream(): FakeUpstream {
  return {
    calls: [],
    routes: {
      [`https://apple-news.test/${ID}`]: () =>
        new Response(fixture("apple-news-wsj.html")),
    },
  };
}

describe("handleRoot", () => {
  it("serves static html without a url param", async () => {
    const response = await handleRoot(
      rootRequest(null),
      envWithAssets,
      makeDeps({ calls: [], routes: {} }),
    );
    const html = await response.text();
    expect(html).toContain('property="og:title" content="Sauced Apple"');
  });

  it("injects article meta for a valid resolvable permalink", async () => {
    const response = await handleRoot(
      rootRequest(ARTICLE_URL),
      envWithAssets,
      makeDeps(wsjUpstream()),
    );
    const html = await response.text();
    expect(html).toContain("Why Chili’s Isn’t Going ‘All In’ on AI");
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain("The Wall Street Journal");
  });

  it("falls back to static html for an invalid url", async () => {
    const upstream: FakeUpstream = { calls: [], routes: {} };
    const response = await handleRoot(
      rootRequest("https://example.com/nope"),
      envWithAssets,
      makeDeps(upstream),
    );
    const html = await response.text();
    expect(html).toContain('property="og:title" content="Sauced Apple"');
    expect(upstream.calls).toHaveLength(0);
  });

  it("falls back to static html when resolution fails", async () => {
    const upstream: FakeUpstream = {
      calls: [],
      routes: { "*": () => new Response("down", { status: 503 }) },
    };
    const response = await handleRoot(
      rootRequest(ARTICLE_URL),
      envWithAssets,
      makeDeps(upstream),
    );
    const html = await response.text();
    expect(html).toContain('property="og:title" content="Sauced Apple"');
  });
});
