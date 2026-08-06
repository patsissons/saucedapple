import { expect, test } from "@playwright/test";

// Crawler-eye view: raw HTML fetches (no JS) must carry the right OG tags.

const FREE_URL = "https://apple.news/Ae2eFreeArticle0testXX";

function flat(html: string): string {
  return html.replace(/\s+/g, " ");
}

test("the root page serves the site-default OpenGraph tags", async ({
  request,
}) => {
  const html = flat(await (await request.get("/")).text());
  expect(html).toContain('property="og:title" content="sauced apple"');
  expect(html).toContain('property="og:type" content="website"');
});

test("a valid permalink serves article-specific OpenGraph tags", async ({
  request,
}) => {
  const html = flat(
    await (await request.get(`/?url=${encodeURIComponent(FREE_URL)}`)).text(),
  );
  expect(html).toContain(
    'property="og:title" content="How Cider Makers Reinvented an Industry — The Orchard Report"',
  );
  expect(html).toContain('property="og:type" content="article"');
  expect(html).toContain(
    'property="og:image" content="http://127.0.0.1:8799/publisher/hero.jpg"',
  );
});

test("an invalid permalink falls back to the site-default tags", async ({
  request,
}) => {
  const html = flat(
    await (await request.get("/?url=https://example.com/nope")).text(),
  );
  expect(html).toContain('property="og:title" content="sauced apple"');
  expect(html).toContain('property="og:type" content="website"');
});
