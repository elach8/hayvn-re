'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, usePathname } from 'next/navigation';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/search', label: 'Search' },
  { href: '/clients', label: 'Clients' },
  { href: '/properties', label: 'Properties' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/tours', label: 'Tours' },
  { href: '/offers', label: 'Offers' },
  { href: '/tools', label: 'Tools' },        // 👈 NEW
  { href: '/market-radar', label: 'Market Radar' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/settings', label: 'Settings' },
];

export function TopNav() {
  const [open, setOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Top bar, styled to match Modern Luxury theme */}
      <header>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-md">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 whitespace-nowrap"
            onClick={close}
          >
            <span className="text-sm sm:text-base font-semibold text-white">
              Hayvn-RE
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
              Internal CRM
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1.5 text-xs sm:text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'px-3 py-1.5 rounded-xl transition whitespace-nowrap',
                  isActive(link.href)
                    ? 'bg-white/20 text-white border border-white/30 shadow-sm'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white border border-transparent',
                ].join(' ')}
              >
                {link.label}
              </Link>
            ))}

            {/* Logout button */}
            <button
              onClick={logout}
              className="ml-1 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-red-300 hover:text-red-200 hover:bg-red-500/10 border border-red-500/30"
            >
              Logout
            </button>
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-2.5 py-1.5 text-slate-100"
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="sr-only">Toggle navigation</span>
            <div className="space-y-1">
              <span className="block h-[2px] w-5 bg-slate-100" />
              <span className="block h-[2px] w-5 bg-slate-100" />
              <span className="block h-[2px] w-5 bg-slate-100" />
            </div>
          </button>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        >
          <div
            className="ml-auto h-full w-64 bg-[#020617] border-l border-white/10 shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="font-semibold text-sm text-slate-100">
                Navigation
              </span>
              <button
                type="button"
                className="text-slate-400 text-xs"
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
                      className={[
                        'block px-4 py-2.5 transition',
                        isActive(link.href)
                          ? 'bg-white/10 text-white'
                          : 'text-slate-200 hover:bg-white/5 hover:text-white',
                      ].join(' ')}
                      onClick={close}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}

                {/* Mobile logout */}
                <li className="mt-2 border-t border-white/10">
                  <button
                    onClick={() => {
                      close();
                      logout();
                    }}
                    className="block w-full text-left px-4 py-2.5 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200"
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

