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

  // Linking screen, with a code on show and the agreed end-of-day time.
  await alex.getByLabel('The time your day closes').fill('21:00');
  await alex.getByRole('button', { name: 'Start our list' }).click();
  await expect(alex.getByTestId('invite-code')).toBeVisible();
  await shoot(alex, '02-link-up');

  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  // A small but varied list, so the screens show real shapes.
  const seed = [
    { title: 'Morning walk together', emoji: '🚶', color: 'coral', target: null },
    { title: 'Times we laughed', emoji: '😂', color: 'lilac', target: '5' },
    { title: 'Glasses of water', emoji: '💧', color: 'mint', target: '8' },
    { title: 'Read before bed', emoji: '📖', color: 'plum', target: null },
  ];

  for (const item of seed) {
    await alex.goto('/tasks/new');
    await alex.getByLabel('Name').fill(item.title);
    await alex.getByLabel('Emoji').fill(item.emoji);
    await alex.getByRole('radio', { name: item.color }).check();
    if (item.target) {
      await alex.getByText('Count it').click();
      await alex.getByLabel('Target for the day').fill(item.target);
    }
    await alex.getByRole('button', { name: 'Send to Sam' }).click();
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
  await sam.getByLabel('Name').fill('Cook dinner together');
  await sam.getByLabel('Emoji').fill('🍝');
  await sam.getByRole('radio', { name: 'berry' }).check();
  await sam.getByRole('button', { name: 'Send to Alex' }).click();

  // Log some progress on both sides so the side-by-side view has something to
  // compare: a mix of ticked, counted-and-reached, and counted-but-short.
  const bump = async (page: Page, task: string, times: number) => {
    const row = page.locator('[data-testid="task-row"]', { hasText: task });
    for (let i = 0; i < times; i += 1) {
      await row.getByRole('button', { name: new RegExp(`One more for ${task}`) }).click();
      await page.waitForTimeout(220);
    }
  };
  const tick = async (page: Page, task: string) => {
    const row = page.locator('[data-testid="task-row"]', { hasText: task });
    await row.getByRole('button', { name: new RegExp(`Mark ${task} done`) }).click();
    await page.waitForTimeout(220);
  };

  await sam.goto('/');
  await tick(sam, 'Morning walk together');
  await bump(sam, 'Times we laughed', 3);
  await bump(sam, 'Glasses of water', 8);

  await alex.goto('/');
  await tick(alex, 'Morning walk together');
  await tick(alex, 'Read before bed');
  await bump(alex, 'Times we laughed', 7);
  await bump(alex, 'Glasses of water', 6);

  await alex.goto('/');
  await expect(alex.locator('[data-testid="task-row"]').first()).toBeVisible();
  await shoot(alex, '04-today-side-by-side');

  await alex.goto('/tasks');
  await expect(alex.getByRole('heading', { name: 'Our tasks' })).toBeVisible();
  await shoot(alex, '05-our-tasks');

  await alex.goto('/tasks/new');
  await alex.getByLabel('Name').fill('Times we laughed');
  await alex.getByText('Count it').click();
  await alex.getByLabel('Target for the day').fill('5');
  await shoot(alex, '06-add-a-task');

  await alex.goto('/settings');
  await expect(alex.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await shoot(alex, '07-settings');

  await alexContext.close();
  await samContext.close();
});
