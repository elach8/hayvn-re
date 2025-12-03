'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type JourneyClient = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  client_type: string | null;
  stage: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_locations: string | null;
  notes: string | null;
  agent_id: string | null;
};

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type SavedProperty = {
  id: string;
  relationship: string | null;
  interest_level: string | null;
  is_favorite: boolean;
  created_at: string;
  property: {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    list_price: number | null;
    property_type: string | null;
    pipeline_stage: string | null;
    primary_photo_url: string | null;
  } | null;
};

type JourneyTour = {
  id: string;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
};

type JourneyOffer = {
  id: string;
  status: string | null;
  side: string | null;
  offer_price: number | null;
  close_date: string | null;
  property: {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    list_price: number | null;
  } | null;
};

type JourneyState = {
  loading: boolean;
  error: string | null;
  portalUser: PortalUser | null;
  client: JourneyClient | null;
  accessRole: string | null;
  agent: Agent | null;
  savedHomes: SavedProperty[];
  tours: JourneyTour[];
  offers: JourneyOffer[];
};

function ClientJourneyInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params?.id as string | undefined;

  const [state, setState] = useState<JourneyState>({
    loading: true,
    error: null,
    portalUser: null,
    client: null,
    accessRole: null,
    agent: null,
    savedHomes: [],
    tours: [],
    offers: [],
  });

  useEffect(() => {
    if (!clientId) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'No home journey selected.',
      }));
      return;
    }

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
          setState((prev) => ({
            ...prev,
            loading: false,
            error: 'Please sign in to view this page.',
          }));
          return;
        }

        const user = session.user;

        // 2) Load portal user
        const { data: portalRow, error: portalError } = await supabase
          .from('client_portal_users')
          .select('*')
          .eq('email', user.email)
          .maybeSingle();


        if (portalError) throw portalError;
        if (!portalRow) {
          throw new Error(
            'Your portal account could not be found. Please contact your agent.'
          );
        }

        const portalUser: PortalUser = {
          id: portalRow.id,
          full_name: portalRow.full_name,
          email: portalRow.email,
        };

        // 3) Verify access to this client via client_portal_access
        const { data: accessRow, error: accessError } = await supabase
          .from('client_portal_access')
          .select('id, role, client:clients(*)')
          .eq('portal_user_id', portalUser.id)
          .eq('client_id', clientId)
          .maybeSingle();

        if (accessError) throw accessError;
        if (!accessRow || !(accessRow as any).client) {
          throw new Error(
            'You do not have access to this home journey. Please check with your agent.'
          );
        }

        const rawClient = (accessRow as any).client;
        const client: JourneyClient = {
          id: rawClient.id,
          name: rawClient.name,
          email: rawClient.email,
          phone: rawClient.phone,
          client_type: rawClient.client_type,
          stage: rawClient.stage,
          budget_min: rawClient.budget_min,
          budget_max: rawClient.budget_max,
          preferred_locations: rawClient.preferred_locations,
          notes: rawClient.notes,
          agent_id: rawClient.agent_id ?? null,
        };

        const accessRole = (accessRow as any).role as string | null;

        // 4) Load agent (if set on client)
        let agent: Agent | null = null;
        if (client.agent_id) {
          const { data: agentRow, error: agentError } = await supabase
            .from('agents')
            .select('id, full_name, email')
            .eq('id', client.agent_id)
            .maybeSingle();

          if (agentError) throw agentError;

          if (agentRow) {
            agent = {
              id: agentRow.id,
              full_name: agentRow.full_name,
              email: agentRow.email,
            };
          }
        }

        // 5) Saved homes (client_properties + properties)
        const { data: cpRows, error: cpError } = await supabase
          .from('client_properties')
          .select(
            `
            id,
            relationship,
            interest_level,
            is_favorite,
            created_at,
            property:properties (
              id,
              address,
              city,
              state,
              list_price,
              property_type,
              pipeline_stage,
              primary_photo_url
            )
          `
          )
          .eq('client_id', client.id)
          .order('created_at', { ascending: false });

        if (cpError) throw cpError;

        const savedHomes: SavedProperty[] = (cpRows || []).map((row: any) => ({
          id: row.id as string,
          relationship: row.relationship as string | null,
          interest_level: row.interest_level as string | null,
          is_favorite: !!row.is_favorite,
          created_at: row.created_at as string,
          property: row.property
            ? {
                id: row.property.id as string,
                address: row.property.address,
                city: row.property.city,
                state: row.property.state,
                list_price: row.property.list_price,
                property_type: row.property.property_type,
                pipeline_stage: row.property.pipeline_stage,
                primary_photo_url: row.property.primary_photo_url,
              }
            : null,
        }));

        // 6) Tours for this client
        const { data: tourRows, error: tourError } = await supabase
          .from('tours')
          .select('id, title, status, start_time, end_time')
          .eq('client_id', client.id)
          .order('start_time', { ascending: true });

        if (tourError) throw tourError;

        const tours: JourneyTour[] = (tourRows || []).map((t: any) => ({
          id: t.id as string,
          title: t.title as string | null,
          status: t.status as string | null,
          start_time: t.start_time as string | null,
          end_time: t.end_time as string | null,
        }));

        // 7) Offers for this client
        const { data: offerRows, error: offerError } = await supabase
          .from('offers')
          .select(
            `
            id,
            status,
            side,
            offer_price,
            close_date,
            property:properties (
              id,
              address,
              city,
              state,
              list_price
            )
          `
          )
          .eq('client_id', client.id)
          .order('created_at', { ascending: false });

        if (offerError) throw offerError;

        const offers: JourneyOffer[] = (offerRows || []).map((o: any) => ({
          id: o.id as string,
          status: o.status as string | null,
          side: o.side as string | null,
          offer_price: o.offer_price as number | null,
          close_date: o.close_date as string | null,
          property: o.property
            ? {
                id: o.property.id as string,
                address: o.property.address,
                city: o.property.city,
                state: o.property.state,
                list_price: o.property.list_price,
              }
            : null,
        }));

        setState({
          loading: false,
          error: null,
          portalUser,
          client,
          accessRole,
          agent,
          savedHomes,
          tours,
          offers,
        });
      } catch (err: any) {
        console.error('Client portal journey error:', err);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message ?? 'Failed to load home journey.',
        }));
      }
    };

    run();
  }, [clientId, router]);

  const { loading, error, portalUser, client, accessRole, agent, savedHomes, tours, offers } =
    state;

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

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const now = useMemo(() => new Date(), []);
  const upcomingTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d >= now;
      }),
    [tours, now]
  );
  const pastTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d < now;
      }),
    [tours, now]
  );

  if (loading && !client) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">
          Loading your home journey…
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-xl bg-white border border-red-200 px-4 py-3 text-sm text-red-700">
          {error || 'Home journey not found.'}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Portal header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => router.push('/portal')}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ← Back to all journeys
            </button>
            <h1 className="text-base font-semibold">
              Your home journey
            </h1>
            <p className="text-xs text-gray-500">
              {client.client_type === 'buyer'
                ? 'Buying'
                : client.client_type === 'seller'
                ? 'Selling'
                : 'Home journey'}{' '}
              {accessRole ? `• ${accessRole}` : null}
            </p>
          </div>
          {portalUser && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Signed in as</p>
              <p className="text-xs font-medium text-gray-800">
                {portalUser.full_name || portalUser.email}
              </p>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Overview */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 text-sm">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                Overview
              </h2>
              <p className="text-xs text-gray-500">
                A snapshot of your search with your agent.
              </p>
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                Status
              </div>
              <div className="text-sm font-medium text-gray-800">
                {client.stage || 'Active'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                Budget
              </div>
              <div className="text-sm font-medium text-gray-800">
                {formatBudget(client.budget_min, client.budget_max)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                Preferred areas
              </div>
              <div className="text-sm font-medium text-gray-800">
                {client.preferred_locations || 'Not specified'}
              </div>
            </div>
          </div>

          {agent && (
            <div className="mt-3 text-xs text-gray-600">
              <span className="font-medium">Agent:</span>{' '}
              {agent.full_name || agent.email}
            </div>
          )}

          {client.notes && (
            <p className="mt-3 text-xs text-gray-600 whitespace-pre-wrap">
              <span className="font-medium">Agent notes:</span>{' '}
              {client.notes}
            </p>
          )}
        </section>

        {/* Saved homes */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-3">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                Saved homes
              </h2>
              <p className="text-xs text-gray-500">
                Homes your agent has linked to this journey.
              </p>
            </div>
            <div className="text-[11px] text-gray-400">
              {savedHomes.length} home
              {savedHomes.length === 1 ? '' : 's'}
            </div>
          </header>

          {savedHomes.length === 0 ? (
            <p className="text-xs text-gray-500">
              No saved homes yet. As your agent shares homes with you, they&apos;ll
              appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {savedHomes.map((sh) => {
                const p = sh.property;
                return (
                  <article
                    key={sh.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex flex-col gap-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {p?.address || 'Home'}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {p?.city && p?.state
                            ? `${p.city}, ${p.state}`
                            : null}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-gray-400">
                        {new Date(sh.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] mt-1">
                      {p?.list_price != null && (
                        <span className="font-medium">
                          {formatMoney(p.list_price)}
                        </span>
                      )}
                      {p?.property_type && (
                        <span className="text-gray-500">
                          {p.property_type}
                        </span>
                      )}
                      {sh.relationship && (
                        <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2 py-0.5">
                          {sh.relationship.replace('_', ' ')}
                        </span>
                      )}
                      {sh.interest_level && (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5">
                          {sh.interest_level}
                        </span>
                      )}
                      {sh.is_favorite && (
                        <span className="text-yellow-500 text-xs">
                          ★ favorite
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Tours */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-3">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                Tours & showings
              </h2>
              <p className="text-xs text-gray-500">
                Your upcoming appointments and past tours with your agent.
              </p>
            </div>
          </header>

          {tours.length === 0 ? (
            <p className="text-xs text-gray-500">
              No tours scheduled yet. When your agent books showings, they&apos;ll
              appear here.
            </p>
          ) : (
            <div className="space-y-4">
              {upcomingTours.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
                    Upcoming
                  </h3>
                  <ul className="space-y-2">
                    {upcomingTours.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-800">
                              {t.title || 'Tour'}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {formatDateTime(t.start_time)}
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {t.status || 'scheduled'}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pastTours.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
                    Past
                  </h3>
                  <ul className="space-y-2">
                    {pastTours.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-800">
                              {t.title || 'Tour'}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {formatDateTime(t.start_time)}
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {t.status || 'completed'}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Offers */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-3">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                Offers & contracts
              </h2>
              <p className="text-xs text-gray-500">
                Any offers your agent has recorded for this journey.
              </p>
            </div>
            <div className="text-[11px] text-gray-400">
              {offers.length} offer{offers.length === 1 ? '' : 's'}
            </div>
          </header>

          {offers.length === 0 ? (
            <p className="text-xs text-gray-500">
              No offers recorded yet. When your agent logs an offer, you&apos;ll
              see it here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1 text-left">Home</th>
                    <th className="border px-2 py-1 text-left">Side</th>
                    <th className="border px-2 py-1 text-left">Status</th>
                    <th className="border px-2 py-1 text-right">
                      Offer price
                    </th>
                    <th className="border px-2 py-1 text-left">
                      Close date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="border px-2 py-1">
                        {o.property ? (
                          <>
                            <div className="font-medium text-gray-800">
                              {o.property.address || 'Home'}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {o.property.city}, {o.property.state}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-400">(no property)</span>
                        )}
                      </td>
                      <td className="border px-2 py-1">
                        {o.side || '-'}
                      </td>
                      <td className="border px-2 py-1">
                        {o.status || '-'}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {formatMoney(o.offer_price)}
                      </td>
                      <td className="border px-2 py-1">
                        {o.close_date
                          ? new Date(o.close_date).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default function ClientJourneyPage() {
  return <ClientJourneyInner />;
}
