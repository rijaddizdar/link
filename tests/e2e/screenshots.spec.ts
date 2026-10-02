import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  backdateCouple,
  coupleDates,
  createAccount,
  readCouple,
  seedCompletion,
  uniqueEmail,
} from './helpers';

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
    // The phone tab bar is fixed to the viewport, which in a full-page capture
    // renders it floating across the middle of the image. Pinning it to the end
    // of the document for the shot shows the page as it actually reads.
    await page.addStyleTag({
      content: '.l-tabs { position: static !important; }',
    });
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

  // --- the competition needs a past, so give the couple one ----------------
  // Seeded directly, because waiting a fortnight for the calendar to fill in is
  // not a screenshot script. Nothing is settled until a screen loads after this.
  const { coupleId, userIds, taskIds } = await readCouple();
  await backdateCouple(coupleId, 30);
  const { active } = await coupleDates(coupleId);

  const [first, second] = userIds;
  const dayBefore = (n: number) => {
    const d = new Date(`${active}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  // A fortnight of plausible days: some theirs, some yours, some shared, one missed.
  // Each entry is how many of the four tasks each of them finished.
  const history: Array<[number, number]> = [
    [4, 4], [4, 4], [4, 3], [2, 4], [3, 1], [1, 3], [4, 4], [0, 0],
    [2, 3], [4, 2], [3, 3], [4, 4], [1, 2], [3, 4], [4, 1], [2, 2],
  ];

  for (let i = 0; i < history.length; i += 1) {
    const date = dayBefore(i + 1);
    const [mine, theirs] = history[i];
    for (let t = 0; t < mine; t += 1) {
      await seedCompletion(coupleId, taskIds[t], first, date, 99);
    }
    for (let t = 0; t < theirs; t += 1) {
      await seedCompletion(coupleId, taskIds[t], second, date, 99);
    }
  }

  // Loading a screen settles everything that closed, and then they have a record.
  // Shot on the month the history actually fills, rather than a current month
  // that may be two days old.
  await alex.goto('/calendar');
  await expect(alex.getByTestId('month-grid')).toBeVisible();
  await alex.goto(`/calendar?month=${dayBefore(8).slice(0, 7)}`);
  await expect(alex.getByTestId('month-grid')).toBeVisible();
  await shoot(alex, '09-calendar');

  await alex.goto(`/day/${dayBefore(1)}`);
  await expect(alex.getByTestId('day-headline')).toBeVisible();
  await shoot(alex, '08-day-result');

  await alexContext.close();
  await samContext.close();
});
