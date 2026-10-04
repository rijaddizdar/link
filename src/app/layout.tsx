import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/Nav';
import { getCoupleContext, getProposals, getSession, isLinked } from '@/lib/data';
import { partitionOpenProposals } from '@/lib/proposals';

// Self-hosted at build time, so there is no render-blocking request to Google
// and no flash of the fallback face. tokens.css reads these two variables.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Link',
  description: 'A shared daily list for two.',
  // Private: no search engine should list even the password page.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const context = session ? await getCoupleContext(session) : null;
  const linked = isLinked(context);

  // The tab badge counts only proposals the signed-in partner can act on.
  let waitingOnMe = 0;
  if (session && linked) {
    const proposals = await getProposals();
    waitingOnMe = partitionOpenProposals(proposals, session.userId).waitingOnMe.length;
  }

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <Nav signedIn={session !== null} linked={linked} waitingOnMe={waitingOnMe}>
          {children}
        </Nav>
      </body>
    </html>
  );
}
