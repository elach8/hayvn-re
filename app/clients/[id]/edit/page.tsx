// app/clients/[id]/edit/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  client_type: string | null;
  stage: string | null;

  // buyer fields
  budget_min: number | null;
  budget_max: number | null;
  preferred_locations: string | null;

  notes: string | null;

  // requirements fields
  min_beds: number | null;
  min_baths: number | null;

  // seller fields
  seller_target: number | null;
  seller_property_address: string | null;
  seller_city: string | null;
  seller_state: string | null;
  seller_zip: string | null;
  seller_timeline: string | null;
  seller_listing_status: string | null;
};

type CriteriaChangeRow = {
  id: string;
  client_id: string;
  status: 'pending' | 'accepted' | 'rejected' | string;
  changes: Record<string, { from: any; to: any }> | null;
  created_at: string | null;
};

const STAGES = ['lead', 'active', 'under_contract', 'past', 'lost'] as const;
const TYPES = ['buyer', 'seller', 'both'] as const;

// keep in sync with your enum values (seller_listing_status_enum)
const SELLER_LISTING_STATUSES = ['prep', 'coming_soon', 'active', 'pending', 'sold', 'off_market'] as const;

const LOCATION_SUGGESTIONS = [
  'Irvine',
  'Newport Beach',
  'Costa Mesa',
  'Huntington Beach',
  'Tustin',
  'Lake Forest',
  'Laguna Beach',
  'San Clemente',
  'Manhattan Beach',
  'Redondo Beach',
  'Santa Monica',
  'Culver City',
] as const;

function normalizeToken(s: string) {
  return s.trim().replace(/\s+/g, ' ');
}

function parseLocations(raw: string | null) {
  if (!raw) return [] as string[];
  return raw
    .split(',')
    .map((x) => normalizeToken(x))
    .filter(Boolean);
}

function toCommaList(tokens: string[]) {
  return tokens
    .map((t) => normalizeToken(t))
    .filter(Boolean)
    .join(', ');
}

