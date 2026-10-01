'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
  title?: string;
  'aria-label'?: string;
};

/** A submit button that disables itself while its form is in flight. */
export function SubmitButton({
  children,
  className = 'btn',
  pendingLabel,
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} {...rest}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
