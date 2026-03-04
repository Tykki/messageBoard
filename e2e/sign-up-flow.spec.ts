import { test, expect } from "@playwright/test";
import { login, setupE2eTest, signUp } from "./utils";

test.describe("User auth flow", () => {
  test.beforeEach(setupE2eTest);

  /**
   * Helper to generate unique emails per test run.
   * Prevents cross-test pollution.
   */
  function randomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
  const generateUser = () => {
    const id = randomInt(0, 999999);
    return {
      email: `test${id}@test.io`,
      password: "test123456",
      username: `testuser${id}`,
    };
  };

  test("new user can signup and choose username", async ({ page }) => {
    const user = generateUser();
    await page.goto("/");
    await signUp(page, user.email, user.password, user.username);
    await expect(page).toHaveURL("/");
  });

  test("user can login from another machine", async ({ browser, page }) => {
    const user = generateUser();

    await page.goto("/");
    await signUp(page, user.email, user.password, user.username);

    const newMachine = await browser.newPage();
    await newMachine.goto("/");
    await login(newMachine, user.email, user.password, user.username);
  });

  test("user stays logged in on a new tab", async ({ context, page }) => {
    const user = generateUser();

    await page.goto("/");
    await signUp(page, user.email, user.password, user.username);

    const newTab = await context.newPage();
    await newTab.goto("/");

    await expect(
      newTab.getByRole("button", { name: "Logout" })
    ).toBeVisible();
  });

  test('user without username is redirected to "/welcome"', async ({ page }) => {
    const user = generateUser();

    await page.goto("/");
    await signUp(page, user.email, user.password, user.username, true);

    await expect(page).toHaveURL("/welcome");
    await expect(
      page.getByRole("heading", { name: "Welcome to Supaship!!" })
    ).toBeVisible();
  });

  test('user with username cannot access "/welcome"', async ({ page }) => {
    const user = generateUser();

    await page.goto("/");
    await signUp(page, user.email, user.password, user.username);

    await page.goto("/welcome");

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("button", { name: "Logout" })
    ).toBeVisible();
  });

  test('logged out user visiting "/welcome" gets redirected home', async ({ page }) => {
    await page.goto("/welcome");
    await expect(page).toHaveURL("/");
  });

  /**
   * ================================
   * CLIENT-SIDE VALIDATION TESTS
   * (HTML5 Native Validation)
   * ================================
   */
  test.describe("username client validation", () => {
    test.beforeEach(async ({ page }) => {
      const user = generateUser();
      await page.goto("/");
      await signUp(page, user.email, user.password, user.username, true);
      // Verify we are on the welcome page before testing the form
      await expect(page).toHaveURL("/welcome");
    });

    test("input is invalid when empty", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "Username" });
      const submit = page.getByRole("button", { name: "Submit" });

      await input.fill("");
      await submit.click();

      // Professional way: Check JS property and CSS pseudo-class
      await expect(input).toHaveJSProperty("validity.valid", false);
      await expect(page.locator('input:invalid')).toBeVisible();
    });

    test("input is invalid when invalid characters used", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "Username" });
      
      // Triggering validation via pattern/type
      await input.fill("hello world");
      
      await expect(input).toHaveJSProperty("validity.valid", false);
      // Specifically check that it failed due to a pattern mismatch if applicable
      await expect(input).toHaveJSProperty("validity.patternMismatch", true);
    });

    test("input is invalid when longer than 14 characters", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "Username" });
      const submit = page.getByRole("button", { name: "Submit" });
  
       // 1. The "Bypass": Remove the HTML restriction
      await input.evaluate((el) => {
        el.removeAttribute("maxlength");
        el.removeAttribute("required"); // Remove others while we're at it
      });
      // 2. Action: Submit data that server should reject
      await input.fill("this_is_a_way_too_long_username");
      await submit.click()
      
      // 4. Verification: Check the error returned by your Action
      await expect(
        page.getByText("Username must be less than 15 characters long.")
      ).toBeVisible();

      // Ensure we stayed on the page and didn't redirect
      await expect(page).toHaveURL("/welcome");
    });

    test("form submits and redirects when valid username entered", async ({ page }) => {
      const input = page.getByRole("textbox", { name: "Username" });
      const submit = page.getByRole("button", { name: "Submit" });

      await input.fill("valid_user");
      
      // Ensure it is valid before clicking
      await expect(input).toHaveJSProperty("validity.valid", true);
      
      await submit.click();
      
      // Verify professional success: navigation occurs
      await expect(page).toHaveURL("/");
    });
  });

  /**
   * ================================
   * SERVER-SIDE VALIDATION
   * ================================
   */
  test("duplicate username shows server error", async ({ page }) => {
    const user1 = generateUser();
    const duplicateName = "duplicateuser";

    await page.goto("/");
    await signUp(page, user1.email, user1.password, duplicateName);

    // logout
    await page.getByRole("button", { name: "Logout" }).click();

    const user2 = generateUser();
    await signUp(page, user2.email, user2.password, duplicateName, true);

    const input = page.getByRole("textbox", { name: "Username" });
    await input.fill(duplicateName);

    await page.getByRole("button", { name: "Submit" }).click();

    await expect(
      page.getByText(`Username "${duplicateName}" is already taken`)
    ).toBeVisible();
  });
});