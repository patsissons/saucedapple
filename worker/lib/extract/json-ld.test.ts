// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractJsonLdArticle } from "./json-ld";

const SOURCE = "https://publisher.test/story";

function page(jsonLd: string): string {
  return `<!DOCTYPE html><html><head><script type="application/ld+json">${jsonLd}</script></head><body><p>ignored</p></body></html>`;
}

const BODY = "First paragraph of the story.\n\nSecond paragraph of the story.";

describe("extractJsonLdArticle", () => {
  it("pulls the article body out of a NewsArticle node", () => {
    const article = extractJsonLdArticle(
      page(
        JSON.stringify({
          "@type": "NewsArticle",
          headline: "How Cider Makers Reinvented an Industry",
          description: "A wave of small producers.",
          author: { name: "Jane Doe" },
          articleBody: BODY,
        }),
      ),
      SOURCE,
    );

    expect(article).not.toBeNull();
    expect(article?.title).toBe("How Cider Makers Reinvented an Industry");
    expect(article?.byline).toBe("Jane Doe");
    expect(article?.excerpt).toBe("A wave of small producers.");
    expect(article?.html).toBe(
      "<p>First paragraph of the story.</p><p>Second paragraph of the story.</p>",
    );
    expect(article?.textLength).toBe(BODY.length);
  });

  it("finds an article nested in an @graph container", () => {
    const article = extractJsonLdArticle(
      page(
        JSON.stringify({
          "@graph": [
            { "@type": "WebSite", name: "Publisher" },
            { "@type": "Article", headline: "Nested", articleBody: BODY },
          ],
        }),
      ),
      SOURCE,
    );

    expect(article?.title).toBe("Nested");
  });

  it("prefers the longest articleBody when several are present", () => {
    const html =
      page(JSON.stringify({ "@type": "Article", articleBody: "Short body." })) +
      page(
        JSON.stringify({
          "@type": "NewsArticle",
          articleBody: `${BODY} And more text besides.`,
        }),
      );

    const article = extractJsonLdArticle(html, SOURCE);

    expect(article?.html).toContain("And more text besides.");
  });

  // Publishers routinely emit raw newlines inside JSON string literals, which
  // is invalid JSON — we retry with them escaped rather than dropping the page.
  it("tolerates raw newlines inside the JSON-LD string", () => {
    const article = extractJsonLdArticle(
      page(
        '{"@type":"NewsArticle","headline":"Loose","articleBody":"Line one.\nLine two."}',
      ),
      SOURCE,
    );

    expect(article?.title).toBe("Loose");
  });

  it("returns null when there is no article-typed node", () => {
    expect(
      extractJsonLdArticle(
        page(JSON.stringify({ "@type": "WebSite", name: "Publisher" })),
        SOURCE,
      ),
    ).toBeNull();
  });

  it("returns null when the article node carries no body", () => {
    expect(
      extractJsonLdArticle(
        page(JSON.stringify({ "@type": "NewsArticle", headline: "No body" })),
        SOURCE,
      ),
    ).toBeNull();
  });

  it("returns null for pages with no JSON-LD at all", () => {
    expect(
      extractJsonLdArticle("<html><body><p>Nothing</p></body></html>", SOURCE),
    ).toBeNull();
  });

  it("makes relative links absolute", () => {
    const article = extractJsonLdArticle(
      page(
        JSON.stringify({
          "@type": "NewsArticle",
          articleBody: 'See <a href="/more">more</a> here in this paragraph.',
        }),
      ),
      SOURCE,
    );

    expect(article?.html).toContain("https://publisher.test/more");
  });
});
