import { expect, test } from "@playwright/test";

const FREE_URL = "https://apple.news/Ae2eFreeArticle0testXX";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("the copy button puts the permalink on the clipboard", async ({
  page,
}) => {
  await page.goto(`/?url=${encodeURIComponent(FREE_URL)}`);
  await page.getByRole("button", { name: "Copy link" }).click();

  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url(),
  );
});

test("share and copy buttons are available on the root page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Share this page" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
});
