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

type PortalSummary = {
  savedHomes: number;
  favoriteHomes: number;
  upcomingTours: number;
  offers: number;
  unreadMessages: number;
};

type PortalState = {
  loading: boolean;
  error: string | null;
  portalUser: PortalUser | null;
  journeys: Journey[];
  summary: PortalSummary;
};

const PORTAL_LINKS = [
  { href: '/portal', label: 'Dashboard' },
  { href: '/portal/properties', label: 'Properties' },
  { href: '/portal/profile', label: 'Profile' },
  { href: '/portal/tours', label: 'Tours' },
  { href: '/portal/offers', label: 'Offers' },
  { href: '/portal/messages', label: 'Messages' },
];

const INITIAL_SUMMARY: PortalSummary = {
  savedHomes: 0,
  favoriteHomes: 0,
  upcomingTours: 0,
  offers: 0,
  unreadMessages: 0,
};

export default function PortalDashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<PortalState>({
    loading: true,
    error: null,
    portalUser: null,
    journeys: [],
    summary: INITIAL_SUMMARY,
  });

  useEffect(() => {
    const run = async () => {
      try {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: null,
        }));

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
            summary: INITIAL_SUMMARY,
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
            summary: INITIAL_SUMMARY,
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

        // 2) Map login email → client journeys
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
          `,
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

        const clientIds = journeys.map((j) => j.client.id);
        let summary: PortalSummary = { ...INITIAL_SUMMARY };

        // 3) Lightweight summary counts (best-effort, non-fatal if they fail)
        if (clientIds.length > 0) {
          try {
            const [
              cpAll,
              cpFav,
              toursRes,
              offersRes,
              messagesRes,
            ] = await Promise.all([
              // All client_properties for these journeys
              supabase
                .from('client_properties')
                .select('id', { count: 'exact', head: true })
                .in('client_id', clientIds),
              // Favorites
              supabase
                .from('client_properties')
                .select('id', { count: 'exact', head: true })
                .in('client_id', clientIds)
                .eq('is_favorite', true),
              // Upcoming tours (assuming tours table with client_id + scheduled_for)
              supabase
                .from('tours')
                .select('id', { count: 'exact', head: true })
                .in('client_id', clientIds)
                .gte('scheduled_for', new Date().toISOString()),
              // Offers
              supabase
                .from('offers')
                .select('id', { count: 'exact', head: true })
                .in('client_id', clientIds),
              // Unread portal messages (assuming portal_messages + is_read_client)
              supabase
                .from('portal_messages')
                .select('id', { count: 'exact', head: true })
                .in('client_id', clientIds)
                .eq('is_read_client', false),
            ]);

            summary = {
              savedHomes: cpAll.count ?? 0,
              favoriteHomes: cpFav.count ?? 0,
              upcomingTours: toursRes.count ?? 0,
              offers: offersRes.count ?? 0,
              unreadMessages: messagesRes.count ?? 0,
            };
          } catch (summaryErr) {
            console.error('Portal summary error (non-fatal):', summaryErr);
            // Keep summary at INITIAL_SUMMARY if anything fails
          }
        }

        setState({
          loading: false,
          error: null,
          portalUser,
          journeys,
          summary,
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

  const { loading, error, portalUser, journeys, summary } = state;

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
              A single place to follow your journeys, homes, tours, and offers.
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
        {/* Status + errors */}
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

        {/* Summary row (only show if we have a signed-in user and no fatal error) */}
        {!loading && !error && portalUser && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 flex flex-col justify-between">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                Journeys
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-semibold text-slate-50">
                    {journeys.length}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Buying / selling paths your agent has set up.
                  </div>
                </div>
                <Link
                  href="#journeys"
                  className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                >
                  View journeys
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 flex flex-col justify-between">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                Saved homes
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-semibold text-slate-50">
                    {summary.savedHomes}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Homes linked to your journeys.
                  </div>
                </div>
                <Link
                  href="/portal/properties"
                  className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                >
                  View properties
                </Link>
              </div>
              {summary.favoriteHomes > 0 && (
                <div className="mt-1 text-[11px] text-emerald-300">
                  {summary.favoriteHomes} marked as favorites
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 flex flex-col justify-between">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                Tours & offers
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-sm text-slate-100">
                    <span className="font-semibold">
                      {summary.upcomingTours}
                    </span>{' '}
                    upcoming tour
                    {summary.upcomingTours === 1 ? '' : 's'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {summary.offers} offer
                    {summary.offers === 1 ? '' : 's'} created so far.
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  <Link
                    href="/portal/tours"
                    className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                  >
                    View tours
                  </Link>
                  <Link
                    href="/portal/offers"
                    className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                  >
                    View offers
                  </Link>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 flex flex-col justify-between">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                Messages
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-semibold text-slate-50">
                    {summary.unreadMessages}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Unread messages from your agent.
                  </div>
                </div>
                <Link
                  href="/portal/messages"
                  className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                >
                  Open inbox
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Empty state if no journeys yet */}
        {!loading && !error && journeys.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-slate-200">
            <p className="mb-1">You don&apos;t have any journeys yet.</p>
            <p className="text-xs text-slate-400">
              Ask your agent to create a client record in Hayvn-RE using this
              email address. Once they do, you&apos;ll see it here along with
              properties, tours, and offers.
            </p>
          </div>
        )}

        {/* Journeys list */}
        {!loading && !error && journeys.length > 0 && (
          <section id="journeys" className="space-y-3">
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
          </section>
        )}
      </section>
    </main>
  );
}
