import { expect, test } from "@playwright/test";

// API-level specs proving the worker runs against the hermetic mock
// (wrangler e2e env) rather than the real network.

const FREE_URL = "https://apple.news/Ae2eFreeArticle0testXX";
const EXCLUSIVE_URL = "https://apple.news/Ae2eExclusive0testXXXX";

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ ok: true });
});

test("resolve returns mock article metadata", async ({ request }) => {
  const response = await request.get(
    `/api/resolve?url=${encodeURIComponent(FREE_URL)}`,
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    canonicalUrl: "http://127.0.0.1:8799/publisher/article",
    title: "How Cider Makers Reinvented an Industry",
    publisher: "The Orchard Report",
  });
});

test("resolve surfaces News+ exclusives with a null canonical URL", async ({
  request,
}) => {
  const response = await request.get(
    `/api/resolve?url=${encodeURIComponent(EXCLUSIVE_URL)}`,
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    canonicalUrl: null,
    publisher: "Apple News+ Magazine",
  });
});

test("extract returns readable article html", async ({ request }) => {
  const response = await request.get(
    `/api/extract?url=${encodeURIComponent(FREE_URL)}`,
  );
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.source).toBe("publisher");
  expect(body.html).toContain("cider");
  expect(body.textLength).toBeGreaterThan(800);
});

test("resolve rejects a non-apple-news url", async ({ request }) => {
  const response = await request.get("/api/resolve?url=https://example.com");
  expect(response.status()).toBe(400);
});
