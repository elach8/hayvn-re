// app/tools/listing-readiness/page.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type ConditionLevel = 'needs_work' | 'average' | 'updated' | 'fully_renovated';
type PresentationLevel = 'poor' | 'okay' | 'good' | 'excellent';
type CompetitionLevel = 'heavy' | 'normal' | 'light';
type MotivationLevel = 'low' | 'medium' | 'high';

type FormState = {
  address: string;
  city: string;
  state: string;
  priceTarget: string;

  beds: string;
  baths: string;
  sqft: string;
  yearBuilt: string;

  condition: ConditionLevel;
  hasMajorIssues: boolean;
  recentRenovations: boolean;

  presentation: PresentationLevel;
  hasStaging: boolean;
  hasProPhotos: boolean;
  isCluttered: boolean;

  competition: CompetitionLevel;
  pricingVsComps: 'below' | 'inline' | 'above' | 'unknown';
  uniqueness: 'standard' | 'some_unique' | 'very_unique';

  sellerMotivation: MotivationLevel;
  sellerFlexibility: 'rigid' | 'normal' | 'flexible';
  occupancy: 'owner' | 'tenant' | 'vacant';

  notes: string;
};

type ScoreBreakdown = {
  conditionScore: number;
  presentationScore: number;
  marketScore: number;
  logisticsScore: number;
  total: number;
  bandLabel: string;
  bandDescription: string;
};

const initialForm: FormState = {
  address: '',
  city: '',
  state: '',
  priceTarget: '',

  beds: '',
  baths: '',
  sqft: '',
  yearBuilt: '',

  condition: 'average',
  hasMajorIssues: false,
  recentRenovations: false,

  presentation: 'good',
  hasStaging: false,
  hasProPhotos: false,
  isCluttered: false,

  competition: 'normal',
  pricingVsComps: 'inline',
  uniqueness: 'standard',

  sellerMotivation: 'medium',
  sellerFlexibility: 'normal',
  occupancy: 'owner',

  notes: '',
};

function computeScore(form: FormState): ScoreBreakdown {
  // Condition (0–25)
  let conditionScore = 10;
  switch (form.condition) {
    case 'needs_work':
      conditionScore = 5;
      break;
    case 'average':
      conditionScore = 12;
      break;
    case 'updated':
      conditionScore = 18;
      break;
    case 'fully_renovated':
      conditionScore = 22;
      break;
  }
  if (form.recentRenovations) conditionScore += 2;
  if (form.hasMajorIssues) conditionScore -= 4;
  conditionScore = Math.max(0, Math.min(25, conditionScore));

  // Presentation (0–25)
  let presentationScore = 10;
  switch (form.presentation) {
    case 'poor':
      presentationScore = 6;
      break;
    case 'okay':
      presentationScore = 12;
      break;
    case 'good':
      presentationScore = 18;
      break;
    case 'excellent':
      presentationScore = 22;
      break;
  }
  if (form.hasStaging) presentationScore += 2;
  if (form.hasProPhotos) presentationScore += 2;
  if (form.isCluttered) presentationScore -= 4;
  presentationScore = Math.max(0, Math.min(25, presentationScore));

  // Market fit (0–25)
  let marketScore = 12;
  switch (form.competition) {
    case 'heavy':
      marketScore = 8;
      break;
    case 'normal':
      marketScore = 14;
      break;
    case 'light':
      marketScore = 18;
      break;
  }
  switch (form.pricingVsComps) {
    case 'below':
      marketScore += 4;
      break;
    case 'inline':
      marketScore += 2;
      break;
    case 'above':
      marketScore -= 3;
      break;
    case 'unknown':
      marketScore -= 1;
      break;
  }
  if (form.uniqueness === 'some_unique') marketScore += 1;
  if (form.uniqueness === 'very_unique') marketScore += 3;
  marketScore = Math.max(0, Math.min(25, marketScore));

  // Logistics / seller (0–25)
  let logisticsScore = 12;
  switch (form.sellerMotivation) {
    case 'low':
      logisticsScore = 8;
      break;
    case 'medium':
      logisticsScore = 12;
      break;
    case 'high':
      logisticsScore = 16;
      break;
  }
  switch (form.sellerFlexibility) {
    case 'rigid':
      logisticsScore -= 3;
      break;
    case 'normal':
      logisticsScore += 0;
      break;
    case 'flexible':
      logisticsScore += 3;
      break;
  }
  if (form.occupancy === 'vacant') logisticsScore += 3;
  if (form.occupancy === 'tenant') logisticsScore -= 2;
  logisticsScore = Math.max(0, Math.min(25, logisticsScore));

  const total = conditionScore + presentationScore + marketScore + logisticsScore;

  let bandLabel = 'Needs Work';
  let bandDescription =
    'This listing needs meaningful prep before it will compete well in the market. Focus on repairs, presentation, and pricing clarity.';

  if (total >= 70 && total < 85) {
    bandLabel = 'Show-Ready';
    bandDescription =
      'The home is generally ready to show. A few focused improvements can help it stand out and support stronger pricing.';
  } else if (total >= 85) {
    bandLabel = 'Launch-Ready';
    bandDescription =
      'This listing is in strong shape across condition, presentation, market fit, and logistics. You’re well-positioned for a confident launch.';
  } else if (total >= 55 && total < 70) {
    bandLabel = 'Almost Ready';
    bandDescription =
      'Key pieces are in place, but there are still some gaps that could impact days-on-market or final price. Use this score to guide your prep plan.';
  }

  return {
    conditionScore,
    presentationScore,
    marketScore,
    logisticsScore,
    total,
    bandLabel,
    bandDescription,
  };
}

