// /app/clients/new/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const STAGES = ['lead', 'active', 'under_contract', 'past', 'lost'] as const;
const TYPES = ['buyer', 'seller', 'both'] as const;

const PROPERTY_TYPE_OPTIONS = [
  { id: 'single_family', label: 'Single Family' },
  { id: 'condo', label: 'Condo' },
  { id: 'townhouse', label: 'Townhouse' },
  { id: 'multi_family', label: 'Multi-Family' },
  { id: 'income', label: 'Income / Duplex' },
] as const;

const DEAL_STYLE_OPTIONS = [
  { id: 'primary', label: 'Primary residence' },
  { id: 'investment', label: 'Investment' },
  { id: 'either', label: 'Either' },
] as const;

type DealStyle = (typeof DEAL_STYLE_OPTIONS)[number]['id'];

function toNumberOrNull(raw: string) {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function normalizeLocations(raw: string) {
  const parts = raw
    .split(/[,;\n/|]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.join(', ');
}

function formatMoneyInput(raw: string) {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (!cleaned) return '';
  const n = Number(cleaned);
  if (Number.isNaN(n)) return '';
  return n.toLocaleString();
}

export default function NewClientPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<(typeof TYPES)[number]>('buyer');
  const [stage, setStage] = useState<(typeof STAGES)[number]>('lead');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Buyer fields
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');

  // Shared notes
  const [notes, setNotes] = useState('');

  // Buyer matching signals
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [minBeds, setMinBeds] = useState('');
  const [minBaths, setMinBaths] = useState('');
  const [dealStyle, setDealStyle] = useState<DealStyle>('either');

  // Seller fields (stored in notes for now, since schema isn’t shown)
  const [sellerAddress, setSellerAddress] = useState('');
  const [sellerCity, setSellerCity] = useState('');
  const [sellerState, setSellerState] = useState('');
  const [sellerTargetPrice, setSellerTargetPrice] = useState('');
  const [sellerTimeline, setSellerTimeline] = useState('');
  const [sellerGoals, setSellerGoals] = useState('');
  const [sellerShowings, setSellerShowings] = useState('');

  const [preparePortal, setPreparePortal] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agentMeta, setAgentMeta] = useState<{
    brokerage_id: string | null;
    agent_id: string | null;
  }>({
    brokerage_id: null,
    agent_id: null,
  });

  useEffect(() => {
    const loadAgent = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: agentRow, error: agentErr } = await supabase
        .from('agents')
        .select('id, brokerage_id')
        .eq('id', user.id)
        .maybeSingle();

      if (agentErr) {
        console.error('Error loading agent for new client:', agentErr);
        return;
      }

      setAgentMeta({
        brokerage_id: (agentRow as any)?.brokerage_id ?? null,
        agent_id: user.id,
      });
    };

    loadAgent();
  }, []);

  const isBuyer = clientType === 'buyer' || clientType === 'both';
  const isSeller = clientType === 'seller' || clientType === 'both';

  const budgetMinNum = useMemo(() => toNumberOrNull(budgetMin), [budgetMin]);
  const budgetMaxNum = useMemo(() => toNumberOrNull(budgetMax), [budgetMax]);
  const sellerTargetPriceNum = useMemo(
    () => toNumberOrNull(sellerTargetPrice),
    [sellerTargetPrice],
  );

  const handleTogglePropertyType = (id: string) => {
    setPropertyTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const buildSellerNotesBlock = () => {
    const lines: string[] = [];
    const push = (label: string, value: string) => {
      const v = value.trim();
      if (!v) return;
      lines.push(`${label}: ${v}`);
    };

    const addrLine = [sellerAddress, sellerCity, sellerState]
      .map((x) => x.trim())
      .filter(Boolean)
      .join(', ');

    if (addrLine) lines.push(`Listing Address: ${addrLine}`);
    if (sellerTargetPriceNum != null) {
      lines.push(`Target List Price: $${sellerTargetPriceNum.toLocaleString()}`);
    }
    push('Timeline', sellerTimeline);
    push('Seller goals', sellerGoals);
    push('Showing constraints', sellerShowings);

    if (lines.length === 0) return null;

    return `\n\n---\nSeller profile\n${lines.map((l) => `- ${l}`).join('\n')}\n`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    if (isBuyer) {
      if (budgetMinNum != null && budgetMaxNum != null && budgetMinNum > budgetMaxNum) {
        setError('Budget Min cannot be greater than Budget Max.');
        return;
      }
    }

    setSaving(true);
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const lowerEmail = trimmedEmail.toLowerCase();

    const prefLoc = isBuyer ? normalizeLocations(preferredLocations) : '';

    const sellerBlock = isSeller ? buildSellerNotesBlock() : null;
    const mergedNotes =
      (notes.trim() || '') + (sellerBlock ? sellerBlock : '');
    const finalNotes = mergedNotes.trim() ? mergedNotes.trim() : null;

    const { data: insertedClient, error: clientError } = await supabase
      .from('clients')
      .insert([
        {
          name: trimmedName,
          email: trimmedEmail || null,
          phone: trimmedPhone || null,
          client_type: clientType,
          stage,

          // Buyer-only fields (null out when not applicable)
          budget_min: isBuyer ? budgetMinNum : null,
          budget_max: isBuyer ? budgetMaxNum : null,
          preferred_locations: isBuyer ? (prefLoc || null) : null,

          // Notes (includes seller block)
          notes: finalNotes,

          // Buyer matching signals (null out when not applicable)
          property_types: isBuyer ? (propertyTypes.length ? propertyTypes : null) : null,
          min_beds: isBuyer ? toNumberOrNull(minBeds) : null,
          min_baths: isBuyer ? toNumberOrNull(minBaths) : null,
          deal_style: isBuyer ? (dealStyle || null) : null,

          // IMPORTANT for scoping
          brokerage_id: agentMeta.brokerage_id,
          agent_id: agentMeta.agent_id,
        },
      ])
      .select('id')
      .single();

    if (clientError || !insertedClient) {
      console.error('Error inserting client:', clientError);
      setError(clientError?.message || 'Failed to save client.');
      setSaving(false);
      return;
    }

    const newClientId = insertedClient.id as string;

    // 2) Optionally link to an EXISTING portal user (non-blocking)
    if (preparePortal && trimmedEmail) {
      const { data: existingPortal, error: portalLookupError } = await supabase
        .from('client_portal_users')
        .select('id')
        .eq('email', lowerEmail)
        .maybeSingle();

      if (portalLookupError) {
        console.error('Error looking up portal user:', portalLookupError);
      }

      const portalUserId = existingPortal?.id as string | undefined;

      if (portalUserId) {
        const { error: linkError } = await supabase
          .from('client_portal_access')
          .upsert(
            {
              portal_user_id: portalUserId,
              client_id: newClientId,
              role: 'primary',
            },
            { onConflict: 'portal_user_id,client_id' },
          );

        if (linkError) {
          console.error('Error linking portal user to client:', linkError);
        }
      }
    }

    router.push('/clients');
  };

  return (
    <div className="max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Add Client
          </h1>
          <p className="text-sm text-slate-300">
            Create a buyer or seller profile. Buyer fields and seller fields adapt based on type.
          </p>
        </div>
        <Link href="/clients">
          <Button variant="ghost" className="text-xs sm:text-sm">
            ← Back to Clients
          </Button>
        </Link>
      </header>

      <Card className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-300">{error}</p>}

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="Client name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Type
              </label>
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

              <p className="mt-1 text-[11px] text-slate-400">
                {clientType === 'seller'
                  ? 'Seller view: listing + pricing + timeline.'
                  : clientType === 'both'
                  ? 'Both: buyer criteria + seller listing.'
                  : 'Buyer view: matching signals + budget + locations.'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Stage
              </label>
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
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="name@example.com"
            />
            <div className="mt-2 flex items-start gap-2 text-xs text-slate-300">
              <input
                id="prepare-portal"
                type="checkbox"
                checked={preparePortal}
                onChange={(e) => setPreparePortal(e.target.checked)}
                className="mt-0.5 h-3 w-3 rounded border border-white/30 bg-black/60"
              />
              <label htmlFor="prepare-portal" className="leading-snug">
                If a client portal account already exists for this email, link this client to it automatically. Otherwise,
                they&apos;ll be linked once they sign in at{' '}
                <code className="text-[10px]">/portal</code>.
              </label>
            </div>
          </div>

          {/* Buyer section */}
          {isBuyer && (
            <>
              {/* Matching signals */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      Buyer matching signals
                    </div>
                    <div className="text-xs text-slate-300">
                      Used for ranking recommendations and matches.
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {agentMeta.brokerage_id ? 'Brokerage linked' : 'No brokerage_id'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-100">
                    Property types
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PROPERTY_TYPE_OPTIONS.map((opt) => {
                      const checked = propertyTypes.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleTogglePropertyType(opt.id)}
                          className={[
                            'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                            checked
                              ? 'border-[#EBD27A] bg-[#EBD27A]/10 text-[#EBD27A]'
                              : 'border-white/15 bg-black/40 text-slate-200 hover:bg-white/10',
                          ].join(' ')}
                        >
                          <span>{opt.label}</span>
                          <span className="text-xs">{checked ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Optional — leave blank to consider all property types.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">
                      Min Beds
                    </label>
                    <input
                      type="text"
                      value={minBeds}
                      onChange={(e) => setMinBeds(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">
                      Min Baths
                    </label>
                    <input
                      type="text"
                      value={minBaths}
                      onChange={(e) => setMinBaths(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">
                      Deal Style
                    </label>
                    <select
                      value={dealStyle}
                      onChange={(e) => setDealStyle(e.target.value as DealStyle)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    >
                      {DEAL_STYLE_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
                <div className="text-sm font-semibold text-slate-100">
                  Buyer search constraints
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">
                      Budget Min
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(formatMoneyInput(e.target.value))}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 800,000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-100">
                      Budget Max
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(formatMoneyInput(e.target.value))}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 1,500,000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">
                    Preferred Locations
                  </label>
                  <input
                    type="text"
                    value={preferredLocations}
                    onChange={(e) => setPreferredLocations(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="Irvine / Newport Beach / 95131 / etc."
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    You can separate with commas, slashes, or new lines — we normalize it for matching.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Seller section (notes-backed for now) */}
          {isSeller && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    Seller details
                  </div>
                  <div className="text-xs text-slate-300">
                    Stored in notes for now (until we add seller columns / a listing link).
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1 text-slate-100">
                    Listing address
                  </label>
                  <input
                    type="text"
                    value={sellerAddress}
                    onChange={(e) => setSellerAddress(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="123 Main St"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">
                    Target list price
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={sellerTargetPrice}
                    onChange={(e) => setSellerTargetPrice(formatMoneyInput(e.target.value))}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="e.g., 1,250,000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">
                    City
                  </label>
                  <input
                    type="text"
                    value={sellerCity}
                    onChange={(e) => setSellerCity(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="Irvine"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">
                    State
                  </label>
                  <input
                    type="text"
                    value={sellerState}
                    onChange={(e) => setSellerState(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="CA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">
                    Timeline
                  </label>
                  <input
                    type="text"
                    value={sellerTimeline}
                    onChange={(e) => setSellerTimeline(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="e.g., List in Feb, move by April"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">
                  Seller goals
                </label>
                <input
                  type="text"
                  value={sellerGoals}
                  onChange={(e) => setSellerGoals(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="Price vs speed, repairs, rent-back, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">
                  Showing constraints
                </label>
                <input
                  type="text"
                  value={sellerShowings}
                  onChange={(e) => setSellerShowings(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="Notice required, pets, times to avoid, etc."
                />
              </div>

              <div className="text-[11px] text-slate-400">
                Next step: we can add real seller columns (or link a seller to a Property record) so this becomes structured.
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">
              Internal Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              rows={3}
              placeholder="How you met, context, quirks, etc."
            />
            {isSeller && (
              <p className="mt-1 text-[11px] text-slate-400">
                Seller details above will be appended to notes automatically on save.
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Saving…' : 'Save Client'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => router.push('/clients')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}