export default function EditClientPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const changeId = searchParams?.get('change');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Criteria change request context
  const [changeRow, setChangeRow] = useState<CriteriaChangeRow | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectedFlash, setRejectedFlash] = useState(false);

  // Fields
  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<(typeof TYPES)[number]>('buyer');
  const [stage, setStage] = useState<(typeof STAGES)[number]>('lead');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Buyer fields
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [minBeds, setMinBeds] = useState('');
  const [minBaths, setMinBaths] = useState('');

  // Locations
  const [locationTokens, setLocationTokens] = useState<string[]>([]);
  const [customLocation, setCustomLocation] = useState('');

  // Shared notes (buyer + seller)
  const [notes, setNotes] = useState('');

  // Seller fields
  const [sellerAddress, setSellerAddress] = useState('');
  const [sellerCity, setSellerCity] = useState('');
  const [sellerState, setSellerState] = useState('');
  const [sellerZip, setSellerZip] = useState('');
  const [sellerTarget, setSellerTarget] = useState('');
  const [sellerTimeline, setSellerTimeline] = useState('');
  const [sellerListingStatus, setSellerListingStatus] = useState<(typeof SELLER_LISTING_STATUSES)[number] | ''>('');

  const isBuyer = clientType === 'buyer' || clientType === 'both';
  const isSeller = clientType === 'seller' || clientType === 'both';

  const toNumberOrNull = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  };

  const toIntOrNull = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  };

  const selectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of locationTokens) s.add(t.toLowerCase());
    return s;
  }, [locationTokens]);

  const toggleSuggested = (label: string) => {
    const key = label.toLowerCase();
    setLocationTokens((prev) => {
      const exists = prev.some((p) => p.toLowerCase() === key);
      if (exists) return prev.filter((p) => p.toLowerCase() !== key);
      return [...prev, label];
    });
  };

  const addCustomLocation = () => {
    const token = normalizeToken(customLocation);
    if (!token) return;

    const key = token.toLowerCase();
    setLocationTokens((prev) => {
      const exists = prev.some((p) => p.toLowerCase() === key);
      return exists ? prev : [...prev, token];
    });

    setCustomLocation('');
  };

  const removeLocation = (token: string) => {
    const key = token.toLowerCase();
    setLocationTokens((prev) => prev.filter((p) => p.toLowerCase() !== key));
  };

  const changedFields = useMemo(() => {
    const ch = changeRow?.changes || null;
    if (!ch) return [] as string[];
    return Object.keys(ch);
  }, [changeRow]);

  // ✅ Matches "new client" seller section layout (light card within, same input sizing & grouping)
  const sellerNotesBackCompat = useMemo(() => {
    const raw = (notes || '').toString();
    const pick = (label: string) => {
      const re = new RegExp(String.raw`^\s*-\s*${label}\s*:\s*(.+)\s*$`, 'mi');
      const m = raw.match(re);
      return m?.[1]?.trim() || '';
    };
    return {
      goals: pick('Seller goals'),
      showings: pick('Showing constraints'),
    };
  }, [notes]);

  // Load client + optional change request
  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setChangeError(null);
      setRejectedFlash(false);

      const { data, error } = await supabase
        .from('clients')
        .select(
          [
            'id',
            'name',
            'email',
            'phone',
            'client_type',
            'stage',
            'budget_min',
            'budget_max',
            'preferred_locations',
            'notes',
            'min_beds',
            'min_baths',
            'seller_target',
            'seller_property_address',
            'seller_city',
            'seller_state',
            'seller_zip',
            'seller_timeline',
            'seller_listing_status',
          ].join(','),
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error loading client:', error);
        setLoadError(error.message);
        setLoading(false);
        return;
      }

      const c = data as Client | null;
      if (!c) {
        setLoadError('Client not found.');
        setLoading(false);
        return;
      }

      // base values
      setName(c.name ?? '');
      setClientType(((c.client_type as any) || 'buyer') as any);
      setStage(((c.stage as any) || 'lead') as any);
      setEmail(c.email ?? '');
      setPhone(c.phone ?? '');

      // buyer hydration
      setBudgetMin(c.budget_min != null ? String(c.budget_min) : '');
      setBudgetMax(c.budget_max != null ? String(c.budget_max) : '');
      setLocationTokens(parseLocations(c.preferred_locations));
      setMinBeds(c.min_beds != null ? String(c.min_beds) : '');
      setMinBaths(c.min_baths != null ? String(c.min_baths) : '');

      // shared notes
      setNotes(c.notes ?? '');

      // seller hydration
      setSellerAddress(c.seller_property_address ?? '');
      setSellerCity(c.seller_city ?? '');
      setSellerState(c.seller_state ?? '');
      setSellerZip(c.seller_zip ?? '');
      setSellerTarget(c.seller_target != null ? String(c.seller_target) : '');
      setSellerTimeline(c.seller_timeline ?? '');
      setSellerListingStatus((c.seller_listing_status as any) ?? '');

      // Load change request (if any)
      if (changeId) {
        try {
          const { data: changeData, error: changeErr } = await supabase
            .from('client_criteria_changes')
            .select('id, client_id, status, changes, created_at')
            .eq('id', changeId)
            .maybeSingle();

          if (changeErr) throw changeErr;

          const row = (changeData as any) as CriteriaChangeRow | null;
          if (!row) {
            setChangeError('Change request not found.');
          } else if (row.client_id !== id) {
            setChangeError('This change request does not match the current client.');
          } else {
            setChangeRow(row);

            const ch = row.changes || {};
            const toVal = (key: string) => (ch as any)?.[key]?.to;

            if (toVal('name') != null) setName(String(toVal('name') ?? ''));
            if (toVal('client_type') != null) setClientType(String(toVal('client_type')) as any);
            if (toVal('stage') != null) setStage(String(toVal('stage')) as any);
            if (toVal('email') != null) setEmail(String(toVal('email') ?? ''));
            if (toVal('phone') != null) setPhone(String(toVal('phone') ?? ''));

            if (toVal('budget_min') !== undefined) {
              const v = toVal('budget_min');
              setBudgetMin(v == null ? '' : String(v));
            }
            if (toVal('budget_max') !== undefined) {
              const v = toVal('budget_max');
              setBudgetMax(v == null ? '' : String(v));
            }

            if (toVal('min_beds') !== undefined) {
              const v = toVal('min_beds');
              setMinBeds(v == null ? '' : String(v));
            }
            if (toVal('min_baths') !== undefined) {
              const v = toVal('min_baths');
              setMinBaths(v == null ? '' : String(v));
            }

            if (toVal('preferred_locations') !== undefined) {
              const v = toVal('preferred_locations');
              setLocationTokens(parseLocations(v == null ? null : String(v)));
            }

            if (toVal('seller_target') !== undefined) {
              const v = toVal('seller_target');
              setSellerTarget(v == null ? '' : String(v));
            }
            if (toVal('seller_property_address') !== undefined) {
              const v = toVal('seller_property_address');
              setSellerAddress(v == null ? '' : String(v));
            }
            if (toVal('seller_city') !== undefined) {
              const v = toVal('seller_city');
              setSellerCity(v == null ? '' : String(v));
            }
            if (toVal('seller_state') !== undefined) {
              const v = toVal('seller_state');
              setSellerState(v == null ? '' : String(v));
            }
            if (toVal('seller_zip') !== undefined) {
              const v = toVal('seller_zip');
              setSellerZip(v == null ? '' : String(v));
            }
            if (toVal('seller_timeline') !== undefined) {
              const v = toVal('seller_timeline');
              setSellerTimeline(v == null ? '' : String(v));
            }
            if (toVal('seller_listing_status') !== undefined) {
              const v = toVal('seller_listing_status');
              setSellerListingStatus(v == null ? '' : (String(v) as any));
            }

            if (toVal('notes') !== undefined) {
              const v = toVal('notes');
              setNotes(v == null ? '' : String(v));
            }
          }
        } catch (e: any) {
          console.error('Error loading criteria change request:', e);
          setChangeError(e?.message || 'Could not load criteria change request.');
        }
      } else {
        setChangeRow(null);
      }

      setLoading(false);
    };

    load();
  }, [id, changeId]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSavedFlash(false);

    if (!name.trim()) {
      setSaveError('Name is required.');
      return;
    }

    // Buyer validation
    const min = toNumberOrNull(budgetMin);
    const max = toNumberOrNull(budgetMax);
    if (isBuyer && min != null && max != null && min > max) {
      setSaveError('Budget Min cannot be greater than Budget Max.');
      return;
    }

    const beds = isBuyer ? toIntOrNull(minBeds) : null;
    const baths = isBuyer ? toIntOrNull(minBaths) : null;

    // Seller values
    const sellerTargetNum = isSeller ? toNumberOrNull(sellerTarget) : null;

    setSaving(true);

    const payload = {
      name: name.trim(),
      client_type: clientType,
      stage,
      email: email.trim() || null,
      phone: phone.trim() || null,

      // buyer fields (null them if not buyer)
      budget_min: isBuyer ? min : null,
      budget_max: isBuyer ? max : null,
      min_beds: isBuyer ? beds : null,
      min_baths: isBuyer ? baths : null,
      preferred_locations: isBuyer ? (locationTokens.length ? toCommaList(locationTokens) : null) : null,

      // seller fields (null them if not seller)
      seller_target: sellerTargetNum,
      seller_property_address: isSeller ? (sellerAddress.trim() || null) : null,
      seller_city: isSeller ? (sellerCity.trim() || null) : null,
      seller_state: isSeller ? (sellerState.trim() || null) : null,
      seller_zip: isSeller ? (sellerZip.trim() || null) : null,
      seller_timeline: isSeller ? (sellerTimeline.trim() || null) : null,
      seller_listing_status: isSeller ? (sellerListingStatus || null) : null,

      // shared notes
      notes: notes.trim() || null,

      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('clients').update(payload).eq('id', id);

    if (error) {
      console.error('Error saving client:', error);
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    // Mark change request accepted if we're in review mode and it's still pending
    if (changeRow?.id) {
      try {
        await supabase
          .from('client_criteria_changes')
          .update({
            status: 'accepted',
            resolved_at: new Date().toISOString(),
          } as any)
          .eq('id', changeRow.id);
      } catch (e) {
        console.error('Failed to mark change accepted (non-fatal):', e);
      }
    }

    setSaving(false);
    setSavedFlash(true);
  };

  const onReject = async () => {
    if (!changeRow?.id) return;
    setRejecting(true);
    setChangeError(null);
    setSaveError(null);
    setSavedFlash(false);

    try {
      const { error } = await supabase
        .from('client_criteria_changes')
        .update({
          status: 'rejected',
          resolved_at: new Date().toISOString(),
        } as any)
        .eq('id', changeRow.id);

      if (error) throw error;

      setRejectedFlash(true);
      router.replace(`/clients/${encodeURIComponent(id)}/edit`);
    } catch (e: any) {
      console.error('Reject error:', e);
      setChangeError(e?.message || 'Failed to reject request.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Edit Client</h1>
          <p className="text-sm text-slate-300">Buyer fields and seller fields adapt based on type. Notes are shared for both.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/clients/${encodeURIComponent(id)}`}>
            <Button variant="ghost" className="text-xs sm:text-sm">
              ← Back to Client
            </Button>
          </Link>
          <Link href="/clients">
            <Button variant="ghost" className="text-xs sm:text-sm">
              All Clients
            </Button>
          </Link>
        </div>
      </header>

      {!loading && !loadError && changeId && (
        <Card className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <p className="text-sm text-amber-200 font-medium">Client requested criteria updates</p>
              <p className="text-xs text-slate-300">
                Review the pre-filled changes below. Click <span className="font-semibold">Save changes</span> to apply, or reject the request.
              </p>
              {changedFields.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Changed fields: <span className="text-slate-200">{changedFields.join(', ')}</span>
                </p>
              )}
              {rejectedFlash && <p className="text-sm text-emerald-300 mt-2">Request rejected.</p>}
              {changeError && <p className="text-sm text-red-300 mt-2">{changeError}</p>}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="text-xs" disabled={rejecting} onClick={onReject}>
                {rejecting ? 'Rejecting…' : 'Reject request'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading && (
        <Card>
          <p className="text-sm text-slate-300">Loading…</p>
        </Card>
      )}

      {loadError && (
        <Card>
          <p className="text-sm text-red-300">{loadError}</p>
        </Card>
      )}

      {!loading && !loadError && (
        <Card className="space-y-4">
          <form onSubmit={onSave} className="space-y-4">
            {saveError && <p className="text-sm text-red-300">{saveError}</p>}
            {savedFlash && <p className="text-sm text-emerald-300">Saved.</p>}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="Client name"
              />
            </div>

            {/* Type / Stage / Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">Type</label>
                <select
                  value={clientType}
                  onChange={(e) => setClientType(e.target.value as any)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as any)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="name@example.com"
              />
            </div>

            {/* Buyer fields */}
            {isBuyer && (
              <>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
                  <div className="text-sm font-semibold text-slate-100">Buyer requirements</div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-100">Budget Min</label>
                      <input
                        value={budgetMin}
                        onChange={(e) => setBudgetMin(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        placeholder="e.g., 800000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-100">Budget Max</label>
                      <input
                        value={budgetMax}
                        onChange={(e) => setBudgetMax(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        placeholder="e.g., 1500000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-100">Min Beds</label>
                      <input
                        value={minBeds}
                        onChange={(e) => setMinBeds(e.target.value)}
                        inputMode="numeric"
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        placeholder="e.g., 3"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-100">Min Baths</label>
                      <input
                        value={minBaths}
                        onChange={(e) => setMinBaths(e.target.value)}
                        inputMode="numeric"
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        placeholder="e.g., 2"
                      />
                    </div>
                  </div>
                </div>

                {/* Locations */}
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">Preferred Locations</label>
                    <p className="text-xs text-slate-400">Use checkboxes for speed + add custom cities (stored as a comma list).</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                    {LOCATION_SUGGESTIONS.map((loc) => {
                      const checked = selectedSet.has(loc.toLowerCase());
                      return (
                        <label key={loc} className="flex items-center gap-2 text-xs text-slate-200 select-none">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSuggested(loc)}
                            className="h-3 w-3 rounded border border-white/40 bg-black/60"
                          />
                          <span>{loc}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomLocation();
                        }
                      }}
                      className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="Add a city (press Enter)…"
                    />
                    <Button type="button" variant="secondary" className="text-xs px-3 py-2" onClick={addCustomLocation}>
                      + Add location
                    </Button>
                  </div>

                  {locationTokens.length === 0 ? (
                    <p className="text-xs text-slate-400">No locations selected.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {locationTokens.map((t) => (
                        <span
                          key={t.toLowerCase()}
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-100"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => removeLocation(t)}
                            className="text-slate-300 hover:text-white"
                            aria-label={`Remove ${t}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ✅ Seller fields — now matches the "new client" seller layout */}
            {isSeller && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                <div className="text-sm font-semibold text-slate-100">Seller details</div>
                <div className="text-xs text-slate-300">Capture listing basics, target price, and timing. These show on the client detail page.</div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-1 text-slate-100">Listing address</label>
                    <input
                      type="text"
                      value={sellerAddress}
                      onChange={(e) => setSellerAddress(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="123 Main St"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">Target list price</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={sellerTarget}
                      onChange={(e) => setSellerTarget(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 1250000"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">You can include commas — we normalize on save.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-1 text-slate-100">City</label>
                    <input
                      type="text"
                      value={sellerCity}
                      onChange={(e) => setSellerCity(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="San Jose"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">State</label>
                    <input
                      type="text"
                      value={sellerState}
                      onChange={(e) => setSellerState(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="CA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">ZIP</label>
                    <input
                      type="text"
                      value={sellerZip}
                      onChange={(e) => setSellerZip(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="95131"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-1 text-slate-100">Timeline</label>
                    <input
                      type="text"
                      value={sellerTimeline}
                      onChange={(e) => setSellerTimeline(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., List in Feb, move by April"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">Listing status</label>
                    <select
                      value={sellerListingStatus}
                      onChange={(e) => setSellerListingStatus(e.target.value as any)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    >
                      <option value="">—</option>
                      {SELLER_LISTING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* These two are shown in "new client" seller section and were historically embedded into notes.
                    Keep them here as visible inputs (optional), but we do NOT change schema.
                    If you later add real columns, we can wire them directly. */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">Seller goals</label>
                  <input
                    type="text"
                    value={sellerNotesBackCompat.goals}
                    onChange={(e) => {
                      const goals = e.target.value;
                      // update notes block, replacing (or adding) "- Seller goals: ..."
                      const lines = (notes || '').split('\n');
                      const has = lines.some((l) => /^\s*-\s*Seller goals\s*:/.test(l));
                      const next = has
                        ? lines.map((l) => (/^\s*-\s*Seller goals\s*:/.test(l) ? `- Seller goals: ${goals}` : l))
                        : [...lines.filter((l) => l.trim() !== ''), `- Seller goals: ${goals}`];
                      setNotes(next.join('\n').trim());
                    }}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="e.g., maximize price, minimize hassle"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Stored inside Notes for now (back-compat). We can promote this to a real column later.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">Showing constraints</label>
                  <input
                    type="text"
                    value={sellerNotesBackCompat.showings}
                    onChange={(e) => {
                      const showings = e.target.value;
                      const lines = (notes || '').split('\n');
                      const has = lines.some((l) => /^\s*-\s*Showing constraints\s*:/.test(l));
                      const next = has
                        ? lines.map((l) => (/^\s*-\s*Showing constraints\s*:/.test(l) ? `- Showing constraints: ${showings}` : l))
                        : [...lines.filter((l) => l.trim() !== ''), `- Showing constraints: ${showings}`];
                      setNotes(next.join('\n').trim());
                    }}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="e.g., weekdays after 5pm, no weekends"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Stored inside Notes for now (back-compat). We can promote this to a real column later.</p>
                </div>
              </div>
            )}

            {/* Notes (shared) */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                rows={4}
                placeholder="Buyer or seller notes, dealbreakers, timing, financing, prep tasks, etc."
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>

              <div className="flex gap-2 w-full sm:w-auto">
                <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => router.push(`/clients/${encodeURIComponent(id)}`)}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}


