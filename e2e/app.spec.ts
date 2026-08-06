import { expect, test } from "@playwright/test";

const FREE_URL = "https://apple.news/Ae2eFreeArticle0testXX";
const EXCLUSIVE_URL = "https://apple.news/Ae2eExclusive0testXXXX";

test("pasting a link shows the article card, links, and a permalink", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /sauced\s+apple/i }),
  ).toBeVisible();

  await page.getByLabel("Apple News link").fill(FREE_URL);
  await page.getByRole("button", { name: "sauce it" }).click();

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

test("an invalid link shows an inline error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Apple News link").fill("https://example.com/story");
  await page.getByRole("button", { name: "sauce it" }).click();

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
