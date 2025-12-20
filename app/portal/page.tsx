// app/portal/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Client = {
  id: string;
  name: string | null;
  email: string | null;

  client_type: string | null;
  stage: string | null;

  preferred_locations: string | null;
  budget_min: number | null;
  budget_max: number | null;

  // criteria (agent parity – add more as you add fields)
  property_types: string[] | null;
  min_beds: number | null;
  min_baths: number | null;
  deal_style: string | null;

  notes: string | null;
};

type PortalSummary = {
  savedHomes: number;
  favoriteHomes: number;
  upcomingTours: number;
  offers: number;
  unreadMessages: number;
  pendingCriteriaChanges: number;
};

type PortalState = {
  loading: boolean;
  error: string | null;
  portalUser: PortalUser | null;
  client: Client | null;
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
  pendingCriteriaChanges: 0,
};

type CriteriaForm = {
  preferred_locations: string;
  budget_min: string;
  budget_max: string;
  property_types: string; // comma-separated for UX simplicity
  min_beds: string;
  min_baths: string;
  deal_style: string;
  notes: string;
};

function normalizeEmail(v: string | null | undefined) {
  return (v || '').toLowerCase().trim();
}

function parseNumOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseStringArray(v: string) {
  const items = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function arraysEqual(a: string[] | null, b: string[] | null) {
  const aa = (a || []).slice().map((x) => x.trim()).filter(Boolean);
  const bb = (b || []).slice().map((x) => x.trim()).filter(Boolean);
  if (aa.length !== bb.length) return false;
  // compare as sets (order-insensitive)
  const sa = new Set(aa.map((x) => x.toLowerCase()));
  const sb = new Set(bb.map((x) => x.toLowerCase()));
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

export default function PortalDashboardPage() {
  const router = useRouter();

  const [state, setState] = useState<PortalState>({
    loading: true,
    error: null,
    portalUser: null,
    client: null,
    summary: INITIAL_SUMMARY,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'success'; message: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const [form, setForm] = useState<CriteriaForm>({
    preferred_locations: '',
    budget_min: '',
    budget_max: '',
    property_types: '',
    min_beds: '',
    min_baths: '',
    deal_style: '',
    notes: '',
  });

  useEffect(() => {
    const run = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        setSaveState({ status: 'idle' });

        // 1) Auth
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session) {
          setState({
            loading: false,
            error: 'Please sign in to view your portal.',
            portalUser: null,
            client: null,
            summary: INITIAL_SUMMARY,
          });
          return;
        }

        const user = session.user;
        const email = normalizeEmail(user.email);

        if (!email) {
          setState({
            loading: false,
            error:
              'We could not determine your email address. Please contact your agent.',
            portalUser: null,
            client: null,
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

        // 2) Find the client row (current behavior: earliest created_at for this email)
        const { data: clientRow, error: clientError } = await supabase
          .from('clients')
          .select(
            `
            id,
            name,
            email,
            client_type,
            stage,
            preferred_locations,
            budget_min,
            budget_max,
            property_types,
            min_beds,
            min_baths,
            deal_style,
            notes
          `,
          )
          .eq('email', email)
          .order('created_at', { ascending: true })
          .limit(1)
          // @ts-expect-error supabase-js supports maybeSingle in v2; keep drop-in resilient
          .maybeSingle?.();

        // If maybeSingle doesn't exist in your version, fallback safely:
        let client: Client | null = null;

        if (typeof (supabase.from('clients') as any).maybeSingle !== 'function') {
          const { data: rows, error: clientError2 } = await supabase
            .from('clients')
            .select(
              `
              id,
              name,
              email,
              client_type,
              stage,
              preferred_locations,
              budget_min,
              budget_max,
              property_types,
              min_beds,
              min_baths,
              deal_style,
              notes
            `,
            )
            .eq('email', email)
            .order('created_at', { ascending: true })
            .limit(1);

          if (clientError2) throw clientError2;
          client = (rows?.[0] as any) ?? null;
        } else {
          if (clientError) throw clientError;
          client = (clientRow as any) ?? null;
        }

        // no client record yet
        if (!client) {
          setState({
            loading: false,
            error: null,
            portalUser,
            client: null,
            summary: INITIAL_SUMMARY,
          });
          return;
        }

        // Prime form (only if not editing)
        setForm({
          preferred_locations: client.preferred_locations || '',
          budget_min: client.budget_min != null ? String(client.budget_min) : '',
          budget_max: client.budget_max != null ? String(client.budget_max) : '',
          property_types: (client.property_types || []).join(', '),
          min_beds: client.min_beds != null ? String(client.min_beds) : '',
          min_baths: client.min_baths != null ? String(client.min_baths) : '',
          deal_style: client.deal_style || '',
          notes: client.notes || '',
        });

        // 3) Summary counts (best-effort)
        let summary: PortalSummary = { ...INITIAL_SUMMARY };
        try {
          const [cpAll, cpFav, toursRes, offersRes, messagesRes, pendingRes] =
            await Promise.all([
              supabase
                .from('client_properties')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', client.id),
              supabase
                .from('client_properties')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', client.id)
                .eq('is_favorite', true),
              supabase
                .from('tours')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', client.id)
                .gte('scheduled_for', new Date().toISOString()),
              supabase
                .from('offers')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', client.id),
              supabase
                .from('portal_messages')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', client.id)
                .eq('is_read_client', false),
              // Option B: pending criteria changes (non-fatal if table not present yet)
              supabase
                .from('client_criteria_changes')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', client.id)
                .eq('status', 'pending'),
            ]);

          summary = {
            savedHomes: cpAll.count ?? 0,
            favoriteHomes: cpFav.count ?? 0,
            upcomingTours: toursRes.count ?? 0,
            offers: offersRes.count ?? 0,
            unreadMessages: messagesRes.count ?? 0,
            pendingCriteriaChanges: pendingRes.count ?? 0,
          };
        } catch (summaryErr) {
          console.error('Portal summary error (non-fatal):', summaryErr);
        }

        setState({
          loading: false,
          error: null,
          portalUser,
          client,
          summary,
        });
      } catch (err: any) {
        console.error('Portal dashboard error:', err);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message ?? 'Failed to load your portal.',
        }));
      }
    };

    run();
  }, []);

  const { loading, error, portalUser, client, summary } = state;

  const formatMoney = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const formatBudget = (min: number | null, max: number | null) => {
    if (min == null && max == null) return 'Not specified';
    if (min != null && max != null) return `${formatMoney(min)} – ${formatMoney(max)}`;
    if (min != null) return `${formatMoney(min)}+`;
    return `Up to ${formatMoney(max)}`;
  };

  const criteriaLabel = useMemo(() => {
    if (!client) return 'Criteria';
    if (client.client_type === 'buyer') return 'Buyer criteria';
    if (client.client_type === 'seller') return 'Seller details';
    return 'Criteria';
  }, [client]);

  const canEditCriteria = useMemo(() => {
    // For now: allow edits if client is buyer or both.
    // If you want sellers to edit later, relax this.
    const t = client?.client_type;
    return t === 'buyer' || t === 'both' || t == null;
  }, [client]);

  async function submitCriteriaChangeRequest() {
    if (!client) return;
    setSaveState({ status: 'saving' });

    try {
      // Build proposed values from form
      const proposed = {
        preferred_locations: form.preferred_locations.trim() || null,
        budget_min: parseNumOrNull(form.budget_min),
        budget_max: parseNumOrNull(form.budget_max),
        property_types: parseStringArray(form.property_types),
        min_beds: parseNumOrNull(form.min_beds),
        min_baths: parseNumOrNull(form.min_baths),
        deal_style: form.deal_style.trim() || null,
        notes: form.notes.trim() || null,
      };

      // Compute diff (store only changed fields)
      const changes: Record<
        string,
        { from: any; to: any }
      > = {};

      const current = {
        preferred_locations: client.preferred_locations ?? null,
        budget_min: client.budget_min ?? null,
        budget_max: client.budget_max ?? null,
        property_types: client.property_types ?? null,
        min_beds: client.min_beds ?? null,
        min_baths: client.min_baths ?? null,
        deal_style: client.deal_style ?? null,
        notes: client.notes ?? null,
      };

      const keys = Object.keys(proposed) as (keyof typeof proposed)[];
      for (const k of keys) {
        if (k === 'property_types') {
          if (!arraysEqual(current.property_types, proposed.property_types)) {
            changes[k] = { from: current.property_types, to: proposed.property_types };
          }
          continue;
        }
        if ((current as any)[k] !== (proposed as any)[k]) {
          changes[k] = { from: (current as any)[k], to: (proposed as any)[k] };
        }
      }

      if (Object.keys(changes).length === 0) {
        setSaveState({ status: 'success', message: 'No changes to submit.' });
        setIsEditing(false);
        return;
      }

      // Insert change request (Option B)
      const { error: insertErr } = await supabase
        .from('client_criteria_changes')
        .insert({
          client_id: client.id,
          changed_by: 'client',
          status: 'pending',
          changes, // jsonb
        } as any);

      if (insertErr) throw insertErr;

      // Update UI: show proposed in-place (still pending) by updating local "client"
      setState((prev) => ({
        ...prev,
        client: prev.client
          ? ({
              ...prev.client,
              ...proposed,
            } as Client)
          : prev.client,
        summary: {
          ...prev.summary,
          pendingCriteriaChanges: (prev.summary.pendingCriteriaChanges ?? 0) + 1,
        },
      }));

      setSaveState({
        status: 'success',
        message:
          'Submitted to your agent for review. They’ll apply it to your search once approved.',
      });
      setIsEditing(false);
    } catch (err: any) {
      console.error('Criteria change submit error:', err);
      setSaveState({
        status: 'error',
        message:
          err?.message ??
          'Could not submit your changes. Please try again or contact your agent.',
      });
    }
  }

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
              Your criteria, saved homes, tours, offers, and messages.
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

        {/* Portal nav */}
        <div className="border-t border-white/10 bg-black/40">
          <div className="mx-auto max-w-5xl px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
            {PORTAL_LINKS.map((link, idx) => {
              const isActive = idx === 0;
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
            Loading your portal…
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

        {/* Empty state if no client record */}
        {!loading && !error && portalUser && !client && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-sm text-slate-200">
            <p className="mb-1">Your agent hasn’t connected your portal yet.</p>
            <p className="text-xs text-slate-400">
              Ask your agent to create your client profile in Hayvn-RE using this
              email address. Once they do, you’ll see your criteria, saved homes,
              tours, offers, and messages here.
            </p>
          </div>
        )}

        {/* Save feedback */}
        {!loading && !error && portalUser && client && saveState.status !== 'idle' && (
          <div
            className={[
              'rounded-2xl border px-4 py-3 text-sm',
              saveState.status === 'saving'
                ? 'border-white/10 bg-black/40 text-slate-200'
                : saveState.status === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
                : 'border-red-500/40 bg-red-950/40 text-red-100',
            ].join(' ')}
          >
            {saveState.status === 'saving'
              ? 'Submitting your changes…'
              : saveState.message}
          </div>
        )}

        {/* 1) Criteria (top) */}
        {!loading && !error && portalUser && client && (
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <header className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  {criteriaLabel}
                </div>
                <h2 className="text-base font-semibold text-slate-50">
                  {client.name || 'Your search criteria'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Changes you submit are sent to your agent for review.
                  {summary.pendingCriteriaChanges > 0 ? (
                    <span className="ml-2 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
                      {summary.pendingCriteriaChanges} pending review
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {canEditCriteria ? (
                  <>
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSaveState({ status: 'idle' });
                          setIsEditing(true);
                        }}
                        className="rounded-lg border border-white/20 bg-black/50 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-white/10"
                      >
                        Edit criteria
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSaveState({ status: 'idle' });
                            setIsEditing(false);
                            // reset form back to client snapshot
                            setForm({
                              preferred_locations: client.preferred_locations || '',
                              budget_min:
                                client.budget_min != null ? String(client.budget_min) : '',
                              budget_max:
                                client.budget_max != null ? String(client.budget_max) : '',
                              property_types: (client.property_types || []).join(', '),
                              min_beds: client.min_beds != null ? String(client.min_beds) : '',
                              min_baths:
                                client.min_baths != null ? String(client.min_baths) : '',
                              deal_style: client.deal_style || '',
                              notes: client.notes || '',
                            });
                          }}
                          className="rounded-lg border border-white/20 bg-black/50 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={submitCriteriaChangeRequest}
                          className="rounded-lg bg-[#EBD27A] text-black px-3 py-1.5 text-[11px] font-semibold hover:brightness-110"
                        >
                          Submit to agent
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Editing not enabled for this profile
                  </span>
                )}
              </div>
            </header>

            {!isEditing ? (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Preferred areas
                  </div>
                  <div className="text-slate-100 mt-0.5">
                    {client.preferred_locations || 'Not specified'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Budget
                  </div>
                  <div className="text-slate-100 mt-0.5">
                    {formatBudget(client.budget_min, client.budget_max)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Property types
                  </div>
                  <div className="text-slate-100 mt-0.5">
                    {client.property_types?.length
                      ? client.property_types.join(', ')
                      : 'Not specified'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Beds / Baths
                  </div>
                  <div className="text-slate-100 mt-0.5">
                    {client.min_beds != null ? `${client.min_beds}+ beds` : '—'}{' '}
                    <span className="text-slate-500">•</span>{' '}
                    {client.min_baths != null ? `${client.min_baths}+ baths` : '—'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Deal style
                  </div>
                  <div className="text-slate-100 mt-0.5">
                    {client.deal_style || 'Not specified'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Notes
                  </div>
                  <div className="text-slate-100 mt-0.5 line-clamp-4">
                    {client.notes || '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <label className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Preferred areas
                  </div>
                  <input
                    value={form.preferred_locations}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, preferred_locations: e.target.value }))
                    }
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="e.g., Santa Monica, Culver City"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Budget min
                  </div>
                  <input
                    value={form.budget_min}
                    onChange={(e) => setForm((p) => ({ ...p, budget_min: e.target.value }))}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="e.g., 800000"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Budget max
                  </div>
                  <input
                    value={form.budget_max}
                    onChange={(e) => setForm((p) => ({ ...p, budget_max: e.target.value }))}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="e.g., 1200000"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Property types (comma-separated)
                  </div>
                  <input
                    value={form.property_types}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, property_types: e.target.value }))
                    }
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="e.g., single_family, condo, townhouse"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Min beds
                  </div>
                  <input
                    value={form.min_beds}
                    onChange={(e) => setForm((p) => ({ ...p, min_beds: e.target.value }))}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="e.g., 2"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Min baths
                  </div>
                  <input
                    value={form.min_baths}
                    onChange={(e) => setForm((p) => ({ ...p, min_baths: e.target.value }))}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="e.g., 2"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Deal style
                  </div>
                  <input
                    value={form.deal_style}
                    onChange={(e) => setForm((p) => ({ ...p, deal_style: e.target.value }))}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="e.g., flexible, off-market, fixer"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Notes for your agent
                  </div>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A]/40"
                    placeholder="Anything you want your agent to know…"
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {/* 2/3/4) Saved properties, Tours & offers, Messages */}
        {!loading && !error && portalUser && client && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {/* Saved Properties */}
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
                    Homes your agent linked to you.
                  </div>
                </div>
                <Link
                  href="/portal/properties"
                  className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                >
                  View
                </Link>
              </div>
              {summary.favoriteHomes > 0 && (
                <div className="mt-1 text-[11px] text-emerald-300">
                  {summary.favoriteHomes} marked as favorites
                </div>
              )}
            </div>

            {/* Tours & Offers */}
            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 flex flex-col justify-between">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                Tours & offers
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-sm text-slate-100">
                    <span className="font-semibold">{summary.upcomingTours}</span>{' '}
                    upcoming tour{summary.upcomingTours === 1 ? '' : 's'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {summary.offers} offer{summary.offers === 1 ? '' : 's'} so far
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  <Link
                    href="/portal/tours"
                    className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                  >
                    Tours
                  </Link>
                  <Link
                    href="/portal/offers"
                    className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
                  >
                    Offers
                  </Link>
                </div>
              </div>
            </div>

            {/* Messages */}
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
                  Open
                </Link>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

