'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string;
};

export default function RadarPage() {
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
      // City
      if (cityFilter && p.city !== cityFilter) return false;
      // Type
      if (typeFilter && p.property_type !== typeFilter) return false;
      // Stage
      if (stageFilter && p.pipeline_stage !== stageFilter) return false;
      // Price
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
    <main className="min-h-screen">
      <header className="flex items-center justify-between mb-3 gap-2">
        <div>
          <h1 className="text-2xl font-bold mb-1">Market Radar</h1>
          <p className="text-sm text-gray-700">
            Quick read on your tracked market: filter by city, price,
            type, and stage.
          </p>
        </div>
        <Link
          href="/properties/new"
          className="inline-flex items-center px-3 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800"
        >
          + Add Property
        </Link>
      </header>

      {/* Filters */}
      <section className="border border-gray-200 rounded-lg p-3 mb-4 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block font-medium mb-1">City</label>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-full border rounded-md px-2 py-1 text-xs"
          >
            <option value="">Any</option>
            {uniqueCities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full border rounded-md px-2 py-1 text-xs"
          >
            <option value="">Any</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium mb-1">Stage</label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="w-full border rounded-md px-2 py-1 text-xs"
          >
            <option value="">Any</option>
            {uniqueStages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium mb-1">Price range</label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="min"
              className="w-1/2 border rounded-md px-2 py-1 text-xs"
            />
            <span className="text-[11px] text-gray-500">–</span>
            <input
              type="text"
              inputMode="decimal"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="max"
              className="w-1/2 border rounded-md px-2 py-1 text-xs"
            />
          </div>
        </div>
      </section>

      {loading && <p>Loading radar…</p>}

      {error && (
        <p className="text-sm text-red-600 mb-4">
          Error loading properties: {error}
        </p>
      )}

      {!loading && !error && properties.length === 0 && (
        <p className="text-sm text-gray-600">
          No properties yet. Start by adding a few under Properties.
        </p>
      )}

      {!loading && !error && properties.length > 0 && (
        <>
          {/* Summary / stats */}
          <section className="border border-gray-200 rounded-lg p-4 mb-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-gray-500 text-xs">
                  Matching properties
                </div>
                <div className="text-xl font-semibold">
                  {filtered.length}{' '}
                  <span className="text-xs text-gray-500">
                    of {properties.length} total
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Filters: city {cityFilter || 'any'}, type{' '}
                  {typeFilter || 'any'}, stage{' '}
                  {stageFilter || 'any'}, price{' '}
                  {minPrice || 'any'} – {maxPrice || 'any'}
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                {priceStats ? (
                  <>
                    <div>
                      <div className="text-gray-500 text-xs">
                        Median price
                      </div>
                      <div className="font-semibold">
                        {formatMoney(priceStats.median)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">
                        Average price
                      </div>
                      <div className="font-semibold">
                        {formatMoney(Math.round(priceStats.avg))}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">
                        Range
                      </div>
                      <div className="font-semibold">
                        {formatMoney(priceStats.min)} –{' '}
                        {formatMoney(priceStats.max)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-500">
                    Not enough price data for stats.
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-500">
                <div className="font-semibold mb-1">
                  By stage (filtered)
                </div>
                {Object.keys(stageCounts).length === 0 && (
                  <div>–</div>
                )}
                {Object.entries(stageCounts).map(([stage, count]) => (
                  <div key={stage}>
                    {stage}: {count}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Results table */}
          <section className="border border-gray-200 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold mb-3">Results</h2>

            {filtered.length === 0 && (
              <p className="text-sm text-gray-600">
                No properties match the current filters.
              </p>
            )}

            {filtered.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 text-xs sm:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1 text-left">
                        Property
                      </th>
                      <th className="border px-2 py-1 text-left">
                        City
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Type
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Stage
                      </th>
                      <th className="border px-2 py-1 text-right">
                        List price
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="border px-2 py-1">
                          <Link
                            href={`/properties/${p.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {p.address}
                          </Link>
                        </td>
                        <td className="border px-2 py-1">
                          {p.city}, {p.state}
                        </td>
                        <td className="border px-2 py-1">
                          {p.property_type || '-'}
                        </td>
                        <td className="border px-2 py-1">
                          {p.pipeline_stage}
                        </td>
                        <td className="border px-2 py-1 text-right">
                          {formatMoney(p.list_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
