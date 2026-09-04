import type { Metadata } from 'next';

import { PageTransitionProvider } from '@/components/layout/page-transition-provider';
import { SiteHeader } from '@/components/layout/site-header';

import './globals.css';

export const metadata: Metadata = {
  title: 'OFFMAP — Real events & spots in New York City',
  description: 'Music, food, museums, wellness and more — real events and permanent spots around NYC, pulled live.',
};

// Sets data-theme before paint so a stored light-mode preference (see
// PullChain) doesn't flash dark on load.
const THEME_INIT_SCRIPT = `
  (function () {
    try {
      var stored = localStorage.getItem('offmap-theme');
      if (stored === 'light') document.documentElement.dataset.theme = 'light';
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is scoped to this element only (React doesn't
    // propagate it to children) — it's needed because THEME_INIT_SCRIPT sets
    // data-theme on <html> before hydration, so the client's <html> attributes
    // intentionally differ from the server-rendered markup.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <PageTransitionProvider>
          <SiteHeader />
          {children}
        </PageTransitionProvider>
      </body>
    </html>
  );
}
