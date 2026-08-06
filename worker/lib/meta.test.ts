// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ResolveResponse } from "../../shared/api";
import { injectArticleMeta } from "./meta";

// Test against the real index.html so the regexes stay in sync with the
// actual markup the worker rewrites in production.
const INDEX_HTML = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);

const ARTICLE: ResolveResponse = {
  id: "AtPew8L70RNexncdCICfcUg",
  appleNewsUrl: "https://apple.news/AtPew8L70RNexncdCICfcUg",
  canonicalUrl: "https://www.wsj.com/story",
  title: "Why Chili's Isn't Going \"All In\" & More",
  publisher: "The Wall Street Journal",
  description: "A turnaround analysts call remarkable.",
  image: "https://c.apple.news/HeroImage",
};

const PERMALINK =
  "https://saucedapple.com/?url=https%3A%2F%2Fapple.news%2FAtPew8L70RNexncdCICfcUg";

// Prettier wraps long meta tags across lines; collapse whitespace so
// assertions can use single-line expectations.
function flat(html: string): string {
  return html.replace(/\s+/g, " ");
}

describe("injectArticleMeta", () => {
  const html = flat(injectArticleMeta(INDEX_HTML, ARTICLE, PERMALINK));

  it("rewrites title and og tags with escaped article values", () => {
    expect(html).toContain(
      "<title>Why Chili's Isn't Going &quot;All In&quot; &amp; More · sauced apple</title>",
    );
    expect(html).toContain(
      'property="og:title" content="Why Chili\'s Isn\'t Going &quot;All In&quot; &amp; More — The Wall Street Journal"',
    );
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain(
      'property="og:description" content="A turnaround analysts call remarkable."',
    );
    expect(html).toContain(
      'property="og:image" content="https://c.apple.news/HeroImage"',
    );
    expect(html).toContain(`property="og:url" content="${PERMALINK}"`);
  });

  it("rewrites the twitter tags too", () => {
    expect(html).toContain(
      'name="twitter:image" content="https://c.apple.news/HeroImage"',
    );
    expect(html).toContain('name="twitter:description"');
  });

  it("leaves no default og values behind except site_name and card type", () => {
    expect(html).not.toContain('content="sauced apple — read Apple News');
    expect(html).toContain('property="og:site_name" content="sauced apple"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("falls back to site defaults for missing fields", () => {
    const sparse = flat(
      injectArticleMeta(
        INDEX_HTML,
        {
          ...ARTICLE,
          title: null,
          publisher: null,
          description: null,
          image: null,
        },
        PERMALINK,
      ),
    );
    expect(sparse).toContain('property="og:title" content="sauced apple"');
    expect(sparse).toContain(
      'property="og:image" content="https://saucedapple.com/og-image.png"',
    );
    expect(sparse).toContain(
      'content="Free ways to read this Apple News story."',
    );
  });
});
