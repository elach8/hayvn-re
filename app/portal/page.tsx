// app/portal/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type JourneyClient = {
  id: string;
  name: string | null;
  client_type: string | null;
  stage: string | null;
  preferred_locations: string | null;
  budget_min: number | null;
  budget_max: number | null;
};

type Journey = {
  id: string; // client id
  role: string | null;
  client: JourneyClient;
};

type PortalState = {
  loading: boolean;
  error: string | null;
  portalUser: PortalUser | null;
  journeys: Journey[];
};

const PORTAL_LINKS = [
  { href: '/portal', label: 'Dashboard' },
  { href: '/portal/properties', label: 'Properties' },
  { href: '/portal/profile', label: 'Profile' },
  { href: '/portal/tours', label: 'Tours' },
  { href: '/portal/offers', label: 'Offers' },
  { href: '/portal/messages', label: 'Messages' },
];

export default function PortalDashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<PortalState>({
    loading: true,
    error: null,
    portalUser: null,
    journeys: [],
  });

  useEffect(() => {
    const run = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        // 1) Check auth
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session) {
          setState({
            loading: false,
            error: 'Please sign in to view your journeys.',
            portalUser: null,
            journeys: [],
          });
          return;
        }

        const user = session.user;
        const email = (user.email || '').toLowerCase().trim();

        if (!email) {
          setState({
            loading: false,
            error:
              'We could not determine your email address. Please contact your agent.',
            portalUser: null,
            journeys: [],
          });
          return;
        }

        const portalUser: PortalUser = {
          id: user.id,
          full_name:
            (user.user_metadata as any)?.full_name ||
            (user.user_metadata as any)?.name ||
            null,
          email: (user.email ?? null) as string | null,
        };

        // 2) Simple mapping: any client whose email matches your login email
        const { data: clientRows, error: clientError } = await supabase
          .from('clients')
          .select(
            `
            id,
            name,
            client_type,
            stage,
            preferred_locations,
            budget_min,
            budget_max,
            email
          `
          )
          .eq('email', email)
          .order('created_at', { ascending: true });

        if (clientError) throw clientError;

        const journeys: Journey[] = (clientRows || []).map((row: any) => ({
          id: row.id as string,
          role: 'primary',
          client: {
            id: row.id as string,
            name: row.name as string | null,
            client_type: row.client_type as string | null,
            stage: row.stage as string | null,
            preferred_locations: row.preferred_locations as string | null,
            budget_min: row.budget_min as number | null,
            budget_max: row.budget_max as number | null,
          },
        }));

        setState({
          loading: false,
          error: null,
          portalUser,
          journeys,
        });
      } catch (err: any) {
        console.error('Portal dashboard error:', err);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message ?? 'Failed to load your journeys.',
        }));
      }
    };

    run();
  }, []);

  const { loading, error, portalUser, journeys } = state;

  const formatMoney = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const formatBudget = (min: number | null, max: number | null) => {
    if (min == null && max == null) return 'Not specified';
    if (min != null && max != null) {
      return `${formatMoney(min)} – ${formatMoney(max)}`;
    }
    if (min != null) return `${formatMoney(min)}+`;
    return `Up to ${formatMoney(max)}`;
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h1 className="text-sm sm:text-base font-semibold tracking-tight text-slate-50">
              Hayvn Client Portal
            </h1>
            <p className="text-xs text-slate-400">
              View your journeys with your agent in one place.
            </p>
          </div>
          <div className="text-right">
            {portalUser ? (
              <>
                <p className="text-[11px] text-slate-400">Signed in as</p>
                <p className="text-xs font-medium text-slate-100">
                  {portalUser.full_name || portalUser.email}
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/portal/sign-in')}
                className="rounded-lg border border-white/20 bg-black/60 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        {/* Portal nav with all known sections */}
        <div className="border-t border-white/10 bg-black/40">
          <div className="mx-auto max-w-5xl px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
            {PORTAL_LINKS.map((link, idx) => {
              const isActive = idx === 0; // dashboard on this page
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    'rounded-full px-3 py-1 border text-[11px] transition-colors',
                    isActive
                      ? 'bg-[#EBD27A] text-black border-[#EBD27A] shadow-sm'
                      : 'bg-black/40 text-slate-200 border-white/15 hover:bg-white/10',
                  ].join(' ')}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        {loading && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-200">
            Loading your journeys…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
            {error.toLowerCase().includes('sign in') && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => router.push('/portal/sign-in')}
                  className="rounded-lg bg-red-500 text-white text-xs font-medium px-3 py-1.5 hover:bg-red-400"
                >
                  Go to sign in
                </button>
              </div>
            )}
          </div>
        )}

        {!loading && !error && journeys.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-slate-200">
            <p className="mb-1">
              You don&apos;t have any journeys yet.
            </p>
            <p className="text-xs text-slate-400">
              Ask your agent to create a client record in Hayvn-RE using this
              email address. Once they do, you&apos;ll see it here along with
              properties, tours, and offers.
            </p>
          </div>
        )}

        {!loading && !error && journeys.length > 0 && (
          <div className="space-y-3">
            {journeys.map((j) => {
              const c = j.client;
              const label =
                c.client_type === 'buyer'
                  ? 'Buying journey'
                  : c.client_type === 'seller'
                  ? 'Selling journey'
                  : 'Journey';

              return (
                <article
                  key={j.id}
                  className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm flex flex-col gap-2"
                >
                  <header className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-50">
                        {c.name || 'Journey'}
                      </h2>
                      <p className="text-xs text-slate-400">
                        {label}
                        {j.role ? ` • ${j.role}` : ''}{' '}
                        {c.stage ? ` • ${c.stage}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-slate-400 max-w-[220px]">
                      <div className="uppercase tracking-wide text-[10px]">
                        Preferred areas
                      </div>
                      <div className="text-slate-100 truncate">
                        {c.preferred_locations || 'Not specified'}
                      </div>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mt-1">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                        Budget
                      </div>
                      <div className="text-slate-100">
                        {formatBudget(c.budget_min, c.budget_max)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                        Status
                      </div>
                      <div className="text-slate-100">
                        {c.stage || 'Active'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                        Role
                      </div>
                      <div className="text-slate-100">
                        {j.role || 'Primary'}
                      </div>
                    </div>
                  </div>

                  <footer className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                    <p className="text-slate-400 max-w-md">
                      Properties you&apos;re viewing, tours, and offers will
                      appear in your portal sections as your agent adds them.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <Link
                        href="/portal/properties"
                        className="rounded-lg border border-white/20 bg-black/50 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-white/10"
                      >
                        View properties
                      </Link>
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
