import { expect, test } from "@playwright/test";

const FREE_URL = "https://apple.news/Ae2eFreeArticle0testXX";
const EXCLUSIVE_URL = "https://apple.news/Ae2eExclusive0testXXXX";
const PAYWALL_URL = "https://apple.news/Ae2ePaywall00testXXXX";

test("pasting a link shows the article card, links, and a permalink", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /sauced\s+apple/i }),
  ).toBeVisible();

  await page.getByLabel("Apple News link").fill(FREE_URL);
  await page.getByRole("button", { name: "Sauce it!" }).click();

  await expect(
    page.getByText("How Cider Makers Reinvented an Industry"),
  ).toBeVisible();
  await expect(page.getByText("The Orchard Report")).toBeVisible();
  await expect(page.getByRole("link", { name: "archive.today" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Wayback Machine" }),
  ).toBeVisible();
  await expect(page).toHaveURL(`/?url=${encodeURIComponent(FREE_URL)}`);
});

test("a ?url= permalink resolves on load", async ({ page }) => {
  await page.goto(`/?url=${encodeURIComponent(FREE_URL)}`);
  await expect(
    page.getByText("How Cider Makers Reinvented an Industry"),
  ).toBeVisible();
});

test("the reader view loads the extracted transcript", async ({ page }) => {
  await page.goto(`/?url=${encodeURIComponent(FREE_URL)}`);
  await page.getByRole("button", { name: /read transcript/i }).click();

  await expect(
    page.getByText(/the cider industry moved at the speed/i),
  ).toBeVisible();
  await expect(page.getByText(/extracted from/i)).toBeVisible();
});

test("falls back to the client-side reader when extraction fails", async ({
  page,
}) => {
  // Intercept the browser's call to r.jina.ai so the suite stays hermetic.
  await page.route("https://r.jina.ai/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: [
        "Title: A Paywalled Investigation",
        "",
        "URL Source: https://publisher.test/paywalled",
        "",
        "Markdown Content:",
        "# A Paywalled Investigation",
        // Four substantial paragraphs — the reader requires real article prose
        // (>=3 paragraphs, >=400 words), so a short stub would be rejected.
        ...Array.from({ length: 4 }, () =>
          "The reader recovered the full story from your own browser. ".repeat(
            12,
          ),
        ),
      ].join("\n"),
    }),
  );

  await page.goto(`/?url=${encodeURIComponent(PAYWALL_URL)}`);
  await page.getByRole("button", { name: /read transcript/i }).click();

  // The fixture has several paragraphs, so scope to the first match.
  await expect(
    page.getByText(/the reader recovered the full story/i).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /reader view/i })).toBeVisible();
});

test("an invalid link shows an inline error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Apple News link").fill("https://example.com/story");
  await page.getByRole("button", { name: "Sauce it!" }).click();

  await expect(page.getByText("Not an Apple News link")).toBeVisible();
});

test("a News+ exclusive explains itself without a reader view", async ({
  page,
}) => {
  await page.goto(`/?url=${encodeURIComponent(EXCLUSIVE_URL)}`);

  await expect(page.getByText(/Apple News\+ exclusive/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /read transcript/i }),
  ).toBeHidden();
});
