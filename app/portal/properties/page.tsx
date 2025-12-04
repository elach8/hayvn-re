// app/portal/properties/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

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

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string | null;
};

type ClientProperty = {
  id: string;
  client_id: string;
  relationship: string | null;
  interest_level: string | null;
  is_favorite: boolean;
  client_feedback: string | null;
  client_rating: number | null;
  property: Property | null;
  client: ClientInfo | null;
};

export default function PortalPropertiesPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [clientProperties, setClientProperties] = useState<ClientProperty[]>([]);

  // Local editable state
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  const [ratingById, setRatingById] = useState<Record<string, number | ''>>({});
  const [favoriteById, setFavoriteById] = useState<Record<string, boolean>>({});
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
        console.error('Portal properties auth error:', sessionError);
        setAuthError('You need to be signed in to view your properties.');
        setLoading(false);
        return;
      }

      if (!session) {
        setAuthError('You need to be signed in to view your properties.');
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

      // 2) Find all clients mapped to this email
      const { data: clientRows, error: clientError } = await supabase
        .from('clients')
        .select('id, name, client_type, stage, email')
        .eq('email', email);

      if (clientError) {
        console.error('Error loading clients for portal properties:', clientError);
        setLoadError('Could not load your properties.');
        setLoading(false);
        return;
      }

      const clients: ClientInfo[] = (clientRows || []).map((row: any) => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        client_type: (row.client_type as string | null) ?? null,
        stage: (row.stage as string | null) ?? null,
      }));

      if (clients.length === 0) {
        setClientProperties([]);
        setLoading(false);
        return;
      }

      const clientIds = clients.map((c) => c.id);
      const clientById = new Map<string, ClientInfo>();
      for (const c of clients) {
        clientById.set(c.id, c);
      }

      // 3) Load client_properties joined to properties
      const { data: cpRows, error: cpError } = await supabase
        .from('client_properties')
        .select(
          `
          id,
          client_id,
          relationship,
          interest_level,
          is_favorite,
          client_feedback,
          client_rating,
          properties (
            id,
            address,
            city,
            state,
            list_price,
            property_type,
            pipeline_stage
          )
        `
        )
        .in('client_id', clientIds)
        .order('created_at', { ascending: false });

      if (cpError) {
        console.error('Error loading portal client_properties:', cpError);
        setLoadError('Could not load your properties.');
        setLoading(false);
        return;
      }

      const mapped: ClientProperty[] = (cpRows || []).map((row: any) => {
        const cid = row.client_id as string;
        const clientInfo = clientById.get(cid) || null;
        const prop = row.properties
          ? ({
              id: row.properties.id as string,
              address: row.properties.address as string,
              city: row.properties.city as string | null,
              state: row.properties.state as string | null,
              list_price: row.properties.list_price as number | null,
              property_type: row.properties.property_type as string | null,
              pipeline_stage: row.properties.pipeline_stage as string | null,
            } as Property)
          : null;

        return {
          id: row.id as string,
          client_id: cid,
          relationship: (row.relationship as string | null) ?? null,
          interest_level: (row.interest_level as string | null) ?? null,
          is_favorite: !!row.is_favorite,
          client_feedback: (row.client_feedback as string | null) ?? null,
          client_rating:
            typeof row.client_rating === 'number'
              ? (row.client_rating as number)
              : null,
          property: prop,
          client: clientInfo,
        };
      });

      setClientProperties(mapped);

      // Seed local editable state
      const fb: Record<string, string> = {};
      const rt: Record<string, number | ''> = {};
      const fav: Record<string, boolean> = {};
      for (const cp of mapped) {
        fb[cp.id] = cp.client_feedback ?? '';
        rt[cp.id] = cp.client_rating ?? '';
        fav[cp.id] = cp.is_favorite;
      }
      setFeedbackById(fb);
      setRatingById(rt);
      setFavoriteById(fav);

      setLoading(false);
    };

    load();
  }, []);

  const formatPrice = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const groupedByClient = useMemo(() => {
    const map = new Map<string, { client: ClientInfo | null; items: ClientProperty[] }>();
    for (const cp of clientProperties) {
      const key = cp.client_id;
      if (!map.has(key)) {
        map.set(key, { client: cp.client || null, items: [] });
      }
      map.get(key)!.items.push(cp);
    }
    return Array.from(map.values());
  }, [clientProperties]);

  const handleSave = async (cp: ClientProperty) => {
    setSaveError(null);
    setSaveSuccess(null);
    setSavingId(cp.id);

    const feedback = (feedbackById[cp.id] ?? '').trim();
    const rawRating = ratingById[cp.id];
    const rating =
      rawRating === '' || rawRating == null ? null : Number(rawRating);
    const is_favorite = !!favoriteById[cp.id];

    if (rating != null && (rating < 1 || rating > 5)) {
      setSaveError('Rating must be between 1 and 5.');
      setSavingId(null);
      return;
    }

    const { error } = await supabase
      .from('client_properties')
      .update({
        client_feedback: feedback || null,
        client_rating: rating,
        is_favorite,
      })
      .eq('id', cp.id);

    if (error) {
      console.error('Error saving portal property feedback:', error);
      setSaveError(error.message || 'Could not save your changes.');
      setSavingId(null);
      return;
    }

    // Sync local objects
    setClientProperties((prev) =>
      prev.map((item) =>
        item.id === cp.id
          ? {
              ...item,
              client_feedback: feedback || null,
              client_rating: rating,
              is_favorite,
            }
          : item
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
              Your saved homes
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Review homes your agent has shared and tell them what you think
              of each one.
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
          <p className="text-sm text-red-300">{authError}</p>
        )}

        {!authError && loadError && (
          <p className="text-sm text-red-300">{loadError}</p>
        )}

        {saveError && (
          <p className="text-sm text-red-300">{saveError}</p>
        )}

        {saveSuccess && (
          <p className="text-sm text-emerald-300">{saveSuccess}</p>
        )}

        {!authError && loading && (
          <p className="text-sm text-slate-300">Loading your homes…</p>
        )}

        {!loading &&
          !authError &&
          !loadError &&
          clientProperties.length === 0 && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
              <p className="text-sm text-slate-300">
                You don&apos;t have any homes attached to your journeys yet.
                When your agent links homes to your profile, they&apos;ll show
                up here.
              </p>
            </div>
          )}

        {!loading &&
          !authError &&
          !loadError &&
          clientProperties.length > 0 && (
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
                        {client?.client_type === 'buyer'
                          ? 'Buying journey'
                          : client?.client_type === 'seller'
                          ? 'Selling journey'
                          : 'Journey'}
                        {client?.stage ? ` • ${client.stage}` : ''}
                      </p>
                    </div>
                  </header>

                  <ul className="space-y-3 text-sm">
                    {items.map((cp) => {
                      const p = cp.property;
                      return (
                        <li
                          key={cp.id}
                          className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-slate-50">
                                {p ? p.address : 'Home (no longer available)'}
                              </div>
                              {p && (
                                <div className="text-xs text-slate-400">
                                  {p.city || ''}
                                  {p.state ? `, ${p.state}` : ''}
                                  {p.pipeline_stage
                                    ? ` • ${p.pipeline_stage}`
                                    : ''}
                                </div>
                              )}
                              {cp.relationship && (
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  Relationship: {cp.relationship}
                                  {cp.interest_level
                                    ? ` • ${cp.interest_level}`
                                    : ''}
                                </div>
                              )}
                            </div>
                            <div className="text-right text-xs">
                              {p && (
                                <div className="text-slate-50 font-medium">
                                  {formatPrice(p.list_price)}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setFavoriteById((prev) => ({
                                    ...prev,
                                    [cp.id]: !prev[cp.id],
                                  }))
                                }
                                className={[
                                  'mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
                                  favoriteById[cp.id]
                                    ? 'border-[#EBD27A] bg-[#EBD27A]/10 text-[#EBD27A]'
                                    : 'border-white/15 bg-black/40 text-slate-200 hover:bg-white/10',
                                ].join(' ')}
                              >
                                {favoriteById[cp.id]
                                  ? '★ Favorite'
                                  : '☆ Mark favorite'}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.3fr)] gap-3 items-end">
                            <div>
                              <label className="block text-xs font-medium mb-1 text-slate-200">
                                What did you think of this home?
                              </label>
                              <textarea
                                value={feedbackById[cp.id] ?? ''}
                                onChange={(e) =>
                                  setFeedbackById((prev) => ({
                                    ...prev,
                                    [cp.id]: e.target.value,
                                  }))
                                }
                                rows={3}
                                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                                placeholder="Layout, light, neighborhood, pros/cons… anything that helps your agent understand your taste."
                              />
                            </div>

                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs font-medium mb-1 text-slate-200">
                                  Rating
                                </label>
                                <select
                                  value={ratingById[cp.id] ?? ''}
                                  onChange={(e) =>
                                    setRatingById((prev) => ({
                                      ...prev,
                                      [cp.id]:
                                        e.target.value === ''
                                          ? ''
                                          : Number(e.target.value),
                                    }))
                                  }
                                  className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                                >
                                  <option value="">No rating yet</option>
                                  <option value={5}>5 – Love it</option>
                                  <option value={4}>4 – Really like it</option>
                                  <option value={3}>3 – It&apos;s okay</option>
                                  <option value={2}>2 – Not a fit</option>
                                  <option value={1}>1 – Absolutely not</option>
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSave(cp)}
                                disabled={savingId === cp.id}
                                className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg bg-[#EBD27A] text-black text-xs font-medium hover:bg-[#f3e497] disabled:opacity-60"
                              >
                                {savingId === cp.id
                                  ? 'Saving…'
                                  : 'Save feedback'}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
      </div>
    </main>
  );
}

