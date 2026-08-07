import { afterEach, describe, expect, it, vi } from "vitest";
import { extractViaReader, parseJinaMarkdown } from "./jina";

const URL = "https://publisher.test/story";

function stubFetch(impl: () => Promise<Response> | Response) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

// A jina response: metadata preamble + a body long enough to pass the gate.
function jinaBody(content: string): string {
  return [
    "Title: How Cider Makers Reinvented an Industry",
    "",
    `URL Source: ${URL}`,
    "",
    "Markdown Content:",
    content,
  ].join("\n");
}

// Paragraph-per-line, as jina emits. Each line must clear the prose gate.
const PARAGRAPH =
  "A wave of small producers began treating cider the way winemakers treat grapes, fermenting single varieties and bottling them like wine. ";
// ~500 words across 4 paragraphs — comfortably over the article-prose gate.
const LONG_BODY = [
  "# How Cider Makers Reinvented an Industry",
  PARAGRAPH.repeat(6),
  PARAGRAPH.repeat(6),
  PARAGRAPH.repeat(6),
  PARAGRAPH.repeat(6),
].join("\n");

// What r.jina.ai actually returns for a hard paywall (FT-shaped): plenty of
// text, but every line is subscription/footer chrome and none is the article.
const PAYWALL_CHROME = [
  "Then $75 per month. Complete digital access to quality FT journalism on any device. Cancel anytime during your trial period.",
  "Complete digital access to quality journalism with expert analysis from industry leaders. Pay a year upfront and save 20% on your subscription.",
  "Share News Tips Securely. Individual Subscriptions. Professional Subscriptions. Republishing. Executive Job Search. Advertise with us today.",
  "Markets data delayed by at least 15 minutes. © THE FINANCIAL TIMES LTD 2026. FT and Financial Times are trademarks of The Financial Times Ltd.",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseJinaMarkdown", () => {
  it("strips the metadata preamble and extracts the title", () => {
    const { title, markdown } = parseJinaMarkdown(
      jinaBody("Hello world body."),
    );
    expect(title).toBe("How Cider Makers Reinvented an Industry");
    expect(markdown).toBe("Hello world body.");
    expect(markdown).not.toContain("URL Source:");
  });

  it("falls back to the whole text when there is no preamble", () => {
    const { title, markdown } = parseJinaMarkdown("Just some raw markdown.");
    expect(title).toBeNull();
    expect(markdown).toBe("Just some raw markdown.");
  });
});

describe("extractViaReader", () => {
  it("returns rendered HTML for a real article", async () => {
    stubFetch(() => new Response(jinaBody(LONG_BODY), { status: 200 }));

    const result = await extractViaReader(URL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sourceUrl).toBe(URL);
    expect(result.data.title).toBe("How Cider Makers Reinvented an Industry");
    // marked turned the markdown heading into an <h1>.
    expect(result.data.html).toContain("<h1");
    expect(result.data.html).toContain("winemakers treat grapes");
  });

  it("fails when the reader returns a short stub", async () => {
    stubFetch(
      () => new Response(jinaBody("Subscribe to read."), { status: 200 }),
    );

    const result = await extractViaReader(URL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("extraction_failed");
  });

  // The bug this guards against: jina returns the whole page as markdown, so a
  // paywalled article still comes back with hundreds of words of subscription
  // and footer text. A naive length check rendered that to users as an article.
  it("rejects a paywall page that is long but contains only chrome", async () => {
    stubFetch(() => new Response(jinaBody(PAYWALL_CHROME), { status: 200 }));

    const result = await extractViaReader(URL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("extraction_failed");
  });

  it("drops chrome lines but keeps the article when both are present", async () => {
    stubFetch(
      () =>
        new Response(jinaBody(`${PAYWALL_CHROME}\n${LONG_BODY}`), {
          status: 200,
        }),
    );

    const result = await extractViaReader(URL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.html).toContain("winemakers treat grapes");
    expect(result.data.html).not.toContain("per month");
    expect(result.data.html).not.toContain("FINANCIAL TIMES");
  });

  it("fails when the reader returns a block page", async () => {
    const blocked = "You have been blocked. " + "x ".repeat(400);
    stubFetch(() => new Response(jinaBody(blocked), { status: 200 }));

    const result = await extractViaReader(URL);

    expect(result.ok).toBe(false);
  });

  it("fails on a non-ok response", async () => {
    stubFetch(() => new Response("nope", { status: 429 }));

    const result = await extractViaReader(URL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("extraction_failed");
  });

  it("reports an upstream error when the fetch throws", async () => {
    stubFetch(() => {
      throw new Error("network down");
    });

    const result = await extractViaReader(URL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("upstream_error");
  });
});
