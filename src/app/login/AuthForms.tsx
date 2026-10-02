'use client';

import { useActionState, useState } from 'react';
import { signIn, signUp, type ActionResult } from '@/lib/actions';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';

export function AuthForms() {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [signUpState, signUpAction] = useActionState<ActionResult, FormData>(signUp, {
    error: null,
  });
  const [signInState, signInAction] = useActionState<ActionResult, FormData>(signIn, {
    error: null,
  });

  const isSignUp = mode === 'signup';

  return (
    <div className="l-panel l-stack">
      <div className="l-row">
        <button
          type="button"
          className={isSignUp ? 'l-btn l-btn-small' : 'l-btn l-btn-quiet l-btn-small'}
          onClick={() => setMode('signup')}
        >
          Create account
        </button>
        <button
          type="button"
          className={!isSignUp ? 'l-btn l-btn-small' : 'l-btn l-btn-quiet l-btn-small'}
          onClick={() => setMode('signin')}
        >
          Sign in
        </button>
      </div>

      {isSignUp ? (
        <form action={signUpAction} className="l-stack" key="signup">
          <FormError message={signUpState.error} />
          <div>
            <label htmlFor="display_name">Your name</label>
            <input id="display_name" name="display_name" type="text" placeholder="Alex" />
          </div>
          <div>
            <label htmlFor="su-email">Email</label>
            <input id="su-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="su-password">Password</label>
            <input
              id="su-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
        </form>
      ) : (
        <form action={signInAction} className="l-stack" key="signin">
          <FormError message={signInState.error} />
          <div>
            <label htmlFor="si-email">Email</label>
            <input id="si-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="si-password">Password</label>
            <input
              id="si-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
        </form>
      )}
    </div>
  );
}
