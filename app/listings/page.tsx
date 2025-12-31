// app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';

type AgentRole = 'broker' | 'agent' | 'assistant' | 'admin';

type Agent = {
  id: string;
  brokerage_id: string | null;
  role: AgentRole | null;
};

type ViewMode = 'mine' | 'brokerage';

type MlsListing = {
  id: string; // mls_listings.id
  brokerage_id: string;
  mls_number: string;
  status: string | null;
  list_date: string | null;
  close_date: string | null;
  list_price: number | null;
  close_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;

  // for building address + photo when we create/update a Property
  property_type: string | null;
  listing_title: string | null;
  street_number: string | null;
  street_dir_prefix: string | null;
  street_name: string | null;
  street_suffix: string | null;
  unit: string | null;
  last_seen_at: string | null;
  raw_payload: any;
};

type PropertyUpsertResult = { id: string };

function safeStr(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : null;
  }
  return null;
}

function buildStreetLineFromStructured(l: MlsListing) {
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
  const candidates = [
    rp.UnparsedAddress,
    rp.UnparsedFirstLineAddress,
    rp.UnparsedFirstLine,
    rp.StreetAddress,
    rp.AddressLine1,
    rp.FullStreetAddress,
    rp.PropertyAddress,
    rp.Address,
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

  const first = candidates[0]!;
  const streetOnly = first.includes(',') ? first.split(',')[0].trim() : first.trim();
  return streetOnly || null;
}

/**
 * Returns a STREET LINE first. Won't fall back to city/state unless everything else is missing.
 */
function buildStreetAddress(l: MlsListing) {
  const structured = buildStreetLineFromStructured(l);
  if (structured) return structured;

  const fromRaw = buildStreetLineFromRawPayload(l.raw_payload);
  if (fromRaw) return fromRaw;

  const title = safeStr(l.listing_title);
  if (title) return title;

  return '(No address)';
}

function ListingsInner() {
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('mine');

  const [listings, setListings] = useState<MlsListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openingId, setOpeningId] = useState<string | null>(null);

  const isBroker = agent?.role === 'broker';
  const canBrokerageView = !!(isBroker && agent?.brokerage_id);

  const formatPrice = (v: number | null) => (v == null ? '-' : `$${v.toLocaleString()}`);

  const formatDate = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  };

  const load = async (mode: ViewMode, existingAgent?: Agent | null) => {
    try {
      setLoadError(null);
      if (!agent && !existingAgent) setLoading(true);
      setReloading(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session) {
        setLoadError('Not signed in');
        setListings([]);
        setLoading(false);
        setReloading(false);
        return;
      }

      const user = session.user;

      // Load agent row (or reuse)
      let a = existingAgent ?? null;
      if (!a) {
        const { data: agentRow, error: agentError } = await supabase
          .from('agents')
          .select('id, brokerage_id, role')
          .eq('id', user.id)
          .maybeSingle();

        if (agentError) throw agentError;
        if (!agentRow) {
          setLoadError('No agent record found for this user.');
          setListings([]);
          setLoading(false);
          setReloading(false);
          return;
        }
        a = agentRow as Agent;
        setAgent(a);
      } else {
        setAgent(a);
      }

      // If someone toggles brokerage without permissions, fall back to mine
      const effectiveMode: ViewMode =
        mode === 'brokerage' && !(a.role === 'broker' && a.brokerage_id) ? 'mine' : mode;

      if (!a.brokerage_id) {
        setListings([]);
        setLoading(false);
        setReloading(false);
        setViewMode(effectiveMode);
        return;
      }

      // Query mls_listings
      let q = supabase
        .from('mls_listings')
        .select(
          `
          id,
          brokerage_id,
          mls_number,
          status,
          list_date,
          close_date,
          list_price,
          close_price,
          beds,
          baths,
          sqft,
          city,
          state,
          postal_code,
          property_type,
          listing_title,
          street_number,
          street_dir_prefix,
          street_name,
          street_suffix,
          unit,
          last_seen_at,
          raw_payload
        `
        )
        .eq('brokerage_id', a.brokerage_id)
        .order('last_seen_at', { ascending: false })
        .limit(500);

      // ✅ "My listings" = match listing agent by email (raw_payload ListAgentEmail)
      if (effectiveMode === 'mine') {
        q = q.filter('raw_payload->>ListAgentEmail', 'eq', user.email || '');
      }

      const { data, error } = await q;

      if (error) throw error;

      setListings((data || []) as MlsListing[]);
      setLoading(false);
      setReloading(false);
      setViewMode(effectiveMode);
    } catch (err: any) {
      console.error('Listings load error:', err);
      setLoadError(err?.message ?? 'Failed to load listings');
      setListings([]);
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    load('mine');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeView = async (mode: ViewMode) => {
    setViewMode(mode);
    await load(mode, agent);
  };

  // ✅ Clicking a listing reuses /properties/[id] by upserting a Property from the MLS listing, then routing
  const openListing = async (l: MlsListing) => {
    try {
      setOpeningId(l.id);
      setLoadError(null);

      if (!agent?.brokerage_id) {
        setLoadError('You are not linked to a brokerage yet.');
        setOpeningId(null);
        return;
      }

      const primaryPhotoUrl =
        l?.raw_payload?.ThumbnailUrl ||
        l?.raw_payload?.thumbnailUrl ||
        l?.raw_payload?.PrimaryPhotoUrl ||
        l?.raw_payload?.primaryPhotoUrl ||
        null;

      const address = buildStreetAddress(l);

      const { data: propRows, error: propErr } = await supabase
        .from('properties')
        .upsert(
          {
            brokerage_id: agent.brokerage_id,
            agent_id: agent.id,

            mls_id: l.mls_number,
            address,
            city: l.city ?? '',
            state: l.state ?? '',
            zip: l.postal_code ?? '',

            list_price: l.list_price ?? l.close_price ?? null,
            beds: l.beds ?? null,
            baths: l.baths ?? null,
            sqft: l.sqft ?? null,

            property_type: l.property_type ?? null,
            status: l.status ?? null,

            // keep it neutral; we don't want to shove it into your client pipeline automatically
            pipeline_stage: 'listing',

            primary_photo_url: primaryPhotoUrl,
          },
          { onConflict: 'brokerage_id,mls_id' as any }
        )
        .select('id')
        .limit(1);

      if (propErr) throw propErr;

      const propertyId = (propRows?.[0] as PropertyUpsertResult | undefined)?.id;
      if (!propertyId) {
        throw new Error('Could not resolve property id for this listing.');
      }

      router.push(`/properties/${propertyId}`);
      setOpeningId(null);
    } catch (err: any) {
      console.error('Open listing error:', err);
      setLoadError(err?.message ?? 'Failed to open listing');
      setOpeningId(null);
    }
  };

  return (
    <main className="min-h-screen max-w-5xl text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Listings</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            MLS listings where you are the listing agent (email match), with an optional brokerage
            view for brokers.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-white/10 bg-black/40 p-1 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => onChangeView('mine')}
                className={
                  'px-3 py-1 rounded-full transition-colors ' +
                  (viewMode === 'mine'
                    ? 'bg-[#EBD27A] text-slate-900 font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-white/5')
                }
              >
                My listings
              </button>

              {canBrokerageView && (
                <button
                  type="button"
                  onClick={() => onChangeView('brokerage')}
                  className={
                    'px-3 py-1 rounded-full transition-colors ' +
                    (viewMode === 'brokerage'
                      ? 'bg-[#EBD27A] text-slate-900 font-semibold shadow-sm'
                      : 'text-slate-300 hover:bg-white/5')
                  }
                >
                  Brokerage
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => load(viewMode, agent)}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-slate-200 hover:border-white/20 hover:bg-white/5 transition-colors"
            >
              {reloading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <Link
          href="/settings/idx"
          className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-50 hover:bg-white/10 whitespace-nowrap"
        >
          MLS / IDX settings
        </Link>
      </header>

      {/* States */}
      {loading && (
        <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-300">
          Loading listings…
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100 mb-3">
          Error loading listings: {loadError}
        </div>
      )}

      {!loading && !loadError && listings.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-300">
          No listings yet for this view.
        </div>
      )}

      {/* Table */}
      {!loading && !loadError && listings.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
            <span>
              Showing{' '}
              <span className="font-semibold text-slate-100">{listings.length}</span>{' '}
              {viewMode === 'brokerage' ? 'brokerage' : 'agent'} listings
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    Address
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    Type
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    Status
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-right font-medium">
                    List price
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    List date
                  </th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const addr = buildStreetAddress(l);

                  return (
                    <tr key={l.id} className="hover:bg-white/5 text-slate-100">
                      <td className="border-b border-white/5 px-3 py-2 align-top">
                        {/* Reuse the existing property detail page by upserting into properties first */}
                        <button
                          type="button"
                          onClick={() => openListing(l)}
                          className="text-left text-[#EBD27A] hover:underline font-medium"
                          disabled={openingId === l.id}
                        >
                          {openingId === l.id ? 'Opening…' : addr}
                        </button>

                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {l.city || ''}
                          {l.state ? `, ${l.state}` : ''}
                          {l.postal_code ? ` ${l.postal_code}` : ''}
                          {l.mls_number ? (
                            <>
                              {' '}
                              • <span className="font-mono">MLS #{l.mls_number}</span>
                            </>
                          ) : null}
                        </div>
                      </td>

                      <td className="border-b border-white/5 px-3 py-2 align-top">
                        {l.property_type ? (
                          <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] capitalize text-slate-100">
                            {l.property_type}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">—</span>
                        )}
                      </td>

                      <td className="border-b border-white/5 px-3 py-2 align-top">
                        {l.status ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 capitalize">
                            {l.status}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">—</span>
                        )}
                      </td>

                      <td className="border-b border-white/5 px-3 py-2 text-right align-top">
                        <span className="font-medium">
                          {formatPrice(l.list_price ?? l.close_price ?? null)}
                        </span>
                      </td>

                      <td className="border-b border-white/5 px-3 py-2 align-top text-slate-300">
                        <span className="text-[11px] sm:text-xs">{formatDate(l.list_date)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

export default function ListingsPage() {
  return (
    <RequireAuth>
      <ListingsInner />
    </RequireAuth>
  );
}

