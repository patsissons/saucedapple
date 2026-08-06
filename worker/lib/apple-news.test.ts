// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  parseAppleNewsPage,
  splitTitlePublisher,
} from "./apple-news";

function fixture(name: string): string {
  return readFileSync(
    new URL(`./__fixtures__/${name}`, import.meta.url),
    "utf8",
  );
}

describe("parseAppleNewsPage", () => {
  it("parses the recorded WSJ article page", () => {
    const page = parseAppleNewsPage(fixture("apple-news-wsj.html"));

    expect(page).toEqual({
      canonicalUrl:
        "https://www.wsj.com/cio-journal/why-chilis-isnt-going-all-in-on-ai-bddef245",
      title: "Why Chili’s Isn’t Going ‘All In’ on AI",
      publisher: "The Wall Street Journal",
      description:
        "The restaurant chain has made a turnaround analysts call remarkable. A reinvestment in basic, foundational tech is part of the reason, says its CIO.",
      image: "https://c.apple.news/AgEXQWVBM0l1Z3UwUmdXN3JDVE1INlg0TkEAMA",
    });
  });

  it("returns null for the recorded not-found page", () => {
    // The 404 page defines redirectToUrl(url) but never calls it with a URL
    // literal, and its og:title is the generic "Apple News".
    expect(parseAppleNewsPage(fixture("apple-news-notfound.html"))).toBeNull();
  });

  it("parses a News+ exclusive page with no canonical URL", () => {
    const page = parseAppleNewsPage(fixture("apple-news-exclusive.html"));

    expect(page).toEqual({
      canonicalUrl: null,
      title: "An Exclusive Story",
      publisher: "Apple News+ Magazine",
      description:
        "A story that only exists inside Apple News+ & has no publisher website.",
      image: "https://c.apple.news/ExclusiveImageId",
    });
  });

  it("parses meta tags with content before property", () => {
    const html = `
      <script>redirectToUrl("https://example.com/story")</script>
      <meta content="Reversed Title — Reversed Pub" property="og:title" />
    `;
    expect(parseAppleNewsPage(html)).toMatchObject({
      canonicalUrl: "https://example.com/story",
      title: "Reversed Title",
      publisher: "Reversed Pub",
    });
  });

  it("falls back to the canonical hostname when og:title has no publisher", () => {
    const html = `
      <script>redirectToUrlAfterTimeout("https://www.example.co.uk/story", 0)</script>
      <meta property="og:title" content="Just a Title" />
    `;
    expect(parseAppleNewsPage(html)).toMatchObject({
      title: "Just a Title",
      publisher: "example.co.uk",
    });
  });

  it("does not treat apple.news self-links as canonical", () => {
    const html = `<script>redirectToUrl("https://apple.news/AtPew8L70RNexncdCICfcUg")</script>`;
    expect(parseAppleNewsPage(html)).toBeNull();
  });
});

describe("splitTitlePublisher", () => {
  it("splits on the last em-dash separator", () => {
    expect(splitTitlePublisher("A Tale — of Two Cities — The Times")).toEqual({
      title: "A Tale — of Two Cities",
      publisher: "The Times",
    });
  });

  it("returns null publisher without a separator", () => {
    expect(splitTitlePublisher("Plain Title")).toEqual({
      title: "Plain Title",
      publisher: null,
    });
  });

  it("does not split on hyphen or en-dash", () => {
    expect(splitTitlePublisher("Well-known title – subtitle")).toEqual({
      title: "Well-known title – subtitle",
      publisher: null,
    });
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal, and hex entities", () => {
    expect(
      decodeEntities("Fish &amp; Chips &#8212; caf&#xe9; &quot;menu&quot;"),
    ).toBe('Fish & Chips — café "menu"');
  });

  it("leaves unknown entities intact", () => {
    expect(decodeEntities("&unknown; stays")).toBe("&unknown; stays");
  });
});
