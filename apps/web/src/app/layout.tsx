import type { Metadata } from 'next';

import { PageTransitionProvider } from '@/components/layout/page-transition-provider';
import { SiteHeader } from '@/components/layout/site-header';

import './globals.css';

export const metadata: Metadata = {
  title: 'OFFMAP — Real events & spots in New York City',
  description: 'Music, food, museums, wellness and more — real events and permanent spots around NYC, pulled live.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PageTransitionProvider>
          <SiteHeader />
          {children}
        </PageTransitionProvider>
      </body>
    </html>
  );
}
