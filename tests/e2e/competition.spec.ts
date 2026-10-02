import { expect, test } from '@playwright/test';
import {
  agreeTask,
  backdateCouple,
  coupleDates,
  createAccount,
  readCouple,
  seedCompletion,
  uniqueEmail,
} from './helpers';

/**
 * The daily competition, end to end: a day closes, it is settled once, the
 * winner screen explains it, and the calendar shows it.
 *
 * The closed day is seeded through the service_role key, because waiting for a
 * real day to end is not a test.
 */
test('a closed day is settled, and shows up as a win on the calendar', async ({ browser }) => {
  const alexContext = await browser.newContext();
  const samContext = await browser.newContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();

  await createAccount(alex, 'Alex', uniqueEmail('alex-comp'));
  await createAccount(sam, 'Sam', uniqueEmail('sam-comp'));

  await alex.getByLabel('The time your day closes').fill('21:00');
  await alex.getByRole('button', { name: 'Start our list' }).click();
  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Two agreed tasks.
  await agreeTask(alex, sam, 'Morning walk', 'Sam');
  await agreeTask(alex, sam, 'Read 10 pages', 'Sam');

  // Give the couple a past, and put a finished day in it: one of them 2, the
  // other 1. The seeding has to happen before any screen loads, because the
  // first load settles the day and a settled day is never recomputed.
  const { coupleId, userIds, taskIds } = await readCouple();
  await backdateCouple(coupleId, 10);
  const { yesterday } = await coupleDates(coupleId);

  const [a, b] = userIds;
  await seedCompletion(coupleId, taskIds[0], a, yesterday);
  await seedCompletion(coupleId, taskIds[1], a, yesterday);
  await seedCompletion(coupleId, taskIds[0], b, yesterday);

  // Loading the app settles the day that closed while nobody was looking.
  await alex.goto('/');
  await expect(alex.getByTestId('last-day')).toBeVisible();

  await alex.goto(`/day/${yesterday}`);
  const headline = await alex.getByTestId('day-headline').innerText();
  // Whoever `a` turned out to be took the day two to one; it is never a tie.
  expect(headline).toMatch(/^(YOU WON|ALEX WON|SAM WON)$/);
  expect(headline).not.toBe("IT'S A TIE");

  const scores = await alex.getByTestId('day-scores').innerText();
  expect(scores).toContain('2');
  expect(scores).toContain('1');

  // Both partners see the same settled result — it is the couple's day, not a view.
  await sam.goto(`/day/${yesterday}`);
  const samScores = await sam.getByTestId('day-scores').innerText();
  expect(samScores).toContain('2');
  expect(samScores).toContain('1');

  // And it is on the calendar, with somebody ahead for the month.
  await alex.goto('/calendar');
  await expect(alex.getByTestId('month-grid')).toBeVisible();
  await expect(alex.getByTestId('month-leader')).toContainText(/ahead this month|level this month/);
  await expect(alex.getByRole('link', { name: new RegExp(`${yesterday}:`) })).toBeVisible();

  await alexContext.close();
  await samContext.close();
});

/** A day they both cleared is a tie — and a streak day, not a loss for either. */
test('a day you both clear is a tie and counts towards the shared streak', async ({ browser }) => {
  const alexContext = await browser.newContext();
  const samContext = await browser.newContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();

  await createAccount(alex, 'Alex', uniqueEmail('alex-tie'));
  await createAccount(sam, 'Sam', uniqueEmail('sam-tie'));

  await alex.getByRole('button', { name: 'Start our list' }).click();
  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  await agreeTask(alex, sam, 'Morning walk', 'Sam');

  const { coupleId, userIds, taskIds } = await readCouple();
  await backdateCouple(coupleId, 10);
  const { yesterday } = await coupleDates(coupleId);

  // Both of them cleared the one scheduled task.
  for (const userId of userIds) {
    await seedCompletion(coupleId, taskIds[0], userId, yesterday);
  }

  await alex.goto(`/day/${yesterday}`);
  await expect(alex.getByTestId('day-headline')).toHaveText("IT'S A TIE");
  await expect(alex.getByText('Nobody wins, so you both do.')).toBeVisible();

  // A cleared day is a streak day, and the streak is shown on Today.
  await alex.goto('/');
  await expect(alex.getByTestId('streak')).toContainText('1');

  await alexContext.close();
  await samContext.close();
});

/**
 * Logs are trusted: asking about one never removes it. Only the partner who
 * logged it can clear it.
 */
test('a challenge asks about a log without removing it', async ({ browser }) => {
  const alexContext = await browser.newContext();
  const samContext = await browser.newContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();

  await createAccount(alex, 'Alex', uniqueEmail('alex-chal'));
  await createAccount(sam, 'Sam', uniqueEmail('sam-chal'));

  await alex.getByRole('button', { name: 'Start our list' }).click();
  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  await agreeTask(alex, sam, 'Ran 10k', 'Sam');

  // Sam logs it; Alex is sceptical.
  await sam.goto('/');
  await sam.getByRole('button', { name: /Mark Ran 10k done/ }).click();
  await expect(sam.locator('.l-box-mine')).toHaveClass(/l-box-done/);

  await alex.goto('/');
  await expect(alex.locator('.l-box-theirs')).toHaveClass(/l-box-done/);
  await alex.getByRole('button', { name: /Ask Sam about Ran 10k/ }).click();
  await alex.getByPlaceholder('Really, all eight?').fill('A whole 10k?');
  await alex.getByRole('button', { name: 'Ask', exact: true }).click();

  // The log is untouched — asking is a question, not a veto.
  await expect(alex.getByTestId('challenge')).toBeVisible();
  await expect(alex.locator('.l-box-theirs')).toHaveClass(/l-box-done/);

  // Sam sees the question and stands by the log; it still counts.
  await sam.goto('/');
  await expect(sam.getByTestId('challenge')).toContainText('Alex asked about this');
  await sam.getByRole('button', { name: 'I did it' }).click();
  await expect(sam.locator('.l-box-mine')).toHaveClass(/l-box-done/);

  await alexContext.close();
  await samContext.close();
});
