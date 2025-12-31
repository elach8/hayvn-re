// /app/matches/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

function safeStr(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : null;
  }
  return null;
}

function buildStreetLineFromStructured(l: MlsListingLite) {
  const parts: string[] = [];
  if (safeStr(l.street_number)) parts.push(String(l.street_number).trim());
  if (safeStr(l.street_dir_prefix)) parts.push(String(l.street_dir_prefix).trim());
  if (safeStr(l.street_name)) parts.push(String(l.street_name).trim());
  if (safeStr(l.street_suffix)) parts.push(String(l.street_suffix).trim());

  let addr = parts.join(' ').replace(/\s+/g, ' ').trim();

  const unit = safeStr(l.unit);
  if (unit) addr = addr ? `${addr} #${unit}` : `#${unit}`;

  return addr || null;
}

function buildStreetLineFromRawPayload(raw: any) {
  const rp = raw ?? {};

  // Common MLS payload keys we’ve seen across feeds
  const candidates = [
    rp.UnparsedAddress,
    rp.UnparsedFirstLineAddress,
    rp.UnparsedFirstLine,
    rp.StreetAddress,
    rp.AddressLine1,
    rp.FullStreetAddress,
    rp.PropertyAddress,
    rp.Address, // sometimes includes full street line
    rp.StreetNumber && rp.StreetName
      ? `${rp.StreetNumber} ${rp.StreetDirPrefix ?? ''} ${rp.StreetName} ${rp.StreetSuffix ?? ''}`
      : null,
    rp.StreetNumber && rp.StreetName && rp.UnitNumber
      ? `${rp.StreetNumber} ${rp.StreetName} #${rp.UnitNumber}`
      : null,
  ]
    .map(safeStr)
    .filter(Boolean) as string[];

  if (candidates.length === 0) return null;

  // If "Address" contains commas, take the first segment as street
  const first = candidates[0]!;
  const streetOnly = first.includes(',') ? first.split(',')[0].trim() : first.trim();
  return streetOnly || null;
}

/**
 * IMPORTANT: This returns a STREET LINE first.
 * It WILL NOT fall back to city/state unless everything else is missing.
 */
function buildStreetAddress(l: MlsListingLite) {
  const structured = buildStreetLineFromStructured(l);
  if (structured) return structured;

  const fromRaw = buildStreetLineFromRawPayload(l.raw_payload);
  if (fromRaw) return fromRaw;

  // last-resort fallbacks (still not city/state)
  const title = safeStr(l.listing_title);
  if (title) return title;

  return '(No address)';
}

