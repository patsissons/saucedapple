// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { findRelatedCoverage } from "./related";

const TITLE = "Cider makers reinvent an industry with single-variety bottles";

// Mirrors Bing News RSS: an apiclick redirect carrying the publisher's real
// URL in `url=`, plus a <News:Source> outlet name.
function item(title: string, host: string, name: string): string {
  const article = `https://${host}/story`;
  return (
    `<item><title>${title}</title>` +
    `<link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=${encodeURIComponent(article)}&amp;c=1</link>` +
    `<News:Source>${name}</News:Source></item>`
  );
}

function feed(items: string[]): string {
  return `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;
}

function stubFetch(body: string, ok = true): typeof fetch {
  return vi.fn(
    async () => new Response(body, { status: ok ? 200 : 500 }),
  ) as unknown as typeof fetch;
}

describe("findRelatedCoverage", () => {
  it("returns other outlets covering the same story", async () => {
    const outlets = await findRelatedCoverage(
      stubFetch(
        feed([
          item(
            "Cider makers reinvent an industry with single-variety bottles",
            "reuters.com",
            "Reuters",
          ),
          item(
            "Single-variety cider bottles reinvent the industry, makers say",
            "npr.org",
            "NPR",
          ),
        ]),
      ),
      TITLE,
      "orchardreport.test",
    );

    expect(outlets).toHaveLength(2);
    expect(outlets[0]).toMatchObject({
      outlet: "Reuters",
      host: "reuters.com",
      // Links straight to the publisher, not through Bing.
      url: "https://reuters.com/story",
    });
    expect(outlets[1]?.host).toBe("npr.org");
  });

  it("excludes the originating publisher", async () => {
    const outlets = await findRelatedCoverage(
      stubFetch(
        feed([item(TITLE, "www.orchardreport.test", "The Orchard Report")]),
      ),
      TITLE,
      "orchardreport.test",
    );

    expect(outlets).toEqual([]);
  });

  it("drops results whose headline is about a different story", async () => {
    const outlets = await findRelatedCoverage(
      stubFetch(
        feed([
          item("Local council approves new parking rules", "npr.org", "NPR"),
        ]),
      ),
      TITLE,
      null,
    );

    expect(outlets).toEqual([]);
  });

  it("deduplicates repeated outlets", async () => {
    const outlets = await findRelatedCoverage(
      stubFetch(
        feed([
          item(TITLE, "reuters.com", "Reuters"),
          item(TITLE, "reuters.com", "Reuters"),
        ]),
      ),
      TITLE,
      null,
    );

    expect(outlets).toHaveLength(1);
  });

  it("ignores an item whose link has no publisher URL to unwrap", async () => {
    const outlets = await findRelatedCoverage(
      stubFetch(
        feed([
          `<item><title>${TITLE}</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;c=1</link><News:Source>Mystery</News:Source></item>`,
        ]),
      ),
      TITLE,
      null,
    );

    expect(outlets).toEqual([]);
  });

  it("decodes HTML entities in titles and outlet names", async () => {
    const outlets = await findRelatedCoverage(
      stubFetch(
        feed([
          item(
            "Cider makers reinvent an industry &amp; bottle single varieties",
            "npr.org",
            "NPR &amp; Friends",
          ),
        ]),
      ),
      TITLE,
      null,
    );

    expect(outlets[0]?.outlet).toBe("NPR & Friends");
    expect(outlets[0]?.title).toContain("&");
  });

  // This is a nice-to-have shown after extraction already failed, so a broken
  // upstream must degrade to "no coverage", never to an error.
  it("returns an empty list when the feed request fails", async () => {
    const outlets = await findRelatedCoverage(
      stubFetch("nope", false),
      TITLE,
      null,
    );

    expect(outlets).toEqual([]);
  });

  it("returns an empty list when the fetch throws", async () => {
    const throwing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(findRelatedCoverage(throwing, TITLE, null)).resolves.toEqual(
      [],
    );
  });
});
