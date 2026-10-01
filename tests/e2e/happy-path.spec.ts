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

  // Step 2 of linking: the couple agrees one shared end-of-day time.
  await alex.getByLabel('The time your day closes').fill('22:30');
  await alex.getByRole('button', { name: 'Start our list' }).click();

  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(alex.getByLabel('Your shared time zone')).toHaveValue('Europe/Berlin');

  // Sam cannot use a code that is not theirs to use — their own, for instance.
  await sam.getByRole('button', { name: 'Start our list' }).click();
  const samOwnCode = (await sam.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(samOwnCode);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByTestId('form-error')).toContainText('your own code');

  // Alex's code works.
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(sam.getByText('Alex')).toBeVisible();
  // The zone and the end-of-day time chosen at linking are now the couple's.
  await expect(sam.getByText('Europe/Berlin')).toBeVisible();
  await expect(sam.getByText('Day ends at')).toContainText('10:30 PM');

  // --- one partner proposes a task -----------------------------------------
  await alex.goto('/tasks/new');
  await alex.getByLabel('Name').fill('Drink water');
  await alex.getByLabel('Notes (optional)').fill('Eight glasses between us both.');
  await alex.getByRole('radio', { name: 'plum' }).check();
  // A counter always has a target: picking "Count it" reveals it and requires it.
  await alex.getByText('Count it').click();
  await alex.getByLabel('Target for the day').fill('3');
  await alex.getByRole('button', { name: 'Send to Sam' }).click();

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
  const samRow = sam.locator('[data-testid="task-row"]', { hasText: 'Drink water' });
  await expect(samRow).toBeVisible();

  const samMine = samRow.locator('.l-box-mine');
  for (let i = 0; i < 2; i += 1) {
    await samRow.getByRole('button', { name: /One more for Drink water/ }).click();
    await expect(samMine).toContainText(`${i + 1}`);
  }

  await alex.goto('/');
  const alexRow = alex.locator('[data-testid="task-row"]', { hasText: 'Drink water' });
  const alexMine = alexRow.locator('.l-box-mine');
  for (let i = 0; i < 3; i += 1) {
    await alexRow.getByRole('button', { name: /One more for Drink water/ }).click();
    await expect(alexMine).toContainText(`${i + 1}`);
  }

  // --- the side-by-side view shows both ------------------------------------
  // Alex finished; Sam is on 2 of 3. Each reads their own column (rose) next to
  // their partner's (violet), in the same two positions on both screens.
  await alex.reload();
  await expect(alexRow.locator('.l-box-mine')).toContainText('3');
  await expect(alexRow.locator('.l-box-mine')).toHaveClass(/l-box-done/);
  await expect(alexRow.locator('.l-box-theirs')).toContainText('2');
  await expect(alexRow.locator('.l-box-theirs')).not.toHaveClass(/l-box-done/);

  await sam.reload();
  await expect(samRow.locator('.l-box-mine')).toContainText('2');
  await expect(samRow.locator('.l-box-mine')).not.toHaveClass(/l-box-done/);
  await expect(samRow.locator('.l-box-theirs')).toContainText('3');
  await expect(samRow.locator('.l-box-theirs')).toHaveClass(/l-box-done/);

  // Rose is me, violet is my partner — and the two columns line up, which is
  // what makes the comparison readable without switching screens.
  await expect(alex.locator('.l-who-mine').first()).toContainText('You');
  await expect(alex.locator('.l-who-theirs').first()).toContainText('Sam');
  await expect(sam.locator('.l-who-theirs').first()).toContainText('Alex');

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

  await alex.getByRole('button', { name: 'Start our list' }).click();
  const code = (await alex.getByTestId('invite-code').innerText()).trim();
  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Agree a task first.
  await alex.goto('/tasks/new');
  await alex.getByLabel('Name').fill('Morning walk');
  await alex.getByRole('button', { name: 'Send to Sam' }).click();
  await sam.goto('/proposals');
  await sam.getByRole('button', { name: 'Approve' }).click();

  // Sam proposes renaming it.
  await sam.goto('/tasks');
  await sam.getByRole('link', { name: 'Change' }).click();
  await sam.getByLabel('Name').fill('Evening walk');
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

/**
 * The shared end-of-day time is agreed at linking, and moving it afterwards goes
 * through the same approval flow as a task change — it changes the day for both
 * partners at once, so neither can do it alone.
 */
test('the end-of-day time is agreed at linking and only moves when both agree', async ({
  browser,
}) => {
  const alexContext = await browser.newContext();
  const samContext = await browser.newContext();
  const alex = await alexContext.newPage();
  const sam = await samContext.newPage();

  await createAccount(alex, 'Alex', uniqueEmail('alex-day'));
  await createAccount(sam, 'Sam', uniqueEmail('sam-day'));

  await alex.getByLabel('The time your day closes').fill('20:00');
  await alex.getByRole('button', { name: 'Start our list' }).click();
  const code = (await alex.getByTestId('invite-code').innerText()).trim();

  await sam.getByLabel('Their code').fill(code);
  await sam.getByRole('button', { name: 'Link us up' }).click();
  await expect(sam.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Both see the time agreed during setup.
  await expect(sam.getByText('Day ends at')).toContainText('8:00 PM');
  await alex.goto('/');
  await expect(alex.getByText('Day ends at')).toContainText('8:00 PM');

  // Sam proposes moving it.
  await sam.goto('/settings');
  await sam.getByLabel('Propose a new time').fill('22:00');
  await sam.getByRole('button', { name: 'Send to Alex' }).click();
  await expect(sam.getByText('Alex can approve it now')).toBeVisible();

  // Nothing has moved yet, and Sam cannot wave it through.
  await sam.goto('/');
  await expect(sam.getByText('Day ends at')).toContainText('8:00 PM');
  await sam.goto('/proposals');
  await expect(sam.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  // Alex approves, and it moves for both.
  await alex.goto('/proposals');
  await expect(alex.getByText('wants to move when your day ends')).toBeVisible();
  await alex.getByRole('button', { name: 'Approve' }).click();

  await alex.goto('/');
  await expect(alex.getByText('Day ends at')).toContainText('10:00 PM');
  await sam.goto('/');
  await expect(sam.getByText('Day ends at')).toContainText('10:00 PM');

  await alexContext.close();
  await samContext.close();
});
