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

const LONG_BODY =
  "# How Cider Makers Reinvented an Industry\n\n" +
  "A wave of small producers began treating cider the way winemakers treat grapes. ".repeat(
    12,
  );

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

  it("fails when the reader returns a block/paywall page", async () => {
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
