'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/search', label: 'Search' },
  { href: '/clients', label: 'Clients' },
  { href: '/properties', label: 'Properties' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/tours', label: 'Tours' },
  { href: '/offers', label: 'Offers' },
  { href: '/market-radar', label: 'Market Radar' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/settings', label: 'Settings' },   // 👈 new
];


export function TopNav() {
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const router = useRouter();

  // Check for session once on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setLoggedIn(!!data.session);
    };
    checkSession();

    // Listen for login/logout changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setLoggedIn(!!session);
      if (event === 'SIGNED_OUT') router.push('/sign-in');
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const close = () => setOpen(false);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/sign-in');
  };

  // Hide the entire nav when logged out
  if (!loggedIn) return null;

  return (
    <>
      {/* Top bar */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="font-semibold text-sm sm:text-base whitespace-nowrap"
            onClick={close}
          >
            Hayvn <span className="text-gray-500">Real Estate</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1 rounded-md hover:bg-gray-100 whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}

            {/* Logout button */}
            <button
              onClick={logout}
              className="px-3 py-1 rounded-md hover:bg-gray-100 text-red-600"
            >
              Logout
            </button>
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center rounded-md border border-gray-200 px-2 py-1 text-gray-700"
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="sr-only">Toggle navigation</span>
            <div className="space-y-0.5">
              <span className="block h-[2px] w-5 bg-gray-800" />
              <span className="block h-[2px] w-5 bg-gray-800" />
              <span className="block h-[2px] w-5 bg-gray-800" />
            </div>
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={close}
        >
          <div
            className="ml-auto h-full w-64 bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">Navigation</span>
              <button
                type="button"
                className="text-gray-500 text-sm"
                onClick={close}
              >
                Close
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto text-sm">
              <ul className="py-2">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block px-4 py-2 hover:bg-gray-100"
                      onClick={close}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}

                {/* Mobile logout */}
                <li>
                  <button
                    onClick={() => {
                      close();
                      logout();
                    }}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                  >
                    Logout
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
