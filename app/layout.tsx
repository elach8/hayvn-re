'use client';

import './globals.css'; // keep whatever you currently use for globals
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav } from '@/app/components/TopNav'; // ⬅️ path matches the code you pasted

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith('/portal');

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {/* Show Hayvn-RE TopNav everywhere EXCEPT the client portal */}
        {!isPortal && <TopNav />}

        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}

