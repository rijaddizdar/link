import { expect, test } from '@playwright/test';
import { E2E_SITE_PASSWORD } from './site-password';

/**
 * The site gate: one shared password in front of everything, remembered per
 * device, and nothing of the app visible without it.
 */
test('nothing on the site is reachable without the password', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const path of ['/', '/login', '/calendar', '/tasks', '/settings', '/link']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/unlock/);
    // No app content and no app chrome: not even the sign-in form.
    await expect(page.getByRole('heading', { name: 'Two people, one list' })).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  }

  await context.close();
});

test('a wrong password is turned away', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Enter' }).click();

  await expect(page.getByTestId('form-error')).toContainText("That's not it.");
  await expect(page).toHaveURL(/\/unlock/);

  // And still locked afterwards.
  await page.goto('/login');
  await expect(page).toHaveURL(/\/unlock/);

  await context.close();
});

test('the right password lets you in and is remembered on this device', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/');
  await page.getByLabel('Password').fill(E2E_SITE_PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();

  // Through the gate and onto the site — signed out, so that means sign-in.
  await expect(page.getByRole('heading', { name: 'Two people, one list' })).toBeVisible();

  // Remembered: a reload, and a brand-new tab, both go straight in.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Two people, one list' })).toBeVisible();
  const secondTab = await context.newPage();
  await secondTab.goto('/login');
  await expect(secondTab.getByRole('heading', { name: 'Two people, one list' })).toBeVisible();

  // What the browser keeps is a token, not the password, and scripts cannot read it.
  const cookie = (await context.cookies()).find((c) => c.name === 'link_gate');
  expect(cookie).toBeDefined();
  expect(cookie!.value).not.toContain(E2E_SITE_PASSWORD);
  expect(cookie!.value).toMatch(/^[0-9a-f]{64}$/);
  expect(cookie!.httpOnly).toBe(true);
  // Remembered for as long as a browser allows: about 400 days.
  const days = (cookie!.expires * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(390);

  await context.close();
});

test('it sends you on to the page you were trying to reach', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/login?next=/calendar');
  await expect(page).toHaveURL(/\/unlock\?next=/);
  await page.getByLabel('Password').fill(E2E_SITE_PASSWORD);
  await page.getByRole('button', { name: 'Enter' }).click();
  // Back on exactly the URL that was asked for, query and all. Landing on the
  // home page instead would also end up at /login, but with next=/ — so the
  // query string is what proves the redirect went to the right place.
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)calendar$/);

  await context.close();
});

test('another device still has to enter it', async ({ browser }) => {
  const mine = await browser.newContext();
  const minePage = await mine.newPage();
  await minePage.goto('/');
  await minePage.getByLabel('Password').fill(E2E_SITE_PASSWORD);
  await minePage.getByRole('button', { name: 'Enter' }).click();
  await expect(minePage.getByRole('heading', { name: 'Two people, one list' })).toBeVisible();

  // A separate browser shares nothing with the first one.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto('/');
  await expect(otherPage).toHaveURL(/\/unlock/);

  await mine.close();
  await other.close();
});

test('a forged gate cookie does not get you in', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([
    { name: 'link_gate', value: 'a'.repeat(64), url: 'http://127.0.0.1:3100' },
  ]);
  const page = await context.newPage();
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/unlock/);
  await context.close();
});
