import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "./sanitize";

describe("sanitizeArticleHtml", () => {
  it("strips scripts and event handlers", () => {
    const html = sanitizeArticleHtml(
      '<p onclick="steal()">text</p><script>steal()</script><img src="https://a.test/x.jpg" onerror="steal()" />',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<p>text</p>");
    expect(html).toContain('src="https://a.test/x.jpg"');
  });

  it("removes javascript: and data: URLs", () => {
    const html = sanitizeArticleHtml(
      '<a href="javascript:alert(1)">a</a><img src="data:image/svg+xml,<svg/>" />',
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:");
  });

  it("forces links to open in a new tab with rel protection", () => {
    const html = sanitizeArticleHtml(
      '<a href="https://pub.test/next">next</a>',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("drops disallowed embed tags entirely", () => {
    const html = sanitizeArticleHtml(
      '<iframe src="https://evil.test"></iframe><object data="x"></object><p>keep</p>',
    );
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("object");
    expect(html).toContain("keep");
  });
});
