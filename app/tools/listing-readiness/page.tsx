// app/tools/listing-readiness/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Scenario = 'pre_listing' | 'active_listing';

type CurrentAgent = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type FormState = {
  scenario: Scenario;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  condition_score: number;
  presentation_score: number;
  market_fit_score: number;
  logistics_score: number;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  scenario: 'pre_listing',
  address_line: '',
  city: '',
  state: '',
  postal_code: '',
  condition_score: 3,
  presentation_score: 3,
  market_fit_score: 3,
  logistics_score: 3,
  notes: '',
};

export default function ListingReadinessPage() {
  const [agent, setAgent] = useState<CurrentAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  // For now we’re not wiring client/listing query params.
  const clientId: string | null = null;
  const mlsListingId: string | null = null;
  const propertyId: string | null = null;

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setError('Please sign in to use Listing Readiness Score.');
        setLoading(false);
        return;
      }

      const user = session.user;

      // Load agent record
      const { data: agentRow, error: agentError } = await supabase
        .from('agents')
        .select('id, full_name, email')
        .eq('id', user.id)
        .single();

      if (agentError || !agentRow) {
        console.error('Agent load error for listing readiness:', agentError);
        setError('No agent record found for this user.');
        setLoading(false);
        return;
      }

      setAgent({
        id: agentRow.id as string,
        full_name: (agentRow.full_name as string | null) ?? null,
        email: (agentRow.email as string | null) ?? null,
      });

      setLoading(false);
    };

    run();
  }, []);

  const handleChange = (field: keyof FormState, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const overallScore = useMemo(() => {
    const parts = [
      form.condition_score,
      form.presentation_score,
      form.market_fit_score,
      form.logistics_score,
    ];

    const avg = parts.reduce((sum, v) => sum + v, 0) / parts.length;
    // convert 1–5 scale → 0–100
    return Math.round((avg / 5) * 100);
  }, [
    form.condition_score,
    form.presentation_score,
    form.market_fit_score,
    form.logistics_score,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: insertError } = await supabase
        .from('listing_readiness_scores')
        .insert({
          agent_id: agent.id,
          client_id: clientId,
          property_id: propertyId,
          mls_listing_id: mlsListingId,
          scenario: form.scenario,
          address_line: form.address_line || null,
          city: form.city || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          condition_score: form.condition_score,
          presentation_score: form.presentation_score,
          market_fit_score: form.market_fit_score,
          logistics_score: form.logistics_score,
          overall_score: overallScore,
          notes: form.notes || null,
          raw_inputs: {
            scale: '1-5',
            computed_from: ['condition', 'presentation', 'market_fit', 'logistics'],
          },
        });

      if (insertError) {
        console.error('Error saving listing readiness score:', insertError);
        setError(insertError.message || 'Could not save score.');
        setSaving(false);
        return;
      }

      setSuccess('Listing readiness score saved.');
      setSaving(false);
    } catch (err: any) {
      console.error('Error saving listing readiness score:', err);
      setError(err?.message ?? 'Could not save score.');
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Tools / Listing Prep
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">
              Listing Readiness Score
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Use this with a seller before or after going live. Score condition,
              presentation, market fit, and logistics, then save the result to come
              back to later.
            </p>
          </div>
          <Link
            href="/tools"
            className="text-xs text-slate-400 hover:text-slate-200 hover:underline"
          >
            ← Back to tools
          </Link>
        </header>

        {/* Agent + score summary */}
        <section className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-slate-200">
            {loading && <p>Checking your agent profile…</p>}
            {!loading && agent && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400">Signed in as</p>
                <p className="text-sm font-medium text-slate-50">
                  {agent.full_name || agent.email || 'Agent'}
                </p>
                <p className="text-[11px] text-slate-400">
                  Scores are saved to your account and can be linked to clients or
                  listings later.
                </p>
              </div>
            )}
            {!loading && !agent && error && (
              <p className="text-sm text-red-300">{error}</p>
            )}
          </div>

          <div className="rounded-2xl border border-[#EBD27A]/40 bg-[#EBD27A]/5 px-4 py-3 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#EBD27A]">
                  Overall score (preview)
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-50">
                  {overallScore}
                  <span className="text-sm text-slate-400"> / 100</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-300">
                  We&apos;ll start with a simple weighted average. Later we can
                  layer in AI and market context.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Alerts */}
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-100">
            {success}
          </div>
        )}

        {/* Form */}
        {!loading && agent && (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-4"
          >
            {/* Scenario + address */}
            <section className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-200">
                  Scenario
                </label>
                <div className="flex flex-col gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleChange('scenario', 'pre_listing')}
                    className={[
                      'rounded-xl border px-3 py-2 text-left',
                      form.scenario === 'pre_listing'
                        ? 'border-[#EBD27A] bg-[#EBD27A]/10 text-slate-50'
                        : 'border-white/15 bg-black/40 text-slate-300 hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="font-medium">Pre-listing (not yet in MLS)</div>
                    <p className="text-[11px] text-slate-400">
                      Use this in your listing appointment or while prepping the
                      property.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChange('scenario', 'active_listing')}
                    className={[
                      'rounded-xl border px-3 py-2 text-left',
                      form.scenario === 'active_listing'
                        ? 'border-[#EBD27A] bg-[#EBD27A]/10 text-slate-50'
                        : 'border-white/15 bg-black/40 text-slate-300 hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="font-medium">Already live in MLS</div>
                    <p className="text-[11px] text-slate-400">
                      Use this to evaluate how the listing shows and where to
                      improve.
                    </p>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-200">
                  Property address (snapshot)
                </label>
                <div className="space-y-2 text-xs">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                    placeholder="123 Main St"
                    value={form.address_line}
                    onChange={(e) => handleChange('address_line', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="w-16 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                        placeholder="CA"
                        value={form.state}
                        onChange={(e) => handleChange('state', e.target.value)}
                      />
                      <input
                        type="text"
                        className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                        placeholder="Zip"
                        value={form.postal_code}
                        onChange={(e) =>
                          handleChange('postal_code', e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    This is stored with the score so it doesn&apos;t change even if
                    your property record does.
                  </p>
                </div>
              </div>
            </section>

            {/* Scoring sliders */}
            <section className="grid gap-3 md:grid-cols-2">
              {(
                [
                  {
                    key: 'condition_score' as const,
                    label: 'Condition & repairs',
                    helper:
                      'Deferred maintenance, obvious repairs, and inspection landmines.',
                  },
                  {
                    key: 'presentation_score' as const,
                    label: 'Presentation & photos',
                    helper:
                      'Staging, photography, curb appeal, and online first impression.',
                  },
                  {
                    key: 'market_fit_score' as const,
                    label: 'Market fit & pricing story',
                    helper:
                      'How well the home fits current demand at this price point.',
                  },
                  {
                    key: 'logistics_score' as const,
                    label: 'Seller logistics & friction',
                    helper:
                      'Showing flexibility, pets, tenants, timelines, and decision-making.',
                  },
                ] satisfies {
                  key: keyof Pick<
                    FormState,
                    | 'condition_score'
                    | 'presentation_score'
                    | 'market_fit_score'
                    | 'logistics_score'
                  >;
                  label: string;
                  helper: string;
                }[]
              ).map((item) => (
                <div
                  key={item.key}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div>
                      <p className="font-medium text-slate-50">{item.label}</p>
                      <p className="text-[11px] text-slate-400">{item.helper}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-300">
                      <span className="text-slate-400">Score:</span>{' '}
                      <span className="font-semibold text-slate-50">
                        {form[item.key]}
                      </span>
                      <span className="text-slate-400"> / 5</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={form[item.key]}
                    onChange={(e) =>
                      handleChange(item.key, Number(e.target.value))
                    }
                    className="w-full"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                    <span>Needs work</span>
                    <span>Strong</span>
                  </div>
                </div>
              ))}
            </section>

            {/* Notes + actions */}
            <section className="space-y-2">
              <label className="block text-xs font-medium text-slate-200">
                Notes for yourself / seller
              </label>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                placeholder="Key upgrades to recommend, risks to flag, and how you'll frame the property to the market."
                value={form.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
              />
            </section>

            <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-white/10">
              <p className="text-[11px] text-slate-500 max-w-md">
                This saves a snapshot of your score and address. Later we can add
                history, export, and AI recommendations.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setForm(DEFAULT_FORM);
                    setSuccess(null);
                    setError(null);
                  }}
                  className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                  disabled={saving}
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg border border-[#EBD27A] bg-[#EBD27A] px-4 py-1.5 text-xs font-medium text-black hover:bg-[#f3e497] disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save score'}
                </button>
              </div>
            </section>
          </form>
        )}
      </div>
    </main>
  );
}