function normalizeReasons(reasons: any): string[] {
  if (Array.isArray(reasons)) return reasons.map(String);
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

function scoreLabel(score: number) {
  if (score >= 85) return 'Strong';
  if (score >= 65) return 'Good';
  return 'Possible';
}

const MATCHES_RESTORE_KEY = 'hayvnre:matches:restore';

export default function MatchesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // restore target card
  const restoreFocusIdRef = useRef<string | null>(null);
  const restoreScrollYRef = useRef<number | null>(null);

  // ✅ NEW: capture the incoming ?client=... param once
  const initialClientParamRef = useRef<string | null>(null);
  if (initialClientParamRef.current === null) {
    const qp = searchParams?.get('client');
    initialClientParamRef.current = qp ? qp : '';
  }

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const saveRestoreState = (focusRecId: string) => {
    try {
      const payload = {
        selectedClientId,
        scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
        focusRecId,
        ts: Date.now(),
      };
      sessionStorage.setItem(MATCHES_RESTORE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };

  const readRestoreState = () => {
    try {
      const raw = sessionStorage.getItem(MATCHES_RESTORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as { selectedClientId?: string; scrollY?: number; focusRecId?: string };
    } catch {
      return null;
    }
  };

  const loadRecommendations = async (clientId: string) => {
    setRecsLoading(true);
    setError(null);

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
      .eq('status', 'new')
      .order('score', { ascending: false })
      .limit(5);

    if (error) {
      setError(error.message);
      setRecs([]);
      setRecsLoading(false);
      return;
    }

    setRecs((data ?? []) as any);
    setRecsLoading(false);
  };

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
        .select('id, name, stage, client_type, budget_min, budget_max, preferred_locations, brokerage_id, agent_id')
        .order('created_at', { ascending: false })
        .limit(500);

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

      const rows = (clientRows ?? []) as ClientRow[];
      setClients(rows);

      // ✅ NEW: priority order for initial selection
      // 1) query param ?client=...
      // 2) restore state from sessionStorage (coming back from detail)
      // 3) none
      const qpClientId = (initialClientParamRef.current || '').trim();
      if (qpClientId) {
        setSelectedClientId(qpClientId);
      } else {
        const restore = readRestoreState();
        if (restore?.selectedClientId) {
          setSelectedClientId(restore.selectedClientId);
          restoreFocusIdRef.current = restore.focusRecId ?? null;
          restoreScrollYRef.current =
            typeof restore.scrollY === 'number' ? restore.scrollY : null;
        }
      }

      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After we load recs, if we have a restore scroll/card target, apply it once.
  useEffect(() => {
    if (recsLoading) return;
    if (!recs || recs.length === 0) return;

    const focusId = restoreFocusIdRef.current;
    const scrollY = restoreScrollYRef.current;

    // only attempt restore once per return
    restoreFocusIdRef.current = null;
    restoreScrollYRef.current = null;

    // Prefer scrolling to the exact card
    if (focusId) {
      const el = document.getElementById(`rec-${focusId}`);
      if (el) {
        // align card nicely
        el.scrollIntoView({ block: 'start' });
        // small offset for header spacing
        window.scrollBy({ top: -12, left: 0 });
        return;
      }
    }

    // fallback to raw scrollY
    if (typeof scrollY === 'number') {
      window.scrollTo({ top: scrollY, left: 0 });
    }
  }, [recsLoading, recs]);

  const handleSelectClient = async (clientId: string) => {
    setSelectedClientId(clientId);
    setRecs([]);
    if (clientId) {
      await loadRecommendations(clientId);
    }
  };

  // ✅ UPDATED: if selectedClientId is set (from query param OR restore OR manual), load recs automatically
  useEffect(() => {
    if (!selectedClientId) return;

    // Avoid double-fetch when user manually selected and we already fetched in handleSelectClient
    if (recsLoading) return;

    // If we already have recs for this client, don't re-fetch
    // (We can’t perfectly verify client_id per row because shape is typed, but this avoids the common double-load)
    if (recs.length > 0) return;

    loadRecommendations(selectedClientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

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

    setRecs([]); // ✅ ensure the "auto-load" effect doesn't get blocked by stale rows
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

    const brokerage_id = selectedClient?.brokerage_id ?? agent?.brokerage_id ?? null;
    if (!brokerage_id) {
      setError('Attach failed: client/agent is not linked to a brokerage_id.');
      return;
    }

    setActionId(rec.id);
    setError(null);

    const address = buildStreetAddress(l);

    const primaryPhotoUrl =
      l?.raw_payload?.ThumbnailUrl ||
      l?.raw_payload?.thumbnailUrl ||
      l?.raw_payload?.PrimaryPhotoUrl ||
      l?.raw_payload?.primaryPhotoUrl ||
      null;

    const { data: propRows, error: propErr } = await supabase
      .from('properties')
      .upsert(
        {
          brokerage_id,
          agent_id: agent?.id ?? null,

          mls_id: l.mls_number,
          address, // STREET LINE
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

    const { error: recErr } = await supabase
      .from('property_recommendations')
      .update({ status: 'attached' })
      .eq('id', rec.id);

    if (recErr) {
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
              Generate recommendations from <code className="font-mono">mls_listings</code>, then
              attach the best fits to a client’s portal.
            </p>
          </div>

          <Link href="/" className="text-sm text-slate-400 hover:text-slate-200 hover:underline">
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
              <span className="text-[11px] text-slate-400">Unreviewed only • Top 5</span>
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
                  const addr = l ? buildStreetAddress(l) : 'Listing';

                  const meta = l
                    ? `${l.city ?? '—'}${l.state ? `, ${l.state}` : ''}${
                        l.postal_code ? ` ${l.postal_code}` : ''
                      }`
                    : '—';

                  const reasons = normalizeReasons(r.reasons);

                  const detailHref = `/matches/${encodeURIComponent(r.id)}`;

                  const onOpenDetail = () => {
                    saveRestoreState(r.id);
                    router.push(detailHref);
                  };

                  return (
                    <li
                      key={r.id}
                      id={`rec-${r.id}`}
                      className="rounded-2xl border border-white/10 bg-black/40 p-4"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-slate-50 truncate">
                              <button
                                type="button"
                                onClick={onOpenDetail}
                                className="text-left text-[#EBD27A] hover:underline"
                              >
                                {addr}
                              </button>
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

                          <Button variant="secondary" className="w-full" onClick={onOpenDetail}>
                            View details
                          </Button>

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
