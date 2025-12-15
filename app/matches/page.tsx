// /app/matches/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

type AgentRow = {
  id: string;
  brokerage_id: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  stage: string | null;
  client_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_locations: string | null;
  brokerage_id: string | null;
  agent_id: string | null;
};

type MlsListingLite = {
  id: string; // mls_listings.id (uuid)
  mls_number: string;
  status: string;
  list_price: number | null;
  property_type: string | null;
  listing_title: string | null;
  street_number: string | null;
  street_dir_prefix: string | null;
  street_name: string | null;
  street_suffix: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_sqft?: number | null;
  year_built?: number | null;
  last_seen_at: string | null;
  raw_payload?: any;
};

type RecommendationRow = {
  id: string;
  client_id: string;
  mls_listing_id: string; // uuid
  score: number;
  reasons: any; // jsonb array
  status: 'new' | 'attached' | 'dismissed';
  created_at: string;
  mls_listings: MlsListingLite | null;
};

function formatCurrency(v: number | null) {
  if (v == null) return '—';
  return `$${Number(v).toLocaleString()}`;
}

function fmtDate(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function buildAddressLine(l: MlsListingLite) {
  const parts: string[] = [];
  if (l.street_number) parts.push(l.street_number);
  if (l.street_dir_prefix) parts.push(l.street_dir_prefix);
  if (l.street_name) parts.push(l.street_name);
  if (l.street_suffix) parts.push(l.street_suffix);
  let addr = parts.join(' ').trim();
  if (l.unit) addr = addr ? `${addr} #${l.unit}` : `#${l.unit}`;
  return addr || l.listing_title || '(No address)';
}

function scoreLabel(score: number) {
  if (score >= 85) return 'Strong';
  if (score >= 65) return 'Good';
  return 'Possible';
}

function normalizeReasons(reasons: any): string[] {
  if (Array.isArray(reasons)) return reasons.map(String);
  // sometimes jsonb can come back as stringified
  if (typeof reasons === 'string') {
    try {
      const parsed = JSON.parse(reasons);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* ignore */
    }
  }
  return [];
}

export default function MatchesPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  const [refreshing, setRefreshing] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recs, setRecs] = useState<RecommendationRow[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAuthError(null);
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setAuthError('You must be signed in as an agent to view Matches.');
        setLoading(false);
        return;
      }

      const { data: agentRow, error: agentErr } = await supabase
        .from('agents')
        .select('id, brokerage_id')
        .eq('id', user.id)
        .single();

      if (agentErr) {
        setError(agentErr.message);
        setLoading(false);
        return;
      }

      const a: AgentRow = {
        id: agentRow.id,
        brokerage_id: agentRow.brokerage_id ?? null,
      };
      setAgent(a);

      let q = supabase
        .from('clients')
        .select(
          'id, name, stage, client_type, budget_min, budget_max, preferred_locations, brokerage_id, agent_id'
        )
        .order('created_at', { ascending: false })
        .limit(500);

      // show brokerage clients + direct agent clients
      if (a.brokerage_id) {
        q = q.or(`brokerage_id.eq.${a.brokerage_id},agent_id.eq.${a.id}`);
      } else {
        q = q.eq('agent_id', a.id);
      }

      const { data: clientRows, error: clientsErr } = await q;
      if (clientsErr) {
        setError(clientsErr.message);
        setLoading(false);
        return;
      }

      setClients((clientRows ?? []) as ClientRow[]);
      setLoading(false);
    };

    load();
  }, []);

  const loadRecommendations = async (clientId: string) => {
    setRecsLoading(true);
    setError(null);

    // Pull both NEW + ATTACHED so agent can see what’s already been pushed
    const { data, error } = await supabase
      .from('property_recommendations')
      .select(
        `
        id,
        client_id,
        mls_listing_id,
        score,
        reasons,
        status,
        created_at,
        mls_listings (
          id,
          mls_number,
          status,
          list_price,
          property_type,
          listing_title,
          street_number,
          street_dir_prefix,
          street_name,
          street_suffix,
          unit,
          city,
          state,
          postal_code,
          beds,
          baths,
          sqft,
          lot_sqft,
          year_built,
          last_seen_at,
          raw_payload
        )
      `
      )
      .eq('client_id', clientId)
      .in('status', ['new', 'attached'])
      .order('score', { ascending: false })
      .limit(200);

    if (error) {
      setError(error.message);
      setRecs([]);
      setRecsLoading(false);
      return;
    }

    // Ensure NEW appears first (UI-only sort)
    const rows = ((data ?? []) as any[]).sort((a, b) => {
      const aNew = a.status === 'new' ? 0 : 1;
      const bNew = b.status === 'new' ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    setRecs(rows as any);
    setRecsLoading(false);
  };

  const handleSelectClient = async (clientId: string) => {
    setSelectedClientId(clientId);
    setRecs([]);
    if (clientId) {
      await loadRecommendations(clientId);
    }
  };

  const handleRefresh = async () => {
    if (!selectedClientId) return;
    setRefreshing(true);
    setError(null);

    const { data, error } = await supabase.functions.invoke('recommend-matches', {
      body: { client_id: selectedClientId, limit: 50 },
    });

    if (error) {
      setError(error.message || 'Could not refresh recommendations.');
      setRefreshing(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || 'Could not refresh recommendations.');
      setRefreshing(false);
      return;
    }

    await loadRecommendations(selectedClientId);
    setRefreshing(false);
  };

  const handleDismiss = async (rec: RecommendationRow) => {
    setActionId(rec.id);
    setError(null);

    const { error } = await supabase
      .from('property_recommendations')
      .update({ status: 'dismissed' })
      .eq('id', rec.id);

    if (error) {
      setError(error.message);
      setActionId(null);
      return;
    }

    setRecs((prev) => prev.filter((r) => r.id !== rec.id));
    setActionId(null);
  };

  const handleAttach = async (rec: RecommendationRow) => {
    if (!selectedClientId) return;

    const l = rec.mls_listings;
    if (!l) {
      setError('Listing details are missing. Try refreshing.');
      return;
    }

    // Use client brokerage_id first, fallback to agent brokerage_id
    const brokerage_id = selectedClient?.brokerage_id ?? agent?.brokerage_id ?? null;
    if (!brokerage_id) {
      setError('Attach failed: client/agent is not linked to a brokerage_id.');
      return;
    }

    setActionId(rec.id);
    setError(null);

    const address = buildAddressLine(l);

    // Best-effort photo URL from raw_payload if present
    const primaryPhotoUrl =
      l?.raw_payload?.ThumbnailUrl ||
      l?.raw_payload?.thumbnailUrl ||
      l?.raw_payload?.PrimaryPhotoUrl ||
      null;

    // 1) Upsert into properties using YOUR schema (mls_id is TEXT; use mls_number)
    const { data: propRows, error: propErr } = await supabase
      .from('properties')
      .upsert(
        {
          brokerage_id,
          agent_id: agent?.id ?? null,

          mls_id: l.mls_number, // <-- canonical key in your properties table
          address,
          city: l.city ?? '',
          state: l.state ?? '',
          zip: l.postal_code ?? '',

          list_price: l.list_price,
          beds: l.beds,
          baths: l.baths,
          sqft: l.sqft,
          lot_sqft: (l as any).lot_sqft ?? null,
          year_built: (l as any).year_built ?? null,

          property_type: l.property_type ?? null,
          status: l.status ?? null,
          pipeline_stage: 'suggested',

          primary_photo_url: primaryPhotoUrl,
          // mls_url: null, // optional later
        },
        { onConflict: 'brokerage_id,mls_id' as any }
      )
      .select('id')
      .limit(1);

    if (propErr) {
      setError(propErr.message || 'Could not create/update property.');
      setActionId(null);
      return;
    }

    const propertyId = propRows?.[0]?.id as string | undefined;
    if (!propertyId) {
      setError('Could not resolve property id for attach.');
      setActionId(null);
      return;
    }

    // 2) Attach to client (client_properties)
    const { error: cpErr } = await supabase
      .from('client_properties')
      .upsert(
        {
          client_id: selectedClientId,
          property_id: propertyId,
          relationship: 'recommended',
          interest_level: null,
          is_favorite: false,
          client_feedback: null,
          client_rating: null,
        },
        { onConflict: 'client_id,property_id' as any }
      );

    if (cpErr) {
      setError(cpErr.message || 'Could not attach property to client.');
      setActionId(null);
      return;
    }

    // 3) Mark recommendation as attached
    const { error: recErr } = await supabase
      .from('property_recommendations')
      .update({ status: 'attached' })
      .eq('id', rec.id);

    if (recErr) {
      // not fatal—client attachment succeeded
      setError(`Attached, but could not update recommendation status: ${recErr.message}`);
    }

    await loadRecommendations(selectedClientId);
    setActionId(null);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Matches
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl">
              Generate recommendations from{' '}
              <code className="font-mono">mls_listings</code>, then attach the best fits to a
              client’s portal.
            </p>
          </div>

          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-slate-200 hover:underline"
          >
            ← Back
          </Link>
        </header>

        {authError && (
          <Card>
            <p className="text-sm text-red-300">{authError}</p>
          </Card>
        )}

        {!authError && error && (
          <Card>
            <p className="text-sm text-red-300">{error}</p>
          </Card>
        )}

        {!authError && loading && (
          <Card>
            <p className="text-sm text-slate-300">Loading…</p>
          </Card>
        )}

        {!authError && !loading && (
          <Card className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div className="w-full md:max-w-xl">
                <label className="block text-[11px] font-medium mb-1 text-slate-300">
                  Select client
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                >
                  <option value="">— Choose a client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'Unnamed client'}
                      {c.client_type ? ` • ${c.client_type}` : ''}
                      {c.stage ? ` • ${c.stage}` : ''}
                    </option>
                  ))}
                </select>

                {selectedClient && (
                  <div className="mt-2 text-xs text-slate-400 space-y-0.5">
                    <div>
                      Budget:{' '}
                      <span className="text-slate-200">
                        {selectedClient.budget_min != null || selectedClient.budget_max != null
                          ? `${formatCurrency(selectedClient.budget_min)} — ${formatCurrency(
                              selectedClient.budget_max
                            )}`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      Preferred:{' '}
                      <span className="text-slate-200">
                        {selectedClient.preferred_locations || '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => selectedClientId && loadRecommendations(selectedClientId)}
                  disabled={!selectedClientId || recsLoading}
                >
                  {recsLoading ? 'Loading…' : 'Load'}
                </Button>

                <Button
                  className="w-full sm:w-auto"
                  onClick={handleRefresh}
                  disabled={!selectedClientId || refreshing}
                >
                  {refreshing ? 'Refreshing…' : 'Refresh recommendations'}
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Tip: Refresh runs the Edge Function and writes to{' '}
              <code className="font-mono">property_recommendations</code>.
            </p>
          </Card>
        )}

        {!authError && !loading && selectedClientId && (
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span>
                Showing <span className="font-semibold">{recs.length}</span> recommendation
                {recs.length === 1 ? '' : 's'}
              </span>
              <span className="text-[11px] text-slate-400">
                New first • then attached
              </span>
            </div>

            {recsLoading ? (
              <p className="text-sm text-slate-300">Loading recommendations…</p>
            ) : recs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
                <p className="text-sm text-slate-300">
                  No recommendations yet. Click{' '}
                  <span className="text-[#EBD27A]">Refresh recommendations</span>.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  If you still see none, it may mean the client’s preferred locations don’t overlap
                  with your current MLS inventory.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {recs.map((r) => {
                  const l = r.mls_listings;
                  const addr = l ? buildAddressLine(l) : 'Listing';
                  const meta = l
                    ? `${l.city ?? '—'}${l.state ? `, ${l.state}` : ''}${
                        l.postal_code ? ` ${l.postal_code}` : ''
                      }`
                    : '—';

                  const reasons = normalizeReasons(r.reasons);

                  return (
                    <li key={r.id} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-slate-50 truncate">
                              {/* ✅ NOW LINKS TO DETAIL PAGE */}
                              <Link
                                href={`/matches/${encodeURIComponent(r.id)}`}
                                className="text-[#EBD27A] hover:underline"
                              >
                                {addr}
                              </Link>
                            </div>

                            <span
                              className={[
                                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
                                r.status === 'attached'
                                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                                  : 'border-white/15 bg-white/5 text-slate-200',
                              ].join(' ')}
                            >
                              {r.status === 'attached' ? 'Attached' : 'New'}
                            </span>

                            <span className="inline-flex items-center rounded-full border border-[#EBD27A]/30 bg-[#EBD27A]/10 px-2 py-0.5 text-[11px] text-[#EBD27A]">
                              {scoreLabel(r.score)} • {r.score}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-slate-400">
                            {meta}
                            {l?.mls_number ? (
                              <>
                                {' '}
                                • <span className="font-mono">MLS #{l.mls_number}</span>
                              </>
                            ) : null}
                            {l?.property_type ? ` • ${l.property_type}` : ''}
                            {l?.status ? ` • ${l.status}` : ''}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                            {reasons.slice(0, 4).map((reason, idx) => (
                              <span
                                key={`${r.id}-reason-${idx}`}
                                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-200"
                              >
                                {reason}
                              </span>
                            ))}
                            {reasons.length > 4 ? (
                              <span className="text-slate-400">+{reasons.length - 4} more</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:min-w-[220px]">
                          <div className="flex items-center justify-between lg:justify-end gap-4">
                            <div className="text-right">
                              <div className="text-sm font-semibold text-slate-50">
                                {formatCurrency(l?.list_price ?? null)}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {l?.beds != null || l?.baths != null
                                  ? `${l?.beds ?? '—'} bd / ${l?.baths ?? '—'} ba`
                                  : '—'}
                                {l?.sqft != null ? ` • ${Number(l.sqft).toLocaleString()} sqft` : ''}
                              </div>
                            </div>
                          </div>

                          <Link href={`/matches/${encodeURIComponent(r.id)}`}>
                            <Button variant="secondary" className="w-full">
                              View details
                            </Button>
                          </Link>

                          <Button
                            className="w-full"
                            onClick={() => handleAttach(r)}
                            disabled={actionId === r.id || r.status === 'attached'}
                          >
                            {r.status === 'attached'
                              ? 'Already attached'
                              : actionId === r.id
                              ? 'Attaching…'
                              : 'Attach to client'}
                          </Button>

                          <Button
                            variant="secondary"
                            className="w-full"
                            onClick={() => handleDismiss(r)}
                            disabled={actionId === r.id}
                          >
                            {actionId === r.id ? 'Working…' : 'Dismiss'}
                          </Button>

                          <div className="text-[11px] text-slate-500">
                            {fmtDate(r.created_at) ? `Generated: ${fmtDate(r.created_at)}` : null}
                            {l?.last_seen_at && fmtDate(l.last_seen_at)
                              ? ` • Last seen: ${fmtDate(l.last_seen_at)}`
                              : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
