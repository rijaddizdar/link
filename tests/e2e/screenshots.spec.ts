import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createAccount, uniqueEmail } from './helpers';

/**
 * Captures the main screens at desktop and phone width for the PR.
 * Opt in, so it does not slow the normal suite down:
 *
 *   SCREENSHOTS=1 npx playwright test tests/e2e/screenshots.spec.ts
 */
const ENABLED = process.env.SCREENSHOTS === '1';
const OUT = 'docs/screenshots';

const WIDTHS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

async function shoot(page: Page, name: string): Promise<void> {
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${size.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('capture the main screens', async ({ browser }) => {
  test.skip(!ENABLED, 'set SCREENSHOTS=1 to capture');
  test.setTimeout(240_000);
  await mkdir(OUT, { recursive: true });

  const alexContext = await browser.newContext();
  const samContext = await browser.newContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();

  // Sign-in screen, before any account exists in this context.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto('/login');
  await shoot(freshPage, '01-sign-in');
  await fresh.close();

  await createAccount(alex, 'Alex', uniqueEmail('shot-alex'));
  await createAccount(sam, 'Sam', uniqueEmail('shot-sam'));

  // Linking screen, with a code on show.
  await alex.getByRole('button', { name: 'Get our code' }).click();
  await expect(alex.getByTestId('invite-code')).toBeVisible();
  await shoot(alex, '02-link-up');

  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  // A small but varied list, so the screens show real shapes.
  const seed = [
    { title: 'Drink water', emoji: '💧', color: 'lilac', target: '8' },
    { title: 'Morning walk together', emoji: '🚶', color: 'coral', target: null },
    { title: 'Read before bed', emoji: '📖', color: 'plum', target: '20' },
  ];

  for (const item of seed) {
    await alex.goto('/tasks/new');
    await alex.getByLabel('Title').fill(item.title);
    await alex.getByLabel('Emoji').fill(item.emoji);
    await alex.getByRole('radio', { name: item.color }).check();
    if (item.target) {
      await alex.getByLabel('Count up to a number').check();
      await alex.getByLabel('Done when we reach').fill(item.target);
    }
    await alex.getByRole('button', { name: 'Send to my partner' }).click();
    await expect(alex.getByText('can approve it now')).toBeVisible();
  }

  // The approvals screen, with real proposals waiting on Sam.
  await sam.goto('/proposals');
  await expect(sam.getByText('Alex wants to add').first()).toBeVisible();
  await shoot(sam, '03-approvals');

  // Approve them all.
  for (let i = 0; i < seed.length; i += 1) {
    await sam.getByRole('button', { name: 'Approve' }).first().click();
    await sam.waitForTimeout(400);
  }

  // One more proposal left pending, so the task list shows the locked state.
  await sam.goto('/tasks/new');
  await sam.getByLabel('Title').fill('Stretch for ten minutes');
  await sam.getByLabel('Emoji').fill('🧘');
  await sam.getByRole('radio', { name: 'mint' }).check();
  await sam.getByRole('button', { name: 'Send to my partner' }).click();

  // Log some progress on both sides so the side-by-side view has something to compare.
  await sam.goto('/');
  const samWater = sam.locator('.task-card', { hasText: 'Drink water' }).locator('.side-mine');
  for (let i = 0; i < 3; i += 1) {
    await samWater.getByRole('button', { name: /One more/ }).click();
    await sam.waitForTimeout(250);
  }
  const samWalk = sam
    .locator('.task-card', { hasText: 'Morning walk together' })
    .locator('.side-mine');
  await samWalk.getByRole('button', { name: 'Mark done' }).click();

  await alex.goto('/');
  const alexWater = alex.locator('.task-card', { hasText: 'Drink water' }).locator('.side-mine');
  for (let i = 0; i < 6; i += 1) {
    await alexWater.getByRole('button', { name: /One more/ }).click();
    await alex.waitForTimeout(250);
  }
  const alexWalk = alex
    .locator('.task-card', { hasText: 'Morning walk together' })
    .locator('.side-mine');
  await alexWalk.getByRole('button', { name: 'Mark done' }).click();
  const alexRead = alex.locator('.task-card', { hasText: 'Read before bed' }).locator('.side-mine');
  for (let i = 0; i < 20; i += 1) {
    await alexRead.getByRole('button', { name: /One more/ }).click();
  }

  await alex.goto('/');
  await expect(alex.locator('.task-card').first()).toBeVisible();
  await shoot(alex, '04-today-side-by-side');

  await alex.goto('/tasks');
  await expect(alex.getByRole('heading', { name: 'Our tasks' })).toBeVisible();
  await shoot(alex, '05-our-tasks');

  await alex.goto('/tasks/new');
  await alex.getByLabel('Title').fill('Cook together on Sundays');
  await alex.getByRole('radio', { name: 'Chosen days' }).check();
  await alex.getByRole('checkbox', { name: 'Sun' }).check();
  await shoot(alex, '06-add-a-task');

  await alex.goto('/settings');
  await expect(alex.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await shoot(alex, '07-settings');

  await alexContext.close();
  await samContext.close();
});
