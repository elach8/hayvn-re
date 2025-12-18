// app/matches/[id]/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

type AgentRow = {
  id: string;
  brokerage_id: string | null;
};

type Listing = {
  id: string; // mls_listings.id
  mls_number: string;
  status: string | null;
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
  lot_sqft: number | null;
  year_built: number | null;
  last_seen_at: string | null;
  raw_payload: any;
};

type RecommendationRow = {
  id: string;
  client_id: string;
  mls_listing_id: string;
  score: number;
  reasons: any;
  status: 'new' | 'attached' | 'dismissed';
  created_at: string;
  agent_note?: string | null; // property_recommendations.agent_note
  mls_listings: Listing | null;
};

type PhotoRow = {
  id: string;
  listing_id: string;
  sort_order: number | null;
  url: string;
  caption: string | null;
  created_at: string;
};

function safeStr(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : null;
  }
  return null;
}

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

function buildStreetLineFromStructured(l: Listing) {
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

function buildStreetAddress(l: Listing) {
  const structured = buildStreetLineFromStructured(l);
  if (structured) return structured;

  const fromRaw = buildStreetLineFromRawPayload(l.raw_payload);
  if (fromRaw) return fromRaw;

  const title = safeStr(l.listing_title);
  if (title) return title;

  return '(No address)';
}

function scoreLabel(score: number) {
  if (score >= 85) return 'Strong';
  if (score >= 65) return 'Good';
  return 'Possible';
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

function toNum(val: any): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * FIX: De-dupe “same photo different size” variants and prefer the higher-quality URL.
 * - canonical key strips query string + hash
 * - we sort so "thumb/thumbnail/small/resize/w=..." go last
 */
function canonicalPhotoKey(url: string) {
  const s = safeStr(url) ?? '';
  if (!s) return '';
  const noHash = s.split('#')[0];
  const noQuery = noHash.split('?')[0];
  return noQuery.trim();
}

function photoQualityRank(url: string) {
  const s = (safeStr(url) ?? '').toLowerCase();
  if (!s) return 999;

  // higher score = worse quality
  let penalty = 0;

  if (s.includes('thumbnail') || s.includes('/thumbnail') || s.includes('thumb')) penalty += 50;
  if (s.includes('small') || s.includes('tiny')) penalty += 20;

  // common resize params in query strings
  if (s.includes('width=') || s.includes('w=') || s.includes('height=') || s.includes('h=')) penalty += 15;
  if (s.includes('resize') || s.includes('resized') || s.includes('fit=')) penalty += 15;

  // sometimes CDNs label large explicitly
  if (s.includes('large') || s.includes('full')) penalty -= 10;

  return penalty;
}

function uniqPhotoUrlsPreferLarge(urls: string[]) {
  const cleaned = urls.map((u) => safeStr(u)).filter(Boolean) as string[];
  // Prefer higher quality first (lower penalty first)
  cleaned.sort((a, b) => photoQualityRank(a) - photoQualityRank(b));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of cleaned) {
    const key = canonicalPhotoKey(u);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

function extractPhotoUrlsFromRawPayload(raw: any): string[] {
  const rp = raw ?? {};

  const buckets: any[] = [];

  if (Array.isArray(rp.PhotoUrls)) buckets.push(rp.PhotoUrls);
  if (Array.isArray(rp.photoUrls)) buckets.push(rp.photoUrls);
  if (Array.isArray(rp.Photos)) buckets.push(rp.Photos);
  if (Array.isArray(rp.photos)) buckets.push(rp.photos);
  if (Array.isArray(rp.Media)) buckets.push(rp.Media);
  if (Array.isArray(rp.media)) buckets.push(rp.media);

  const urls: string[] = [];

  for (const b of buckets) {
    for (const item of b) {
      if (typeof item === 'string') {
        urls.push(item);
        continue;
      }
      if (item && typeof item === 'object') {
        urls.push(
          item.Url,
          item.url,
          item.MediaURL,
          item.MediaUrl,
          item.mediaUrl,
          item.mediaURL,
          item.Uri,
          item.uri,
          item.LargeUrl,
          item.largeUrl
        );
      }
    }
  }

  // Primary + thumb fallbacks
  urls.push(rp.PrimaryPhotoUrl, rp.primaryPhotoUrl, rp.ThumbnailUrl, rp.thumbnailUrl);

  // FIX: use canonical de-dupe
  return uniqPhotoUrlsPreferLarge(urls.filter(Boolean) as string[]);
}

const MATCHES_RESTORE_KEY = 'hayvnre:matches:restore';

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();

  const recId = (params?.id as string) || '';

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [rec, setRec] = useState<RecommendationRow | null>(null);

  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [rawPhotos, setRawPhotos] = useState<string[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  const [actionBusy, setActionBusy] = useState(false);

  const [agentNote, setAgentNote] = useState<string>('');
  const [noteDirty, setNoteDirty] = useState(false);

  const listing = rec?.mls_listings ?? null;

  const goBackToMatches = () => {
    router.push('/matches');
  };

  // Prefer table photos; only fall back to raw if table is empty
  // FIX: canonical de-dupe here too (table may also include size variants)
  const allPhotoUrls = useMemo(() => {
    const fromTable = photos.map((p) => p.url).filter(Boolean) as string[];
    if (fromTable.length > 0) return uniqPhotoUrlsPreferLarge(fromTable);
    return uniqPhotoUrlsPreferLarge(rawPhotos);
  }, [photos, rawPhotos]);

  const hasPhotos = allPhotoUrls.length > 0;
  const canPrev = hasPhotos && activePhotoIdx > 0;
  const canNext = hasPhotos && activePhotoIdx < allPhotoUrls.length - 1;

  const goPrev = () => {
    if (!canPrev) return;
    setActivePhotoIdx((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canNext) return;
    setActivePhotoIdx((i) => Math.min(allPhotoUrls.length - 1, i + 1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPrev, canNext, allPhotoUrls.length]);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (startX == null || startY == null) return;

    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) < 40) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.75) return;

    if (dx > 0) goPrev();
    else goNext();
  };

  const primaryPhotoUrl = useMemo(() => {
    if (!hasPhotos) return null;
    return allPhotoUrls[activePhotoIdx] ?? null;
  }, [hasPhotos, allPhotoUrls, activePhotoIdx]);

  const derivedBeds = useMemo(() => {
    if (!listing) return null;
    if (listing.beds != null) return listing.beds;
    const rp = listing.raw_payload || {};
    return toNum(rp?.BedroomsTotal) ?? toNum(rp?.BedroomsTotalInteger) ?? toNum(rp?.BedsTotal) ?? null;
  }, [listing]);

  const derivedBaths = useMemo(() => {
    if (!listing) return null;
    if (listing.baths != null) return listing.baths;
    const rp = listing.raw_payload || {};
    return (
      toNum(rp?.BathroomsTotalInteger) ??
      toNum(rp?.BathroomsTotal) ??
      toNum(rp?.BathsTotal) ??
      null
    );
  }, [listing]);

  const derivedSqft = useMemo(() => {
    if (!listing) return null;
    if (listing.sqft != null) return listing.sqft;
    const rp = listing.raw_payload || {};
    return (
      toNum(rp?.LivingArea) ??
      toNum(rp?.BuildingAreaTotal) ??
      toNum(rp?.LivingAreaSquareFeet) ??
      null
    );
  }, [listing]);

  const derivedYear = useMemo(() => {
    if (!listing) return null;
    if (listing.year_built != null) return listing.year_built;
    const rp = listing.raw_payload || {};
    return toNum(rp?.YearBuilt) ?? null;
  }, [listing]);

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
        setAuthError('You must be signed in as an agent to view this match.');
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

      setAgent({
        id: agentRow.id,
        brokerage_id: agentRow.brokerage_id ?? null,
      });

      const { data: recRow, error: recErr } = await supabase
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
          agent_note,
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
        .eq('id', recId)
        .maybeSingle();

      if (recErr) {
        setError(recErr.message);
        setLoading(false);
        return;
      }

      if (!recRow) {
        setError('Match not found.');
        setLoading(false);
        return;
      }

      const typed = recRow as any as RecommendationRow;
      setRec(typed);

      setAgentNote((typed as any)?.agent_note ?? '');
      setNoteDirty(false);

      // Photos from table
      const listingId = typed?.mls_listings?.id;
      if (listingId) {
        const { data: photoRows, error: photoErr } = await supabase
          .from('mls_listing_photos')
          .select('id, listing_id, sort_order, url, caption, created_at')
          .eq('listing_id', listingId)
          .order('sort_order', { ascending: true })
          .limit(200);

        if (photoErr) {
          console.warn('Photo load error:', photoErr.message);
          setPhotos([]);
        } else {
          setPhotos((photoRows ?? []) as PhotoRow[]);
        }
      } else {
        setPhotos([]);
      }

      // Photos from raw_payload fallback
      const rp = typed?.mls_listings?.raw_payload;
      setRawPhotos(extractPhotoUrlsFromRawPayload(rp));

      setActivePhotoIdx(0);
      setLoading(false);
    };

    if (recId) load();
  }, [recId]);

  const persistNoteToRecommendation = async (nextStatus?: 'new' | 'attached' | 'dismissed') => {
    if (!rec) return { ok: false as const, error: 'Missing recommendation.' };
    const updates: any = { agent_note: agentNote ?? '' };
    if (nextStatus) updates.status = nextStatus;

    const { error } = await supabase
      .from('property_recommendations')
      .update(updates)
      .eq('id', rec.id);

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  };

  const handleDismiss = async () => {
    if (!rec) return;
    if (rec.status !== 'new') return;

    setActionBusy(true);
    setError(null);

    const res = await persistNoteToRecommendation('dismissed');
    if (!res.ok) {
      setError(res.error);
      setActionBusy(false);
      return;
    }

    setRec((prev) => (prev ? { ...prev, status: 'dismissed', agent_note: agentNote } : prev));
    setActionBusy(false);

    router.push('/matches');
  };

  const handleAttach = async () => {
    if (!rec || !listing) return;
    if (rec.status !== 'new') return;

    setActionBusy(true);
    setError(null);

    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('id, brokerage_id')
      .eq('id', rec.client_id)
      .maybeSingle();

    if (clientErr) {
      setError(clientErr.message);
      setActionBusy(false);
      return;
    }

    const brokerage_id = (clientRow as any)?.brokerage_id ?? agent?.brokerage_id ?? null;

    if (!brokerage_id) {
      setError('Attach failed: client/agent is not linked to a brokerage_id.');
      setActionBusy(false);
      return;
    }

    const address = buildStreetAddress(listing);

    const bestPhotoUrl =
      allPhotoUrls?.[0] ??
      listing?.raw_payload?.PrimaryPhotoUrl ??
      listing?.raw_payload?.primaryPhotoUrl ??
      listing?.raw_payload?.ThumbnailUrl ??
      listing?.raw_payload?.thumbnailUrl ??
      null;

    const { data: propRows, error: propErr } = await supabase
      .from('properties')
      .upsert(
        {
          brokerage_id,
          agent_id: agent?.id ?? null,

          mls_id: listing.mls_number,
          address,
          city: listing.city ?? '',
          state: listing.state ?? '',
          zip: listing.postal_code ?? '',

          list_price: listing.list_price,
          beds: derivedBeds,
          baths: derivedBaths,
          sqft: derivedSqft,
          lot_sqft: listing.lot_sqft ?? null,
          year_built: derivedYear,

          property_type: listing.property_type ?? null,
          status: listing.status ?? null,
          pipeline_stage: 'suggested',

          primary_photo_url: bestPhotoUrl,
        },
        { onConflict: 'brokerage_id,mls_id' as any }
      )
      .select('id')
      .limit(1);

    if (propErr) {
      setError(propErr.message || 'Could not create/update property.');
      setActionBusy(false);
      return;
    }

    const propertyId = (propRows as any)?.[0]?.id as string | undefined;
    if (!propertyId) {
      setError('Could not resolve property id for attach.');
      setActionBusy(false);
      return;
    }

    const { error: cpErr } = await supabase
      .from('client_properties')
      .upsert(
        {
          client_id: rec.client_id,
          property_id: propertyId,
          relationship: 'recommended',
          interest_level: null,
          is_favorite: false,
          client_feedback: null,
          client_rating: null,
          agent_notes: agentNote ?? null,
        } as any,
        { onConflict: 'client_id,property_id' as any }
      );

    if (cpErr) {
      setError(cpErr.message || 'Could not attach property to client.');
      setActionBusy(false);
      return;
    }

    const res = await persistNoteToRecommendation('attached');
    if (!res.ok) {
      setError(`Attached, but could not update recommendation: ${res.error}`);
      setActionBusy(false);
      return;
    }

    setRec((prev) => (prev ? { ...prev, status: 'attached', agent_note: agentNote } : prev));
    setActionBusy(false);

    router.push('/matches');
  };

  const reasons = normalizeReasons(rec?.reasons);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Match Detail
            </h1>
            <p className="text-sm text-slate-300">
              Review photos + details, then attach to the client.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" className="text-xs sm:text-sm" onClick={goBackToMatches}>
              ← Back
            </Button>
          </div>
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

        {!authError && !loading && rec && listing && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Photos */}
            <Card className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white truncate">
                    <span className="text-[#EBD27A]">{buildStreetAddress(listing)}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {(listing.city ?? '—') +
                      (listing.state ? `, ${listing.state}` : '') +
                      (listing.postal_code ? ` ${listing.postal_code}` : '')}
                    {listing.mls_number ? (
                      <>
                        {' '}
                        • <span className="font-mono">MLS #{listing.mls_number}</span>
                      </>
                    ) : null}
                    {allPhotoUrls.length > 0 ? (
                      <>
                        {' '}
                        • <span className="text-slate-500">
                          {activePhotoIdx + 1}/{allPhotoUrls.length} photos
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <span className="inline-flex items-center rounded-full border border-[#EBD27A]/30 bg-[#EBD27A]/10 px-2 py-0.5 text-[11px] text-[#EBD27A] shrink-0">
                  {scoreLabel(rec.score)} • {rec.score}
                </span>
              </div>

              <div
                className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden relative"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                {primaryPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primaryPhotoUrl}
                    alt="Property photo"
                    className="w-full h-[280px] sm:h-[420px] object-cover select-none"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-[280px] sm:h-[420px] flex items-center justify-center text-sm text-slate-400">
                    No photo available yet.
                  </div>
                )}

                {allPhotoUrls.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      disabled={!canPrev}
                      className={[
                        'absolute left-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs',
                        'backdrop-blur bg-black/40',
                        canPrev
                          ? 'border-white/20 text-slate-100 hover:bg-black/55'
                          : 'border-white/10 text-slate-500 opacity-60 cursor-not-allowed',
                      ].join(' ')}
                      aria-label="Previous photo"
                      title="Previous (←)"
                    >
                      ←
                    </button>

                    <button
                      type="button"
                      onClick={goNext}
                      disabled={!canNext}
                      className={[
                        'absolute right-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs',
                        'backdrop-blur bg-black/40',
                        canNext
                          ? 'border-white/20 text-slate-100 hover:bg-black/55'
                          : 'border-white/10 text-slate-500 opacity-60 cursor-not-allowed',
                      ].join(' ')}
                      aria-label="Next photo"
                      title="Next (→)"
                    >
                      →
                    </button>
                  </>
                )}
              </div>

              {allPhotoUrls.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allPhotoUrls.slice(0, 60).map((url, idx) => {
                    const active = idx === activePhotoIdx;
                    return (
                      <button
                        key={`${url}-${idx}`}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={[
                          'shrink-0 rounded-xl overflow-hidden border transition',
                          active
                            ? 'border-[#EBD27A]/60 bg-[#EBD27A]/10'
                            : 'border-white/10 bg-black/40 hover:border-white/25',
                        ].join(' ')}
                        aria-label={`View photo ${idx + 1}`}
                        title={`Photo ${idx + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Photo ${idx + 1}`} className="h-16 w-24 object-cover" draggable={false} />
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="text-[11px] text-slate-500">
                {fmtDate(rec.created_at) ? `Generated: ${fmtDate(rec.created_at)}` : null}
                {listing.last_seen_at && fmtDate(listing.last_seen_at)
                  ? ` • Last seen: ${fmtDate(listing.last_seen_at)}`
                  : null}
                {allPhotoUrls.length > 1 ? ' • Tip: swipe or use ← → keys' : null}
              </div>
            </Card>

            {/* Details + actions */}
            <Card className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={[
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]',
                    rec.status === 'attached'
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : rec.status === 'dismissed'
                      ? 'border-red-400/30 bg-red-400/10 text-red-200'
                      : 'border-white/15 bg-white/5 text-slate-200',
                  ].join(' ')}
                >
                  {rec.status === 'attached'
                    ? 'Attached'
                    : rec.status === 'dismissed'
                    ? 'Dismissed'
                    : 'New'}
                </span>

                {listing.property_type ? (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">
                    {listing.property_type}
                  </span>
                ) : null}

                {listing.status ? (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">
                    {listing.status}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Price" value={formatCurrency(listing.list_price)} />
                <Info
                  label="Beds / Baths"
                  value={
                    derivedBeds != null || derivedBaths != null
                      ? `${derivedBeds ?? '—'} bd / ${derivedBaths ?? '—'} ba`
                      : '—'
                  }
                />
                <Info label="Sqft" value={derivedSqft != null ? Number(derivedSqft).toLocaleString() : '—'} />
                <Info label="Year" value={derivedYear != null ? String(derivedYear) : '—'} />
              </div>

              {reasons.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-slate-300">Why this match</div>
                  <div className="flex flex-wrap gap-2">
                    {reasons.slice(0, 10).map((r, idx) => (
                      <span
                        key={`reason-${idx}`}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1 pt-1">
                <div className="text-[11px] font-medium text-slate-300">
                  Agent notes <span className="text-slate-500">(saved; shown to client when attached)</span>
                </div>
                <textarea
                  value={agentNote}
                  onChange={(e) => {
                    setAgentNote(e.target.value);
                    setNoteDirty(true);
                  }}
                  placeholder="Example: Great layout + within budget. Close to preferred area. Worth a tour."
                  className="w-full min-h-[110px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
                {noteDirty ? (
                  <div className="text-[11px] text-slate-500">Note will be saved when you Attach or Dismiss.</div>
                ) : null}
              </div>

              <div className="pt-2 space-y-2">
                <Button className="w-full" onClick={handleAttach} disabled={actionBusy || rec.status !== 'new'}>
                  {actionBusy ? 'Working…' : 'Attach to client'}
                </Button>

                <Button variant="secondary" className="w-full" onClick={handleDismiss} disabled={actionBusy || rec.status !== 'new'}>
                  {actionBusy ? 'Working…' : 'Dismiss'}
                </Button>

                <div className="text-[11px] text-slate-500">
                  Client ID: <span className="font-mono">{rec.client_id}</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {!authError && !loading && rec && !listing && (
          <Card>
            <p className="text-sm text-slate-300">
              Listing details are missing for this match. Try refreshing recommendations.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

