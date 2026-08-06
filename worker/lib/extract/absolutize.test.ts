// @vitest-environment node
import { describe, expect, it } from "vitest";
import { absolutizeHtml } from "./absolutize";

const BASE = "https://publisher.test/section/story";

describe("absolutizeHtml", () => {
  it("rewrites relative hrefs, srcs, and srcsets", () => {
    const html = absolutizeHtml(
      '<p><a href="/other">x</a><a href="sibling">y</a>' +
        '<img src="../img/pic.jpg" srcset="a.jpg 1x, /b.jpg 2x" /></p>',
      BASE,
    );

    expect(html).toContain('href="https://publisher.test/other"');
    expect(html).toContain('href="https://publisher.test/section/sibling"');
    expect(html).toContain('src="https://publisher.test/img/pic.jpg"');
    expect(html).toContain("https://publisher.test/section/a.jpg 1x");
    expect(html).toContain("https://publisher.test/b.jpg 2x");
  });

  it("leaves absolute and unparseable URLs alone", () => {
    const html = absolutizeHtml(
      '<a href="https://elsewhere.test/page">x</a><a href="mailto:a@b.c">m</a>',
      BASE,
    );
    expect(html).toContain('href="https://elsewhere.test/page"');
    expect(html).toContain('href="mailto:a@b.c"');
  });
});
