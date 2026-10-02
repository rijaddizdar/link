'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/lib/actions';
import { SubmitButton } from './SubmitButton';

/**
 * The app frame: a top bar, and the navigation that is a bottom tab bar on a
 * phone and a left sidebar on a laptop. Phone and desktop share one component
 * set — the desktop is the same screens with room around them.
 */
export function Nav({
  signedIn,
  linked,
  waitingOnMe,
  children,
}: {
  signedIn: boolean;
  linked: boolean;
  waitingOnMe: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = linked
    ? [
        { href: '/', label: 'Today', icon: '⌂' },
        { href: '/calendar', label: 'Calendar', icon: '▦' },
        { href: '/tasks', label: 'Tasks', icon: '☰' },
        { href: '/proposals', label: 'Approvals', icon: '✓', badge: waitingOnMe },
        { href: '/settings', label: 'Settings', icon: '⚙' },
        // 'Us' is in the design on every screen but its contents are still an
        // open captain decision, so it is a placeholder until that is settled.
        { href: '#', label: 'Us', icon: '♡', placeholder: true },
      ]
    : [];

  return (
    <div className="l-app">
      <header className="l-topbar">
        <Link href="/" className="l-wordmark">
          <span className="l-wordmark-mark" aria-hidden="true">
            ♥
          </span>
          Link
        </Link>
        {signedIn && (
          <form action={signOut}>
            <SubmitButton className="l-btn l-btn-quiet l-btn-small">Sign out</SubmitButton>
          </form>
        )}
      </header>

      {tabs.length > 0 && (
        <nav className="l-tabs" aria-label="Main">
          {tabs.map((tab) =>
            tab.placeholder ? (
              <span key={tab.label} className="l-tab l-tab-disabled" aria-disabled="true">
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </span>
            ) : (
              <Link
                key={tab.href}
                href={tab.href}
                className="l-tab"
                aria-current={pathname === tab.href ? 'page' : undefined}
              >
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
                {tab.badge ? (
                  <span className="l-tab-dot" aria-label={`${tab.badge} waiting`}>
                    {tab.badge}
                  </span>
                ) : null}
              </Link>
            ),
          )}
        </nav>
      )}

      <main className={tabs.length > 0 ? 'l-main l-main-tabbed' : 'l-main'}>{children}</main>
    </div>
  );
}
