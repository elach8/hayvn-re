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
  // Accept “Irvine / Newport Beach”, new lines, semicolons, etc.
  // Store as comma-separated for compatibility with your edge function.
  const parts = raw
    .split(/[,;\n/|]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.join(', ');
}

export default function NewClientPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<(typeof TYPES)[number]>('buyer');
  const [stage, setStage] = useState<(typeof STAGES)[number]>('lead');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');
  const [notes, setNotes] = useState('');

  // NEW: matching signals
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [minBeds, setMinBeds] = useState('');
  const [minBaths, setMinBaths] = useState('');
  const [dealStyle, setDealStyle] = useState<DealStyle>('either');

  const [preparePortal, setPreparePortal] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NEW: ensure we stamp brokerage_id + agent_id for scoping + auth logic.
  const [agentMeta, setAgentMeta] = useState<{ brokerage_id: string | null; agent_id: string | null }>({
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

  const budgetMinNum = useMemo(() => toNumberOrNull(budgetMin), [budgetMin]);
  const budgetMaxNum = useMemo(() => toNumberOrNull(budgetMax), [budgetMax]);

  const handleTogglePropertyType = (id: string) => {
    setPropertyTypes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    // Light validation (don’t be rigid)
    if (budgetMinNum != null && budgetMaxNum != null && budgetMinNum > budgetMaxNum) {
      setError('Budget Min cannot be greater than Budget Max.');
      return;
    }

    setSaving(true);
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const lowerEmail = trimmedEmail.toLowerCase();

    const prefLoc = normalizeLocations(preferredLocations);

    // 1) Insert the CRM client row
    const { data: insertedClient, error: clientError } = await supabase
      .from('clients')
      .insert([
        {
          name: trimmedName,
          email: trimmedEmail || null,
          phone: trimmedPhone || null,
          client_type: clientType,
          stage,

          budget_min: budgetMinNum,
          budget_max: budgetMaxNum,
          preferred_locations: prefLoc || null,
          notes: notes.trim() || null,

          // NEW fields (make sure your DB has these columns; nullable is fine)
          property_types: propertyTypes.length ? propertyTypes : null,
          min_beds: toNumberOrNull(minBeds),
          min_baths: toNumberOrNull(minBaths),
          deal_style: dealStyle || null,

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
            { onConflict: 'portal_user_id,client_id' }
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
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Add Client</h1>
          <p className="text-sm text-slate-300">Create a buyer or seller profile with matching signals.</p>
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
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">Email</label>
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
                they&apos;ll be linked once they sign in at <code className="text-[10px]">/portal</code>.
              </label>
            </div>
          </div>

          {/* Matching signals */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-100">Matching signals</div>
                <div className="text-xs text-slate-300">Keep it light — this helps recommendations rank better.</div>
              </div>
              <div className="text-[11px] text-slate-400">
                {agentMeta.brokerage_id ? 'Brokerage linked' : 'No brokerage_id'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-100">Property types</label>
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
              <p className="mt-1 text-[11px] text-slate-400">Optional — leave blank to consider all property types.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">Min Beds</label>
                <input
                  type="text"
                  value={minBeds}
                  onChange={(e) => setMinBeds(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="e.g., 3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">Min Baths</label>
                <input
                  type="text"
                  value={minBaths}
                  onChange={(e) => setMinBaths(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="e.g., 2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">Deal Style</label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">Budget Min</label>
              <input
                type="text"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="e.g., 800000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">Budget Max</label>
              <input
                type="text"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="e.g., 1500000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">Preferred Locations</label>
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

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">Internal Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              rows={3}
              placeholder="How you met, criteria, quirks, etc."
            />
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




