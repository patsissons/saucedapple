// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fixture } from "../../test-support";
import { MIN_TEXT_LENGTH } from "./detect";
import { extractArticle } from "./extract";

const BASE = "https://publisher.test/story";

describe("extractArticle", () => {
  it("extracts readable content from a publisher page", () => {
    const article = extractArticle(fixture("publisher-article.html"), BASE);

    expect(article).not.toBeNull();
    expect(article!.textLength).toBeGreaterThan(MIN_TEXT_LENGTH);
    expect(article!.html).toContain("cider");
    expect(article!.html).not.toContain("<script");
    expect(article!.byline).toContain("Alex Orchard");
  });

  it("absolutizes relative links and images against the source URL", () => {
    const article = extractArticle(fixture("publisher-article.html"), BASE);

    expect(article!.html).toContain(
      'href="https://publisher.test/reports/orchard-census"',
    );
    expect(article!.html).toContain(
      'src="https://publisher.test/images/orchard-aerial.jpg"',
    );
    expect(article!.html).toContain(
      "https://publisher.test/images/orchard-aerial-480.jpg 480w",
    );
  });

  it("yields nothing usable from a paywall stub", () => {
    const article = extractArticle(fixture("publisher-paywalled.html"), BASE);
    expect(article === null || article.textLength < MIN_TEXT_LENGTH).toBe(true);
  });

  it("yields nothing usable from a page with no article content", () => {
    // Readability may return a stub rather than null; callers gate on
    // MIN_TEXT_LENGTH, so either shape is acceptable here.
    const article = extractArticle(
      "<html><body><nav>menu</nav></body></html>",
      BASE,
    );
    expect(article === null || article.textLength < MIN_TEXT_LENGTH).toBe(true);
  });
});
