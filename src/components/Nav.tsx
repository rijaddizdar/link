'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/lib/actions';
import { SubmitButton } from './SubmitButton';

export function Nav({
  signedIn,
  linked,
  waitingOnMe,
}: {
  signedIn: boolean;
  linked: boolean;
  waitingOnMe: number;
}) {
  const pathname = usePathname();

  const links = linked
    ? [
        { href: '/', label: 'Today' },
        { href: '/tasks', label: 'Tasks' },
        { href: '/proposals', label: 'Approvals', badge: waitingOnMe },
        { href: '/settings', label: 'Settings' },
      ]
    : [];

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span aria-hidden="true">💞</span> Link
      </Link>

      <nav className="nav" aria-label="Main">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            aria-current={pathname === link.href ? 'page' : undefined}
          >
            {link.label}
            {link.badge ? <span className="nav-badge">{link.badge}</span> : null}
          </Link>
        ))}
        {signedIn && (
          <form action={signOut}>
            <SubmitButton className="btn btn-quiet btn-small">Sign out</SubmitButton>
          </form>
        )}
      </nav>
    </header>
  );
}
