'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string;
};

const STAGES = [
  { id: 'watching', label: 'Watching' },
  { id: 'called', label: 'Called' },
  { id: 'offered', label: 'Offered' },
  { id: 'under_contract', label: 'Under Contract' },
  { id: 'closed', label: 'Closed' },
  { id: 'dead', label: 'Dead' },
];

const TYPES = [
  'industrial',
  'commercial',
  'retail',
  'office',
  'multi-family',
  'SFH',
  'condo',
];

export default function SearchPage() {
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState('');
  const [stage, setStage] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('properties')
        .select(
          'id, address, city, state, zip, list_price, property_type, pipeline_stage'
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error loading properties:', error);
        setError(error.message);
      } else {
        setAllProperties((data || []) as Property[]);
      }

      setLoading(false);
    };

    load();
  }, []);

  const parseNumber = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const c = city.trim().toLowerCase();
    const min = parseNumber(minPrice);
    const max = parseNumber(maxPrice);

    return allProperties.filter((p) => {
      if (q) {
        const text =
          `${p.address} ${p.city} ${p.state} ${p.zip}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      if (c) {
        if (p.city.toLowerCase() !== c) return false;
      }

      if (type) {
        if ((p.property_type || '').toLowerCase() !== type.toLowerCase())
          return false;
      }

      if (stage) {
        if (p.pipeline_stage !== stage) return false;
      }

      const price = p.list_price ?? null;

      if (min != null && (price == null || price < min)) return false;
      if (max != null && (price == null || price > max)) return false;

      return true;
    });
  }, [allProperties, query, city, type, stage, minPrice, maxPrice]);

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return `$${value.toLocaleString()}`;
  };

  return (
    <main className="min-h-screen">
      <h1 className="text-2xl font-bold mb-2">Search</h1>
      <p className="text-sm text-gray-700 mb-4">
        Search across your tracked properties by address, type, stage,
        and price. Later, this becomes the agent-first UI on top of
        live MLS data.
      </p>

      {/* Filters */}
      <section className="border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Address / City / Zip
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g., Main St, Irvine, 92614"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Exact city match"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Property Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Pipeline Stage
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Min Price
            </label>
            <input
              type="text"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g., 1000000"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Max Price
            </label>
            <input
              type="text"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g., 5000000"
            />
          </div>
        </div>

        <p className="text-[11px] text-gray-500">
          Filters apply instantly as you type. MLS-backed search will
          plug into this same layout later.
        </p>
      </section>

      {/* Results */}
      {loading && <p>Loading properties…</p>}

      {error && (
        <p className="text-sm text-red-600 mb-4">
          Error loading properties: {error}
        </p>
      )}

      {!loading && !error && allProperties.length === 0 && (
        <p className="text-sm text-gray-600">
          No properties in the system yet. Add some in the Properties
          section.
        </p>
      )}

      {!loading && !error && allProperties.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2 text-xs text-gray-600">
            <span>
              Showing {filtered.length} of {allProperties.length} tracked
              properties
            </span>
            <Link
              href="/properties/new"
              className="text-xs text-blue-600 hover:underline"
            >
              + Quick add property
            </Link>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-600">
              No results match the current filters. Try clearing some
              fields.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1 text-left">
                      Address
                    </th>
                    <th className="border px-2 py-1 text-left">
                      City
                    </th>
                    <th className="border px-2 py-1 text-left">
                      State
                    </th>
                    <th className="border px-2 py-1 text-left">Stage</th>
                    <th className="border px-2 py-1 text-left">Type</th>
                    <th className="border px-2 py-1 text-right">
                      Price
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
                      <td className="border px-2 py-1">{p.city}</td>
                      <td className="border px-2 py-1">{p.state}</td>
                      <td className="border px-2 py-1">
                        {p.pipeline_stage}
                      </td>
                      <td className="border px-2 py-1">
                        {p.property_type || '-'}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {formatCurrency(p.list_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
