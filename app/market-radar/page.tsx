// /app/market-radar/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string;
};

export default function MarketRadarPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [cityFilter, setCityFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('properties')
        .select(
          'id, address, city, state, list_price, property_type, pipeline_stage'
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Error loading properties for radar:', error);
        setError(error.message);
        setProperties([]);
      } else {
        setProperties((data || []) as Property[]);
      }

      setLoading(false);
    };

    load();
  }, []);

  const uniqueCities = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.city)
            .filter((c): c is string => !!c)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [properties]
  );

  const uniqueTypes = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.property_type)
            .filter((t): t is string => !!t)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [properties]
  );

  const uniqueStages = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.pipeline_stage)
            .filter((s): s is string => !!s)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [properties]
  );

  const toNumOrNull = (value: string) => {
    const trimmed = value.trim().replace(/,/g, '');
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isNaN(n) ? null : n;
  };

  const filtered = useMemo(() => {
    const min = toNumOrNull(minPrice);
    const max = toNumOrNull(maxPrice);

    return properties.filter((p) => {
      if (cityFilter && p.city !== cityFilter) return false;
      if (typeFilter && p.property_type !== typeFilter) return false;
      if (stageFilter && p.pipeline_stage !== stageFilter) return false;

      const price = p.list_price ?? null;
      if (min != null && (price == null || price < min)) return false;
      if (max != null && (price == null || price > max)) return false;

      return true;
    });
  }, [properties, cityFilter, typeFilter, stageFilter, minPrice, maxPrice]);

  const priceStats = useMemo(() => {
    const prices = filtered
      .map((p) => p.list_price)
      .filter((v): v is number => typeof v === 'number');

    if (!prices.length) return null;

    const sorted = [...prices].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const avg = sum / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    return { min, max, avg, median, count: prices.length };
  }, [filtered]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of filtered) {
      const key = p.pipeline_stage || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [filtered]);

  const formatMoney = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Market Radar
          </h1>
          <p className="text-sm text-slate-300">
            Quick read on your tracked market: filter by city, price, type, and
            stage to see where your pipeline is concentrated.
          </p>
        </div>

        <Link href="/properties/new">
          <Button className="w-full sm:w-auto">+ Add property</Button>
        </Link>
      </header>

      {/* Filters */}
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-200">
              City
            </label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            >
              <option value="">Any</option>
              {uniqueCities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-200">
              Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            >
              <option value="">Any</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-200">
              Stage
            </label>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            >
              <option value="">Any</option>
              {uniqueStages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-200">
              Price range
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="min"
                className="w-1/2 rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
              <span className="text-[11px] text-slate-400">–</span>
              <input
                type="text"
                inputMode="decimal"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="max"
                className="w-1/2 rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Filters apply instantly. Use this as a quick radar on your tracked
          sub-markets instead of guessing from memory.
        </p>
      </Card>

      {/* Error / loading */}
      {error && (
        <Card>
          <p className="text-sm text-red-300">
            Error loading properties: {error}
          </p>
        </Card>
      )}

      {loading && (
        <Card>
          <p className="text-sm text-slate-300">Loading market radar…</p>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && properties.length === 0 && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-slate-300">
              No properties yet. Add a few properties first to see your market
              radar.
            </p>
            <Link href="/properties/new">
              <Button variant="secondary" className="w-full sm:w-auto">
                + Add property
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Stats + table */}
      {!loading && !error && properties.length > 0 && (
        <>
          {/* Stats */}
          <Card className="space-y-4 text-sm">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Matching properties
                </div>
                <div className="text-2xl font-semibold text-slate-50">
                  {filtered.length}{' '}
                  <span className="text-xs text-slate-400">
                    of {properties.length} tracked
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  City: {cityFilter || 'any'} · Type: {typeFilter || 'any'} ·
                  Stage: {stageFilter || 'any'} · Price:{' '}
                  {minPrice || 'any'} – {maxPrice || 'any'}
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                {priceStats ? (
                  <>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        Median
                      </div>
                      <div className="font-semibold text-slate-50">
                        {formatMoney(priceStats.median)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        Average
                      </div>
                      <div className="font-semibold text-slate-50">
                        {formatMoney(Math.round(priceStats.avg))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        Range
                      </div>
                      <div className="font-semibold text-slate-50">
                        {formatMoney(priceStats.min)} –{' '}
                        {formatMoney(priceStats.max)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400">
                    Not enough price data yet to compute stats.
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400 min-w-[160px]">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
                  By stage (filtered)
                </div>
                {Object.keys(stageCounts).length === 0 && <div>—</div>}
                {Object.entries(stageCounts).map(([stage, count]) => (
                  <div key={stage} className="flex justify-between">
                    <span className="capitalize text-slate-100">{stage}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Table */}
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-xs uppercase text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left border-b border-white/10">
                      Property
                    </th>
                    <th className="px-3 py-2 text-left border-b border-white/10">
                      City
                    </th>
                    <th className="px-3 py-2 text-left border-b border-white/10">
                      Type
                    </th>
                    <th className="px-3 py-2 text-left border-b border-white/10">
                      Stage
                    </th>
                    <th className="px-3 py-2 text-right border-b border-white/10">
                      List price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-white/5 transition-colors text-slate-100"
                    >
                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <Link
                          href={`/properties/${p.id}`}
                          className="font-medium text-[#EBD27A] hover:underline"
                        >
                          {p.address}
                        </Link>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {p.city}, {p.state}
                        </div>
                      </td>
                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span className="text-sm text-slate-100">
                          {p.city}, {p.state}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] capitalize text-slate-100 border border-white/15">
                          {p.property_type || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] capitalize text-slate-100 border border-white/15">
                          {p.pipeline_stage || 'unknown'}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-white/5 align-top text-right">
                        <span className="text-sm text-slate-100">
                          {formatMoney(p.list_price)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
