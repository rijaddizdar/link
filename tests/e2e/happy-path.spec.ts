import { expect, test } from '@playwright/test';
import { createAccount, signInAs, uniqueEmail } from './helpers';

/**
 * The whole v1 loop in one pass, against the local Supabase stack:
 * two people make accounts, link with a code, one proposes a task, the other
 * approves it, both log their own completion, and the day view shows the two
 * side by side.
 *
 * The two partners get their own browser contexts so each keeps its own session.
 */
test('two partners link, agree a task, and each log their own day', async ({ browser }) => {
  const alexEmail = uniqueEmail('alex');
  const samEmail = uniqueEmail('sam');

  const alexContext = await browser.newContext();
  const samContext = await browser.newContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();

  // --- accounts -------------------------------------------------------------
  await createAccount(alex, 'Alex', alexEmail);
  await createAccount(sam, 'Sam', samEmail);

  // --- linking with a code --------------------------------------------------
  // The picker defaults to this device's zone, and still reads it back after the
  // code is made — a hydration mismatch here used to reset it to the first zone
  // in the alphabet.
  await expect(alex.getByLabel('Your shared time zone')).toHaveValue('Europe/Berlin');
  await alex.getByRole('button', { name: 'Get our code' }).click();
  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(alex.getByLabel('Your shared time zone')).toHaveValue('Europe/Berlin');

  // Sam cannot use a code that is not theirs to use — their own, for instance.
  await sam.getByRole('button', { name: 'Get our code' }).click();
  const samOwnCode = (await sam.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(samOwnCode);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByTestId('form-error')).toContainText('your own code');

  // Alex's code works.
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(sam.getByText('Alex')).toBeVisible();
  // The zone chosen at linking becomes the couple's shared zone.
  await expect(sam.getByText('Europe/Berlin')).toBeVisible();

  // --- one partner proposes a task -----------------------------------------
  await alex.goto('/tasks/new');
  await alex.getByLabel('Title').fill('Drink water');
  await alex.getByLabel('Notes (optional)').fill('Eight glasses between us both.');
  await alex.getByRole('radio', { name: 'plum' }).check();
  await alex.getByLabel('Count up to a number').check();
  await alex.getByLabel('Done when we reach').fill('3');
  await alex.getByRole('button', { name: 'Send to my partner' }).click();

  await expect(alex.getByText('Sam can approve it now')).toBeVisible();

  // It is not on the shared list yet — that is the point of approval.
  await alex.goto('/');
  await expect(alex.getByText('Drink water')).toHaveCount(0);

  // And Alex cannot wave through their own proposal.
  await alex.goto('/proposals');
  await expect(alex.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(alex.getByRole('button', { name: 'Withdraw' })).toBeVisible();

  // --- the other partner approves ------------------------------------------
  await sam.goto('/proposals');
  await expect(sam.getByText('Alex wants to add')).toBeVisible();
  await sam.getByRole('button', { name: 'Approve' }).click();
  await expect(sam.getByText('Nothing needs your approval right now')).toBeVisible();

  // --- both log their own completion ---------------------------------------
  await sam.goto('/');
  const samCard = sam.locator('.task-card', { hasText: 'Drink water' });
  await expect(samCard).toBeVisible();

  const samMine = samCard.locator('.side-mine');
  await samMine.getByRole('button', { name: /One more for Drink water/ }).click();
  await expect(samMine).toContainText('1 / 3');
  await samMine.getByRole('button', { name: /One more for Drink water/ }).click();
  await expect(samMine).toContainText('2 / 3');

  await alex.goto('/');
  const alexCard = alex.locator('.task-card', { hasText: 'Drink water' });
  const alexMine = alexCard.locator('.side-mine');
  for (let i = 0; i < 3; i += 1) {
    await alexMine.getByRole('button', { name: /One more for Drink water/ }).click();
    await expect(alexMine).toContainText(`${i + 1} / 3`);
  }

  // --- the side-by-side view shows both ------------------------------------
  // Alex finished; Sam is on 2 of 3. Each sees their own column next to the other's.
  await alex.reload();
  const alexMineFinal = alexCard.locator('.side-mine');
  const alexTheirs = alexCard.locator('.side-theirs');
  await expect(alexMineFinal).toContainText('Alex (you)');
  await expect(alexMineFinal).toContainText('3 / 3');
  await expect(alexTheirs).toContainText('Sam');
  await expect(alexTheirs).toContainText('2 / 3');

  await sam.reload();
  const samMineFinal = samCard.locator('.side-mine');
  const samTheirs = samCard.locator('.side-theirs');
  await expect(samMineFinal).toContainText('Sam (you)');
  await expect(samMineFinal).toContainText('2 / 3');
  await expect(samTheirs).toContainText('Alex');
  await expect(samTheirs).toContainText('3 / 3');

  // The same two columns, mirrored — nobody has to switch screens to compare.
  await expect(alex.locator('.side-mine').first()).toContainText('1 of 1 done');
  await expect(alex.locator('.side-theirs').first()).toContainText('0 of 1 done');

  // --- a partner can see nothing of a couple they are not in ---------------
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await createAccount(outsider, 'Nosy', uniqueEmail('nosy'));
  await outsider.goto('/');
  // Not linked, so the app keeps them on the linking screen with no shared data.
  await expect(outsider.getByRole('heading', { name: 'Link up' })).toBeVisible();
  await expect(outsider.getByText('Drink water')).toHaveCount(0);

  await outsiderContext.close();
  await alexContext.close();
  await samContext.close();
});

/** An edit also has to be agreed before it changes the shared list. */
test('an edit takes effect only once the partner approves it', async ({ browser }) => {
  const alexEmail = uniqueEmail('alex-edit');
  const samEmail = uniqueEmail('sam-edit');

  const alexContext = await browser.newContext();
  const samContext = await browser.newContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();

  await createAccount(alex, 'Alex', alexEmail);
  await createAccount(sam, 'Sam', samEmail);

  await alex.getByRole('button', { name: 'Get our code' }).click();
  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Agree a task first.
  await alex.goto('/tasks/new');
  await alex.getByLabel('Title').fill('Morning walk');
  await alex.getByRole('button', { name: 'Send to my partner' }).click();
  await sam.goto('/proposals');
  await sam.getByRole('button', { name: 'Approve' }).click();

  // Sam proposes renaming it.
  await sam.goto('/tasks');
  await sam.getByRole('link', { name: 'Propose a change' }).click();
  await sam.getByLabel('Title').fill('Evening walk');
  await sam.getByRole('button', { name: 'Send the change' }).click();

  // Still the old name until Alex agrees.
  await sam.goto('/tasks');
  await expect(sam.getByText('Morning walk')).toBeVisible();
  await expect(sam.getByText('A change to this task is already waiting')).toBeVisible();

  await alex.goto('/proposals');
  await expect(alex.getByText('Sam wants to change')).toBeVisible();
  await alex.getByRole('button', { name: 'Approve' }).click();

  await alex.goto('/tasks');
  await expect(alex.getByText('Evening walk')).toBeVisible();
  await expect(alex.getByText('Morning walk')).toHaveCount(0);

  // Signing out and back in returns to the same couple and the same list.
  await alex.getByRole('button', { name: 'Sign out' }).click();
  await expect(alex.getByRole('heading', { name: 'Two people, one list' })).toBeVisible();
  await signInAs(alex, alexEmail);
  await expect(alex.getByRole('heading', { name: 'Today' })).toBeVisible();
  await alex.goto('/tasks');
  await expect(alex.getByText('Evening walk')).toBeVisible();

  await alexContext.close();
  await samContext.close();
});
