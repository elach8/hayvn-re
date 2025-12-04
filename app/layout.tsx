'use client';

import './globals.css';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav } from '@/app/components/TopNav';

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith('/portal');

  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-[#050B13] text-slate-100 antialiased">
        {/* Full-page navy gradient background */}
        <div className="min-h-screen bg-gradient-to-b from-[#020617] via-[#050B13] to-[#0A1A2F]">
          
          {/* Top Nav — hidden inside portal */}
          {!isPortal && (
            <div className="max-w-6xl mx-auto px-4 py-3">
              <TopNav />
            </div>
          )}

          {/* Page content container */}
          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
            {children}
          </main>

        </div>
      </body>
    </html>
  );
}


