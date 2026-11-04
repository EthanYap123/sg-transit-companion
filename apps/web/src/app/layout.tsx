import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeSetting, ThemeToggle } from '@/components/ThemeControls';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init';
import './globals.css';

export const metadata: Metadata = {
  title: 'SG Transit Companion',
  description: 'Live Singapore bus arrivals, favourite stops and leave-now alerts.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a6b4c',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme before React hydrates, so that attribute is allowed to differ.
    <html lang="en-SG" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <header className="site-header">
          <div className="shell site-header-inner">
            <Link href="/" className="brand">
              SG Transit Companion
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="shell">{children}</main>
        <footer className="site-footer">
          <div className="shell">
            <ThemeSetting />
            <p>Bus data from LTA DataMall, under the Singapore Open Data Licence.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
