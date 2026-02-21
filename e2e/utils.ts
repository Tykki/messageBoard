import { execSync } from "child_process";
import detect from "detect-port"
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function setupE2eTest() {
    await startSupabase()
    reseedDb();
}

async function startSupabase() {
    const port = await detect(54321)
    // if port is === to detect input, then port is free
    if (port !== 54321) {
        console.log("Supabase already running")
        return
    } else {
        console.warn("Supabase not detected - Starting it now");
        execSync("npx supabase start", { stdio: "inherit" });
    }
}
function reseedDb() {
  // Use port 54322 to talk to the Database directly
  const dbPort = "54322"; 
  
  try {
    execSync(
      `PGPASSWORD=postgres psql -U postgres -h 127.0.0.1 -p ${dbPort} -d postgres -f supabase/clear-db-data.sql`,
      { stdio: "inherit" } // Change to "inherit" temporarily to see errors if it fails
    );
    console.log("Database reseeded successfully.");
  } catch (e) {
    console.error("Failed to reseed database. Is psql installed?");
  }
}

export async function signUp(
  page: Page,
  email: string,
  password: string,
  userName: string,
  skipUserName = false
) {
  const signUpButton = page.locator("button", { hasText: "Sign Up" }).first();
  await signUpButton.click();
  const emailInput = page.locator('input[name="email"]');
  await emailInput.fill(email);
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.fill(password);
  await page.keyboard.press("Enter");
  const welcomeNotice = page.locator("h2", { hasText: "Welcome to Supaship!" });
  await expect(welcomeNotice).toHaveCount(1);
  if (skipUserName) {
    return;
  }
  const usernameInput = page.locator('input[name="username"]');
  await usernameInput.fill(userName);
  const submitButton = page.locator("button", { hasText: "Submit" });
  await expect(submitButton).toBeEnabled();
  await page.keyboard.press("Enter");
  const logoutButton = page.locator("button", { hasText: "Logout" });
  await expect(logoutButton).toHaveCount(1);
}

export async function login(
  page: Page,
  email: string,
  password: string,
  username: string,
  loginButtonSelector = "button"
) {
  const signUpButton = page
    .locator(loginButtonSelector, { hasText: "Login" })
    .first();
  await signUpButton.click();
  const emailInput = page.locator('input[name="email"]');
  await emailInput.fill(email);
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.fill(password);
  await page.keyboard.press("Enter");
  const logoutButton = page.locator("button", { hasText: "Logout" });
  await expect(logoutButton).toHaveCount(1);
  const usernameMention = page.locator("h2", { hasText: username });
  await expect(usernameMention).toHaveCount(1);
}

export async function createPost(page: Page, title: string, contents: string) {
  page.goto("/1");
  const postTitleInput = page.locator(`input[name="title"]`);
  const postContentsInput = page.locator(`textarea[name="contents"]`);
  const postSubmitButton = page.locator(`button[type="submit"]`);
  await postTitleInput.fill(title);
  await postContentsInput.fill(contents);
  await postSubmitButton.click();
  const post = page.locator("h3", { hasText: title });
  await expect(post).toHaveCount(1);
  return post;
}