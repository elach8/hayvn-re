// app/portal/offers/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ClientInfo = {
  id: string;
  name: string | null;
  client_type: string | null;
  stage: string | null;
};

type PortalOffer = {
  id: string;
  client_id: string;
  created_at: string | null;
  updated_at: string | null;
  status: string | null;
  offer_price: number | null;

  // property-ish bits, best-effort from whatever columns exist
  property_id: string | null;
  property_label: string;
  property_city: string | null;
  property_state: string | null;

  // client-facing fields
  client_feedback: string | null;
  client_decision: string | null; // 'accept' | 'counter' | 'decline' | 'reviewing' | null
};

export default function PortalOffersPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [offers, setOffers] = useState<PortalOffer[]>([]);

  // local editable state
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  const [decisionById, setDecisionById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAuthError(null);
      setLoadError(null);
      setSaveError(null);
      setSaveSuccess(null);

      // 1) Auth check
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Portal offers auth error:', sessionError);
        setAuthError('You need to be signed in to view your offers.');
        setLoading(false);
        return;
      }

      if (!session) {
        setAuthError('You need to be signed in to view your offers.');
        setLoading(false);
        return;
      }

      const user = session.user;
      const email = (user.email || '').toLowerCase().trim();

      if (!email) {
        setAuthError(
          'We could not determine your email address. Please contact your agent.'
        );
        setLoading(false);
        return;
      }

      const pu: PortalUser = {
        id: user.id,
        full_name:
          (user.user_metadata as any)?.full_name ||
          (user.user_metadata as any)?.name ||
          null,
        email: (user.email ?? null) as string | null,
      };
      setPortalUser(pu);

      // 2) Find all CRM clients mapped to this email
      const { data: clientRows, error: clientError } = await supabase
        .from('clients')
        .select('id, name, client_type, stage, email')
        .eq('email', email);

      if (clientError) {
        console.error('Error loading clients for portal offers:', clientError);
        setLoadError('Could not load your offers.');
        setLoading(false);
        return;
      }

      const clientList: ClientInfo[] = (clientRows || []).map((row: any) => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        client_type: (row.client_type as string | null) ?? null,
        stage: (row.stage as string | null) ?? null,
      }));

      setClients(clientList);

      if (clientList.length === 0) {
        setOffers([]);
        setLoading(false);
        return;
      }

      const clientIds = clientList.map((c) => c.id);
      const clientById = new Map<string, ClientInfo>();
      for (const c of clientList) clientById.set(c.id, c);

      // 3) Load offers for those client IDs
      const { data: offerRows, error: offerError } = await supabase
        .from('offers')
        .select('*')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false });

      if (offerError) {
        console.error('Error loading portal offers:', offerError);
        setLoadError('Could not load your offers.');
        setLoading(false);
        return;
      }

      const mapped: PortalOffer[] = (offerRows || []).map((row: any) => {
        const id = row.id as string;
        const client_id = row.client_id as string;
        const created_at = (row.created_at as string | null) ?? null;
        const updated_at = (row.updated_at as string | null) ?? null;

        // status & price: best-effort
        const status =
          (row.status as string | null) ??
          (row.offer_status as string | null) ??
          null;

        const offer_price =
          (row.offer_price as number | null) ??
          (row.price as number | null) ??
          null;

        // property-ish
        const property_id =
          (row.property_id as string | null) ??
          (row.listing_id as string | null) ??
          null;

        const property_label =
          (row.property_address as string | null) ??
          (row.address as string | null) ??
          (row.title as string | null) ??
          `Offer ${id.slice(0, 8)}`;

        const property_city =
          (row.property_city as string | null) ??
          (row.city as string | null) ??
          null;

        const property_state =
          (row.property_state as string | null) ??
          (row.state as string | null) ??
          null;

        const client_feedback =
          (row.client_feedback as string | null) ?? null;
        const client_decision =
          (row.client_decision as string | null) ?? null;

        return {
          id,
          client_id,
          created_at,
          updated_at,
          status,
          offer_price,
          property_id,
          property_label,
          property_city,
          property_state,
          client_feedback,
          client_decision,
        };
      });

      setOffers(mapped);

      // Seed local editable state
      const fb: Record<string, string> = {};
      const dec: Record<string, string> = {};
      for (const o of mapped) {
        fb[o.id] = o.client_feedback ?? '';
        dec[o.id] = o.client_decision ?? '';
      }
      setFeedbackById(fb);
      setDecisionById(dec);

      setLoading(false);
    };

    load();
  }, []);

  const formatPrice = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const formatJourneyLabel = (c: ClientInfo | null) => {
    if (!c?.client_type) return 'Journey';
    if (c.client_type === 'buyer') return 'Buying journey';
    if (c.client_type === 'seller') return 'Selling journey';
    return 'Journey';
  };

  const formatDecisionLabel = (val: string | null) => {
    if (!val) return 'No decision yet';
    if (val === 'accept') return 'Accept offer';
    if (val === 'counter') return 'Countering / want changes';
    if (val === 'decline') return 'Decline offer';
    if (val === 'reviewing') return 'Still reviewing';
    return val;
  };

  const groupedByClient = useMemo(() => {
    const map = new Map<
      string,
      { client: ClientInfo | null; items: PortalOffer[] }
    >();
    for (const o of offers) {
      const key = o.client_id;
      if (!map.has(key)) {
        map.set(key, {
          client: clients.find((c) => c.id === key) || null,
          items: [],
        });
      }
      map.get(key)!.items.push(o);
    }
    return Array.from(map.values());
  }, [offers, clients]);

  const handleSave = async (offer: PortalOffer) => {
    setSaveError(null);
    setSaveSuccess(null);
    setSavingId(offer.id);

    const feedback = (feedbackById[offer.id] ?? '').trim();
    const decision = decisionById[offer.id] || null;

    const { error } = await supabase
      .from('offers')
      .update({
        client_feedback: feedback || null,
        client_decision: decision,
      })
      .eq('id', offer.id);

    if (error) {
      console.error('Error saving portal offer feedback:', error);
      setSaveError(error.message || 'Could not save your updates.');
      setSavingId(null);
      return;
    }

    setOffers((prev) =>
      prev.map((o) =>
        o.id === offer.id
          ? {
              ...o,
              client_feedback: feedback || null,
              client_decision: decision,
            }
          : o
      )
    );

    setSavingId(null);
    setSaveSuccess('Your updates were saved.');
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Your offers
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Review offers your agent has prepared and share how you feel
              about them.
            </p>
          </div>
          <Link
            href="/portal"
            className="text-sm text-slate-400 hover:text-slate-200 hover:underline"
          >
            ← Back to portal
          </Link>
        </header>

        {portalUser && (
          <p className="text-xs text-slate-400">
            Signed in as{' '}
            <span className="font-medium text-slate-100">
              {portalUser.full_name || portalUser.email}
            </span>
            .
          </p>
        )}

        {authError && (
          <p className="text-sm text-red-300 mt-2">{authError}</p>
        )}

        {!authError && loadError && (
          <p className="text-sm text-red-300 mt-2">{loadError}</p>
        )}

        {saveError && (
          <p className="text-sm text-red-300 mt-2">{saveError}</p>
        )}

        {saveSuccess && (
          <p className="text-sm text-emerald-300 mt-2">{saveSuccess}</p>
        )}

        {!authError && loading && (
          <p className="text-sm text-slate-300 mt-2">
            Loading your offers…
          </p>
        )}

        {!loading && !authError && !loadError && offers.length === 0 && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <p className="text-sm text-slate-300">
              You don&apos;t have any offers tied to your journeys yet. When
              your agent prepares an offer in Hayvn-RE, it will show up here.
            </p>
          </div>
        )}

        {!loading && !authError && !loadError && offers.length > 0 && (
          <div className="space-y-6 mt-3">
            {groupedByClient.map(({ client, items }) => (
              <section
                key={client?.id || 'unknown'}
                className="rounded-2xl border border-white/10 bg-black/40 p-4"
              >
                <header className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-50">
                      {client?.name || 'Home journey'}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {formatJourneyLabel(client)}
                      {client?.stage ? ` • ${client.stage}` : ''}
                    </p>
                  </div>
                </header>

                <ul className="space-y-3 text-sm">
                  {items.map((o) => (
                    <li
                      key={o.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-50">
                            {o.property_id ? (
                              <Link
                                href={`/properties/${o.property_id}`}
                                className="text-[#EBD27A] hover:underline"
                              >
                                {o.property_label}
                              </Link>
                            ) : (
                              o.property_label
                            )}
                          </div>
                          {(o.property_city || o.property_state) && (
                            <div className="text-xs text-slate-400">
                              {o.property_city || ''}
                              {o.property_state ? `, ${o.property_state}` : ''}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {o.status ? `Status: ${o.status}` : 'Status: —'}
                          </div>
                        </div>

                        <div className="text-right text-xs">
                          <div className="text-slate-50 font-medium">
                            {formatPrice(o.offer_price)}
                          </div>
                          {o.created_at && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Created {formatDateTime(o.created_at)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)] gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-200">
                            What are your thoughts on this offer?
                          </label>
                          <textarea
                            value={feedbackById[o.id] ?? ''}
                            onChange={(e) =>
                              setFeedbackById((prev) => ({
                                ...prev,
                                [o.id]: e.target.value,
                              }))
                            }
                            rows={3}
                            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                            placeholder="Anything you want your agent to know – concerns, changes you want, timing, etc."
                          />
                        </div>

                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium mb-1 text-slate-200">
                              How do you feel about this offer?
                            </label>
                            <select
                              value={decisionById[o.id] ?? ''}
                              onChange={(e) =>
                                setDecisionById((prev) => ({
                                  ...prev,
                                  [o.id]: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                            >
                              <option value="">No decision yet</option>
                              <option value="accept">Accept offer</option>
                              <option value="counter">
                                Counter / want changes
                              </option>
                              <option value="decline">Decline offer</option>
                              <option value="reviewing">
                                Still reviewing
                              </option>
                            </select>
                            <p className="mt-1 text-[11px] text-slate-400">
                              Current: {formatDecisionLabel(o.client_decision)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSave(o)}
                            disabled={savingId === o.id}
                            className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg bg-[#EBD27A] text-black text-xs font-medium hover:bg-[#f3e497] disabled:opacity-60"
                          >
                            {savingId === o.id ? 'Saving…' : 'Save updates'}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

