// /app/search/page.tsx
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
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          Search
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl">
          Search across your tracked properties by address, type, stage, and price.
          This will later sit on top of live MLS data, but the workflow stays the same.
        </p>
      </header>

      {/* Filters */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
            Filters
          </h2>
          <p className="text-[11px] text-slate-400">
            Results update instantly as you type.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1 text-slate-300">
              Address / City / Zip
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="e.g., Main St, Irvine, 92614"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1 text-slate-300">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="Exact city match"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1 text-slate-300">
              Property Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
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
            <label className="block text-[11px] font-medium mb-1 text-slate-300">
              Pipeline Stage
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
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
            <label className="block text-[11px] font-medium mb-1 text-slate-300">
              Min Price
            </label>
            <input
              type="text"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="e.g., 1000000"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1 text-slate-300">
              Max Price
            </label>
            <input
              type="text"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="e.g., 5000000"
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          This is your agent-first search layer. When MLS is wired in, these same
          filters will drive live inventory.
        </p>
      </Card>

      {/* Loading / error states */}
      {loading && (
        <Card>
          <p className="text-sm text-slate-300">Loading properties…</p>
        </Card>
      )}

      {error && (
        <Card>
          <p className="text-sm text-red-300">
            Error loading properties: {error}
          </p>
        </Card>
      )}

      {/* Empty system state */}
      {!loading && !error && allProperties.length === 0 && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-slate-300">
              No properties in the system yet. Add some in the Properties section.
            </p>
            <Link href="/properties/new">
              <Button variant="secondary" className="w-full sm:w-auto">
                + Quick add property
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Results */}
      {!loading && !error && allProperties.length > 0 && (
        <Card className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-300">
            <span>
              Showing <span className="font-semibold">{filtered.length}</span> of{' '}
              <span className="font-semibold">{allProperties.length}</span> tracked
              properties
            </span>
            <Link href="/properties/new">
              <Button variant="secondary" className="w-full sm:w-auto">
                + Quick add property
              </Button>
            </Link>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-300">
              No results match the current filters. Try clearing some fields.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-white/10">
                <thead className="bg-white/5">
                  <tr className="text-xs text-slate-300">
                    <th className="border-b border-white/10 px-3 py-2 text-left">
                      Address
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left">
                      City
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left">
                      State
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left">
                      Stage
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left">
                      Type
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-right">
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-white/5 transition-colors text-slate-100"
                    >
                      <td className="border-t border-white/5 px-3 py-2">
                        <Link
                          href={`/properties/${p.id}`}
                          className="text-[#EBD27A] hover:underline"
                        >
                          {p.address}
                        </Link>
                      </td>
                      <td className="border-t border-white/5 px-3 py-2">
                        {p.city}
                      </td>
                      <td className="border-t border-white/5 px-3 py-2">
                        {p.state}
                      </td>
                      <td className="border-t border-white/5 px-3 py-2 text-xs uppercase tracking-wide text-slate-300">
                        {p.pipeline_stage}
                      </td>
                      <td className="border-t border-white/5 px-3 py-2">
                        {p.property_type || '-'}
                      </td>
                      <td className="border-t border-white/5 px-3 py-2 text-right">
                        {formatCurrency(p.list_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
