import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test("landing navigation is keyboard-operable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menuButton).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

test("module routes render without horizontal overflow at acceptance widths", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable" } }) });
  });

  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/dashboard", "/tasks", "/habits", "/pomodoro", "/projects", "/finance/accounts"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("offline status is clear and mutation requests are not treated as success", async ({ page, context }) => {
  await page.goto("/login");
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("Offline.");

  await page.getByLabel("Email").fill("ada@example.com");
  await page.locator("#password").fill("password-for-offline-test");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toContainText("could not sign you in");
  await context.setOffline(false);
});
