// app/clients/[id]/edit/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  budget_min: number | null;
  budget_max: number | null;
  preferred_locations: string | null;
  notes: string | null;
};

const STAGES = ['lead', 'active', 'under_contract', 'past', 'lost'] as const;
const TYPES = ['buyer', 'seller', 'both'] as const;

// A few common OC/LA starters (edit/remove freely)
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
  return tokens.map((t) => normalizeToken(t)).filter(Boolean).join(', ');
}

export default function EditClientPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Fields
  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<(typeof TYPES)[number]>('buyer');
  const [stage, setStage] = useState<(typeof STAGES)[number]>('lead');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [notes, setNotes] = useState('');

  // Locations (checkboxes + custom)
  const [locationTokens, setLocationTokens] = useState<string[]>([]);
  const [customLocation, setCustomLocation] = useState('');

  const toNumberOrNull = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
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

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('clients')
        .select(
          'id,name,email,phone,client_type,stage,budget_min,budget_max,preferred_locations,notes'
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

      setName(c.name ?? '');
      setClientType(((c.client_type as any) || 'buyer') as any);
      setStage(((c.stage as any) || 'lead') as any);
      setEmail(c.email ?? '');
      setPhone(c.phone ?? '');
      setBudgetMin(c.budget_min != null ? String(c.budget_min) : '');
      setBudgetMax(c.budget_max != null ? String(c.budget_max) : '');
      setNotes(c.notes ?? '');
      setLocationTokens(parseLocations(c.preferred_locations));

      setLoading(false);
    };

    load();
  }, [id]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSavedFlash(false);

    if (!name.trim()) {
      setSaveError('Name is required.');
      return;
    }

    // Soft validation: if both exist, ensure min <= max
    const min = toNumberOrNull(budgetMin);
    const max = toNumberOrNull(budgetMax);
    if (min != null && max != null && min > max) {
      setSaveError('Budget Min cannot be greater than Budget Max.');
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      client_type: clientType,
      stage,
      email: email.trim() || null,
      phone: phone.trim() || null,
      budget_min: min,
      budget_max: max,
      preferred_locations: locationTokens.length ? toCommaList(locationTokens) : null,
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

    setSaving(false);
    setSavedFlash(true);

    // optional: go back to detail after save
    // router.push(`/clients/${id}`);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Edit Client Requirements
          </h1>
          <p className="text-sm text-slate-300">
            Keep this clean + structured so matching stays strong even with messy agent input.
          </p>
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
            {savedFlash && (
              <p className="text-sm text-emerald-300">Saved.</p>
            )}

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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            {/* Email */}
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
            </div>

            {/* Budget */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">
                  Budget Min
                </label>
                <input
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="e.g., 800000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-100">
                  Budget Max
                </label>
                <input
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="e.g., 1500000"
                />
              </div>
            </div>

            {/* Locations */}
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-100">
                    Preferred Locations
                  </label>
                  <p className="text-xs text-slate-400">
                    Use checkboxes for speed + add custom cities (stored as a comma list).
                  </p>
                </div>
              </div>

              {/* suggested checkboxes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                {LOCATION_SUGGESTIONS.map((loc) => {
                  const checked = selectedSet.has(loc.toLowerCase());
                  return (
                    <label
                      key={loc}
                      className="flex items-center gap-2 text-xs text-slate-200 select-none"
                    >
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

              {/* custom add */}
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
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs px-3 py-2"
                  onClick={addCustomLocation}
                >
                  + Add location
                </Button>
              </div>

              {/* selected chips */}
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

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Internal Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                rows={4}
                placeholder="Criteria details, dealbreakers, timing, financing notes, etc."
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>

              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  onClick={() => router.push(`/clients/${encodeURIComponent(id)}`)}
                >
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
