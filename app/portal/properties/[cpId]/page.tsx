// app/portal/properties/[cpId]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ListingPhotoCarousel } from '../../../components/ListingPhotoCarousel';

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string | null;
  mls_id: string | null;
  mls_url: string | null;
  primary_photo_url: string | null;
};

type ClientProperty = {
  id: string;
  client_id: string;
  property_id: string;
  relationship: string | null;
  interest_level: string | null;
  is_favorite: boolean;
  client_feedback: string | null;
  client_rating: number | null;
  property: Property | null;
};

type MlsListing = {
  id: string; // mls_listings.id
  mls_number: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  list_price: number | null;
  raw_payload: any;
};

type PhotoRow = {
  id: string;
  listing_id: string;
  sort_order: number | null;
  url: string;
  caption: string | null;
  created_at: string;
};

function toNum(val: any): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export default function PortalPropertyDetailPage() {
  const params = useParams();
  const cpId = params?.cpId as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [cp, setCp] = useState<ClientProperty | null>(null);

  // Inline edit state (same fields as list page)
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // MLS photo support
  const [mlsListing, setMlsListing] = useState<MlsListing | null>(null);
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([]);

  useEffect(() => {
    if (!cpId) return;

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

      if (sessionError || !session) {
        setAuthError('You need to be signed in to view this home.');
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

      // 2) Find all client ids mapped to this email (authorization boundary)
      const { data: clientRows, error: clientError } = await supabase
        .from('clients')
        .select('id, email')
        .eq('email', email);

      if (clientError) {
        console.error('Portal detail: client lookup error', clientError);
        setLoadError('Could not load this home.');
        setLoading(false);
        return;
      }

      const clientIds = (clientRows || []).map((r: any) => r.id as string);
      if (clientIds.length === 0) {
        setLoadError(
          'No client profile found for your email. Ask your agent to add you.'
        );
        setLoading(false);
        return;
      }

      // 3) Load cp row + property
      const { data: cpRow, error: cpError } = await supabase
        .from('client_properties')
        .select(
          `
          id,
          client_id,
          property_id,
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
            zip,
            list_price,
            property_type,
            pipeline_stage,
            mls_id,
            mls_url,
            primary_photo_url
          )
        `
        )
        .eq('id', cpId)
        .maybeSingle();

      if (cpError) {
        console.error('Portal detail: cp load error', cpError);
        setLoadError('Could not load this home.');
        setLoading(false);
        return;
      }

      if (!cpRow) {
        setLoadError('Home not found.');
        setLoading(false);
        return;
      }

      // 4) Authorization: cp must belong to one of the clientIds for this email
      if (!clientIds.includes(cpRow.client_id as string)) {
        setAuthError('You do not have access to this home.');
        setLoading(false);
        return;
      }

      // Supabase sometimes returns joined rows as an object OR an array.
// Normalize to "one property row or null" first.
const pRaw = Array.isArray((cpRow as any).properties)
  ? (cpRow as any).properties[0]
  : (cpRow as any).properties;

const prop: Property | null = pRaw
  ? {
      id: String(pRaw.id),
      address: String(pRaw.address),
      city: (pRaw.city ?? null) as string | null,
      state: (pRaw.state ?? null) as string | null,
      zip: (pRaw.zip ?? null) as string | null,
      list_price: (pRaw.list_price ?? null) as number | null,
      property_type: (pRaw.property_type ?? null) as string | null,
      pipeline_stage: (pRaw.pipeline_stage ?? null) as string | null,
      mls_id: (pRaw.mls_id ?? null) as string | null,
      mls_url: (pRaw.mls_url ?? null) as string | null,
      primary_photo_url: (pRaw.primary_photo_url ?? null) as string | null,
    }
  : null;


      const mapped: ClientProperty = {
        id: cpRow.id as string,
        client_id: cpRow.client_id as string,
        property_id: cpRow.property_id as string,
        relationship: (cpRow.relationship as string | null) ?? null,
        interest_level: (cpRow.interest_level as string | null) ?? null,
        is_favorite: !!cpRow.is_favorite,
        client_feedback: (cpRow.client_feedback as string | null) ?? null,
        client_rating:
          typeof cpRow.client_rating === 'number' ? cpRow.client_rating : null,
        property: prop,
      };

      setCp(mapped);

      // seed edit state
      setFeedback(mapped.client_feedback ?? '');
      setRating(mapped.client_rating ?? '');
      setIsFavorite(mapped.is_favorite);

      // 5) MLS listing + photos (same approach as your agent page)
      if (prop?.mls_id) {
        const { data: listingRow, error: lErr } = await supabase
          .from('mls_listings')
          .select(
            `
            id,
            mls_number,
            beds,
            baths,
            sqft,
            year_built,
            list_price,
            raw_payload
          `
          )
          .eq('mls_number', prop.mls_id)
          .maybeSingle();

        if (lErr) {
          console.warn('Portal detail: MLS listing lookup error', lErr.message);
          setMlsListing(null);
          setPhotoRows([]);
        } else {
          const typed = (listingRow as any as MlsListing) ?? null;
          setMlsListing(typed);

          if (typed?.id) {
            const { data: rows, error: photoErr } = await supabase
              .from('mls_listing_photos')
              .select('id, listing_id, sort_order, url, caption, created_at')
              .eq('listing_id', typed.id)
              .order('sort_order', { ascending: true })
              .limit(200);

            if (photoErr) {
              console.warn('Portal detail: MLS photos error', photoErr.message);
              setPhotoRows([]);
            } else {
              setPhotoRows((rows ?? []) as PhotoRow[]);
            }
          } else {
            setPhotoRows([]);
          }
        }
      } else {
        setMlsListing(null);
        setPhotoRows([]);
      }

      setLoading(false);
    };

    load();
  }, [cpId]);

  const derivedBeds = useMemo(() => {
    if (mlsListing?.beds != null) return mlsListing.beds;
    const rp = mlsListing?.raw_payload ?? null;
    return rp
      ? toNum(rp?.BedroomsTotal) ??
          toNum(rp?.BedroomsTotalInteger) ??
          toNum(rp?.BedsTotal) ??
          null
      : null;
  }, [mlsListing]);

  const derivedBaths = useMemo(() => {
    if (mlsListing?.baths != null) return mlsListing.baths;
    const rp = mlsListing?.raw_payload ?? null;
    return rp
      ? toNum(rp?.BathroomsTotalInteger) ??
          toNum(rp?.BathroomsTotal) ??
          toNum(rp?.BathsTotal) ??
          null
      : null;
  }, [mlsListing]);

  const derivedSqft = useMemo(() => {
    if (mlsListing?.sqft != null) return mlsListing.sqft;
    const rp = mlsListing?.raw_payload ?? null;
    return rp
      ? toNum(rp?.LivingArea) ??
          toNum(rp?.BuildingAreaTotal) ??
          toNum(rp?.LivingAreaSquareFeet) ??
          null
      : null;
  }, [mlsListing]);

  const derivedYear = useMemo(() => {
    if (mlsListing?.year_built != null) return mlsListing.year_built;
    const rp = mlsListing?.raw_payload ?? null;
    return rp ? toNum(rp?.YearBuilt) ?? null : null;
  }, [mlsListing]);

  const formatCurrency = (value: number | null) =>
    value == null ? '—' : `$${value.toLocaleString()}`;

  const handleSave = async () => {
    if (!cp) return;
    setSaveError(null);
    setSaveSuccess(null);

    const trimmed = feedback.trim();
    const raw = rating;
    const n = raw === '' || raw == null ? null : Number(raw);

    if (n != null && (n < 1 || n > 5)) {
      setSaveError('Rating must be between 1 and 5.');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('client_properties')
      .update({
        client_feedback: trimmed || null,
        client_rating: n,
        is_favorite: !!isFavorite,
      })
      .eq('id', cp.id);

    if (error) {
      console.error('Portal detail save error:', error);
      setSaveError(error.message || 'Could not save your changes.');
      setSaving(false);
      return;
    }

    setCp((prev) =>
      prev
        ? {
            ...prev,
            client_feedback: trimmed || null,
            client_rating: n,
            is_favorite: !!isFavorite,
          }
        : prev
    );

    setSaving(false);
    setSaveSuccess('Saved.');
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs sm:text-sm text-slate-300 hover:text-slate-50 hover:underline"
          >
            ← Back
          </button>

          <div className="flex items-center gap-2">
            <Link
              href="/portal/properties"
              className="text-xs sm:text-sm text-slate-300 hover:text-slate-50 hover:underline"
            >
              Review queue
            </Link>
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200">
              Home detail
            </span>
          </div>
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

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-200">
            Loading…
          </div>
        )}

        {authError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {authError}
          </div>
        )}

        {!authError && loadError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {loadError}
          </div>
        )}

        {!loading && !authError && !loadError && cp?.property && (
          <>
            {/* Hero + photos (client-safe) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3 lg:col-span-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-white truncate">
                      <span className="text-[#EBD27A]">
                        {cp.property.address}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {cp.property.city || '—'}
                      {cp.property.state ? `, ${cp.property.state}` : ''}
                      {cp.property.zip ? ` ${cp.property.zip}` : ''}
                      {cp.property.mls_id ? (
                        <>
                          {' '}
                          • <span className="font-mono">MLS #{cp.property.mls_id}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {cp.property.pipeline_stage ? (
                    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200 shrink-0">
                      {cp.property.pipeline_stage}
                    </span>
                  ) : null}
                </div>

                <ListingPhotoCarousel
                  photoRows={photoRows}
                  rawPayload={mlsListing?.raw_payload ?? null}
                  fallbackUrls={
                    [cp.property.primary_photo_url ?? null].filter(Boolean) as string[]
                  }
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3 lg:col-span-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {cp.property.property_type ? (
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">
                      {cp.property.property_type}
                    </span>
                  ) : null}

                  {cp.property.mls_url ? (
                    <a
                      href={cp.property.mls_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-[#EBD27A]/30 bg-[#EBD27A]/10 px-2 py-0.5 text-[11px] text-[#EBD27A]"
                    >
                      Open in MLS →
                    </a>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info
                    label="List price"
                    value={formatCurrency(
                      cp.property.list_price ?? mlsListing?.list_price ?? null
                    )}
                  />
                  <Info
                    label="Beds / Baths"
                    value={
                      derivedBeds != null || derivedBaths != null
                        ? `${derivedBeds ?? '—'} bd / ${derivedBaths ?? '—'} ba`
                        : '—'
                    }
                  />
                  <Info
                    label="Sqft"
                    value={derivedSqft != null ? Number(derivedSqft).toLocaleString() : '—'}
                  />
                  <Info
                    label="Year"
                    value={derivedYear != null ? String(derivedYear) : '—'}
                  />
                </div>

                {(cp.relationship || cp.interest_level) && (
                  <div className="text-xs text-slate-400 pt-1">
                    {cp.relationship ? `Relationship: ${cp.relationship}` : ''}
                    {cp.interest_level ? ` • ${cp.interest_level}` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Your feedback */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Your feedback
                  </h2>
                  <p className="text-xs text-slate-400">
                    This goes to your agent so they can learn your taste and move faster.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFavorite((v) => !v)}
                  className={[
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] shrink-0',
                    isFavorite
                      ? 'border-[#EBD27A] bg-[#EBD27A]/10 text-[#EBD27A]'
                      : 'border-white/15 bg-black/40 text-slate-200 hover:bg-white/10',
                  ].join(' ')}
                >
                  {isFavorite ? '★ Favorite' : '☆ Mark favorite'}
                </button>
              </div>

              {saveError && <p className="text-sm text-red-300">{saveError}</p>}
              {saveSuccess && (
                <p className="text-sm text-emerald-300">{saveSuccess}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)] gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-200">
                    What did you think of this home?
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
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
                      value={rating}
                      onChange={(e) =>
                        setRating(e.target.value === '' ? '' : Number(e.target.value))
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
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg bg-[#EBD27A] text-black text-xs font-medium hover:bg-[#f3e497] disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save feedback'}
                  </button>
                </div>
              </div>
            </div>
          </>
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

