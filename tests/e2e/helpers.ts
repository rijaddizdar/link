import { expect, type Page } from '@playwright/test';

/** A fresh email per run, so repeated runs do not collide in the local auth table. */
export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.test`;
}

export const PASSWORD = 'link-test-password';

export async function createAccount(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).last().click();
  // A brand new account has no partner, so it lands on the linking screen.
  await expect(page.getByRole('heading', { name: 'Link up' })).toBeVisible();
}

export async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
}