export default function ListingReadinessPage() {
  const [form, setForm] = useState<FormState>(initialForm);

  const scores = useMemo(() => computeScore(form), [form]);

  const handleChange = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setForm(initialForm);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:flex-row print:items-center print:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Listing Readiness Score
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              A structured way to score how ready a listing is to hit the
              market across condition, presentation, market fit, and logistics.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-slate-400">
            <div className="hidden sm:block">
              Built inside Hayvn-RE for agent-facing prep.
            </div>
            <div className="flex gap-2 print:hidden">
              <Link
                href="/clients"
                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/50 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-white/10"
              >
                ← Back to clients
              </Link>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center justify-center rounded-lg bg-[#EBD27A] px-3 py-1.5 text-[11px] font-medium text-black hover:bg-[#f3e497]"
              >
                Export / Print summary
              </button>
            </div>
          </div>
        </header>

        {/* Score summary card */}
        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
          <div className="rounded-2xl border border-white/10 bg-black/50 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Overall readiness
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-semibold text-slate-50">
                    {scores.total}
                  </p>
                  <p className="text-xs text-slate-400">out of 100</p>
                </div>
                <p className="text-sm font-medium text-[#EBD27A] mt-1">
                  {scores.bandLabel}
                </p>
              </div>
              <div className="hidden sm:flex flex-col items-end text-xs text-slate-400">
                <p>Condition: {scores.conditionScore}/25</p>
                <p>Presentation: {scores.presentationScore}/25</p>
                <p>Market fit: {scores.marketScore}/25</p>
                <p>Logistics: {scores.logisticsScore}/25</p>
              </div>
            </div>
            <p className="text-xs text-slate-300">{scores.bandDescription}</p>
            <p className="text-[11px] text-slate-500">
              This tool is meant to guide the conversation with your seller. You
              can adjust inputs as the home is improved and re-score over time.
            </p>
          </div>

          {/* Property summary */}
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 space-y-3 text-xs">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Subject property
            </p>
            <div className="space-y-1">
              <p className="text-sm text-slate-100 font-medium">
                {form.address || 'Untitled listing'}
              </p>
              <p className="text-xs text-slate-400">
                {[form.city, form.state].filter(Boolean).join(', ') ||
                  'City / state not set'}
              </p>
              <p className="text-xs text-slate-400">
                {form.beds ? `${form.beds} bd` : '— bd'} •{' '}
                {form.baths ? `${form.baths} ba` : '— ba'} •{' '}
                {form.sqft ? `${form.sqft} sq ft` : 'size not set'}
              </p>
              <p className="text-xs text-slate-400">
                Target list price:{' '}
                <span className="text-slate-100">
                  {form.priceTarget || 'not set'}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/60 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-white/10 print:hidden"
            >
              Reset form
            </button>
          </div>
        </section>

        {/* Form sections */}
        <form
          className="space-y-5 text-sm"
          onSubmit={(e) => e.preventDefault()}
        >
          {/* Basic info */}
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 space-y-3">
            <header className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">
                  Property basics
                </h2>
                <p className="text-xs text-slate-400">
                  Quick context so you remember which listing this score belongs
                  to.
                </p>
              </div>
            </header>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">
                  Street address
                </label>
                <input
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                  placeholder="123 Main St"
                />
              </div>
              <div className="grid grid-cols-[2fr_1fr] gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300">
                    City
                  </label>
                  <input
                    value={form.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                    placeholder="San Jose"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300">
                    State
                  </label>
                  <input
                    value={form.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                    placeholder="CA"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300">
                    Beds
                  </label>
                  <input
                    value={form.beds}
                    onChange={(e) => handleChange('beds', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                    placeholder="3"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300">
                    Baths
                  </label>
                  <input
                    value={form.baths}
                    onChange={(e) => handleChange('baths', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                    placeholder="2"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300">
                    Year built
                  </label>
                  <input
                    value={form.yearBuilt}
                    onChange={(e) => handleChange('yearBuilt', e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                    placeholder="1995"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">
                  Approx. living area (sq ft)
                </label>
                <input
                  value={form.sqft}
                  onChange={(e) => handleChange('sqft', e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                  placeholder="1800"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">
                  Target list price
                </label>
                <input
                  value={form.priceTarget}
                  onChange={(e) => handleChange('priceTarget', e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                  placeholder="$1,250,000"
                />
              </div>
            </div>
          </section>

          {/* Condition */}
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 space-y-3">
            <header>
              <h2 className="text-sm font-semibold text-slate-50">
                Condition & repairs
              </h2>
              <p className="text-xs text-slate-400">
                How move-in ready is the home from a physical condition
                standpoint?
              </p>
            </header>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Overall interior condition
                </label>
                <select
                  value={form.condition}
                  onChange={(e) =>
                    handleChange('condition', e.target.value as ConditionLevel)
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="needs_work">Needs significant work</option>
                  <option value="average">Average / lived-in</option>
                  <option value="updated">Updated in key areas</option>
                  <option value="fully_renovated">
                    Fully renovated / turnkey
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Recent renovations
                </label>
                <div className="flex flex-wrap gap-3 text-xs text-slate-200">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.recentRenovations}
                      onChange={(e) =>
                        handleChange('recentRenovations', e.target.checked)
                      }
                      className="h-3 w-3 rounded border-white/30 bg-black/40"
                    />
                    <span>Significant recent upgrades (kitchen/baths, etc.)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.hasMajorIssues}
                      onChange={(e) =>
                        handleChange('hasMajorIssues', e.target.checked)
                      }
                      className="h-3 w-3 rounded border-white/30 bg-black/40"
                    />
                    <span>Known major issues (roof, foundation, systems)</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Presentation */}
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 space-y-3">
            <header>
              <h2 className="text-sm font-semibold text-slate-50">
                Presentation & marketing
              </h2>
              <p className="text-xs text-slate-400">
                How the property will show in photos, online, and at in-person
                showings.
              </p>
            </header>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Current presentation level
                </label>
                <select
                  value={form.presentation}
                  onChange={(e) =>
                    handleChange(
                      'presentation',
                      e.target.value as PresentationLevel,
                    )
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="poor">Cluttered / not show-ready</option>
                  <option value="okay">Generally clean but basic</option>
                  <option value="good">Show-ready with light styling</option>
                  <option value="excellent">
                    Fully staged / magazine-ready
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Marketing prep
                </label>
                <div className="flex flex-col gap-2 text-xs text-slate-200">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.hasStaging}
                      onChange={(e) =>
                        handleChange('hasStaging', e.target.checked)
                      }
                      className="h-3 w-3 rounded border-white/30 bg-black/40"
                    />
                    <span>Professional staging (full or partial)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.hasProPhotos}
                      onChange={(e) =>
                        handleChange('hasProPhotos', e.target.checked)
                      }
                      className="h-3 w-3 rounded border-white/30 bg-black/40"
                    />
                    <span>Professional photography / media</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isCluttered}
                      onChange={(e) =>
                        handleChange('isCluttered', e.target.checked)
                      }
                      className="h-3 w-3 rounded border-white/30 bg-black/40"
                    />
                    <span>Home still feels cluttered or personalized</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Market fit */}
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 space-y-3">
            <header>
              <h2 className="text-sm font-semibold text-slate-50">
                Market fit & pricing
              </h2>
              <p className="text-xs text-slate-400">
                How this property is positioned relative to current demand and
                competition.
              </p>
            </header>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Competition level in this segment
                </label>
                <select
                  value={form.competition}
                  onChange={(e) =>
                    handleChange(
                      'competition',
                      e.target.value as CompetitionLevel,
                    )
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="heavy">
                    Many similar listings on the market
                  </option>
                  <option value="normal">
                    Normal number of similar listings
                  </option>
                  <option value="light">
                    Very few comparable options available
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Pricing vs recent comps
                </label>
                <select
                  value={form.pricingVsComps}
                  onChange={(e) =>
                    handleChange(
                      'pricingVsComps',
                      e.target.value as FormState['pricingVsComps'],
                    )
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="unknown">Still determining</option>
                  <option value="below">
                    Below similar recent sales/actives
                  </option>
                  <option value="inline">
                    Roughly in line with similar sales
                  </option>
                  <option value="above">
                    Above what similar properties are fetching
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  How unique is this home?
                </label>
                <select
                  value={form.uniqueness}
                  onChange={(e) =>
                    handleChange(
                      'uniqueness',
                      e.target.value as FormState['uniqueness'],
                    )
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="standard">
                    Pretty standard for the area
                  </option>
                  <option value="some_unique">
                    Some differentiators (lot, layout, style)
                  </option>
                  <option value="very_unique">
                    Very unique / scarce product in this market
                  </option>
                </select>
              </div>
            </div>
          </section>

          {/* Logistics */}
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 space-y-3">
            <header>
              <h2 className="text-sm font-semibold text-slate-50">
                Seller logistics & momentum
              </h2>
              <p className="text-xs text-slate-400">
                How easy it will be to show the home and move a ready buyer
                through the process.
              </p>
            </header>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Seller motivation
                </label>
                <select
                  value={form.sellerMotivation}
                  onChange={(e) =>
                    handleChange(
                      'sellerMotivation',
                      e.target.value as MotivationLevel,
                    )
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="low">
                    Low — casual / testing the market
                  </option>
                  <option value="medium">Medium — wants to move</option>
                  <option value="high">
                    High — time sensitive or committed
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Seller flexibility
                </label>
                <select
                  value={form.sellerFlexibility}
                  onChange={(e) =>
                    handleChange(
                      'sellerFlexibility',
                      e.target.value as FormState['sellerFlexibility'],
                    )
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="rigid">
                    Rigid — limited times, narrow terms
                  </option>
                  <option value="normal">Normal flexibility</option>
                  <option value="flexible">
                    Flexible — easy showings & terms
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Occupancy
                </label>
                <select
                  value={form.occupancy}
                  onChange={(e) =>
                    handleChange(
                      'occupancy',
                      e.target.value as FormState['occupancy'],
                    )
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                >
                  <option value="owner">Owner-occupied</option>
                  <option value="tenant">Tenant-occupied</option>
                  <option value="vacant">Vacant</option>
                </select>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 space-y-3">
            <header>
              <h2 className="text-sm font-semibold text-slate-50">
                Notes for your seller
              </h2>
              <p className="text-xs text-slate-400">
                Capture the story behind this score or the key steps you&apos;ll
                recommend next.
              </p>
            </header>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
              placeholder="Example: Focus on decluttering, minor paint touch-ups in living room, and refreshing front landscaping before photos. Pricing feels in line with recent sales on Oak St if we bring presentation up one notch."
            />
          </section>
        </form>
      </div>
    </main>
  );
}

