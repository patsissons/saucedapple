import { expect, test } from "@playwright/test";

test.describe("system dark preference", () => {
  test.use({ colorScheme: "dark" });

  test("defaults to dark mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("system light preference", () => {
  test.use({ colorScheme: "light" });

  test("defaults to light mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("toggle switches to dark and persists across reload", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Toggling back to the system preference clears the override.
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();
  });
});
