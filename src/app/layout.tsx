import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { getCoupleContext, getProposals, getSession, isLinked } from '@/lib/data';
import { partitionOpenProposals } from '@/lib/proposals';

export const metadata: Metadata = {
  title: 'Link',
  description: 'A shared daily list for two.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const context = session ? await getCoupleContext(session) : null;
  const linked = isLinked(context);

  // The nav badge counts only proposals the signed-in partner can act on.
  let waitingOnMe = 0;
  if (session && linked) {
    const proposals = await getProposals();
    waitingOnMe = partitionOpenProposals(proposals, session.userId).waitingOnMe.length;
  }

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav signedIn={session !== null} linked={linked} waitingOnMe={waitingOnMe} />
          <main className="stack">{children}</main>
        </div>
      </body>
    </html>
  );
}
