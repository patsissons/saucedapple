// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ResolveResponse } from "../../shared/api";
import { buildAltLinks } from "./alt-links";

const ARTICLE: ResolveResponse = {
  id: "AtPew8L70RNexncdCICfcUg",
  appleNewsUrl: "https://apple.news/AtPew8L70RNexncdCICfcUg",
  canonicalUrl: "https://www.wsj.com/business/story-slug",
  title: "A Big Story",
  publisher: "The Wall Street Journal",
  description: null,
  image: null,
};

describe("buildAltLinks", () => {
  it("builds publisher, archive, and search links", () => {
    const links = buildAltLinks(ARTICLE);
    const byKey = Object.fromEntries(links.map((l) => [l.key, l.href]));

    expect(byKey["publisher"]).toBe("https://www.wsj.com/business/story-slug");
    expect(byKey["archive-today"]).toBe(
      "https://archive.ph/newest/https://www.wsj.com/business/story-slug",
    );
    expect(byKey["wayback"]).toBe(
      "https://web.archive.org/web/https://www.wsj.com/business/story-slug",
    );
    expect(byKey["google"]).toContain(
      encodeURIComponent('"A Big Story" site:wsj.com'),
    );
    expect(byKey["google-news"]).toContain(encodeURIComponent("A Big Story"));
    expect(links.find((l) => l.key === "publisher")?.label).toBe("wsj.com");
  });

  it("offers only a news search when there is no canonical URL", () => {
    const links = buildAltLinks({ ...ARTICLE, canonicalUrl: null });
    expect(links.map((l) => l.key)).toEqual(["google-news"]);
  });

  it("returns nothing without canonical URL or title", () => {
    expect(
      buildAltLinks({ ...ARTICLE, canonicalUrl: null, title: null }),
    ).toEqual([]);
  });
});
