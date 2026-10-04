'use client';

import { useActionState } from 'react';
import { unlockAction, type UnlockResult } from './actions';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';

export function UnlockForm({ next }: { next: string }) {
  const [state, action] = useActionState<UnlockResult, FormData>(unlockAction, { error: null });

  return (
    <form action={action} className="l-panel l-stack">
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <div>
        <label htmlFor="site-password">Password</label>
        <input
          id="site-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
        />
      </div>
      <SubmitButton className="l-btn l-btn-block" pendingLabel="Checking…">
        Enter
      </SubmitButton>
    </form>
  );
}
