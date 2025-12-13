// /app/search/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

type MlsListing = {
  id: string;
  mls_number: string;
  status: string;
  list_price: number | null;

  property_type: string | null;
  listing_title: string | null;

  street_number: string | null;
  street_dir_prefix: string | null;
  street_name: string | null;
  street_suffix: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;

  beds: number | null;
  baths: number | null;
  sqft: number | null;

  list_date: string | null;
};

const STATUS_OPTIONS = [
  { id: '', label: 'Any' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'sold', label: 'Sold' },
  { id: 'other', label: 'Other' },
];

export default function SearchPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [brokerageId, setBrokerageId] = useState<string | null>(null);
  const [allListings, setAllListings] = useState<MlsListing[]>([]);

  // Filters
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      // 1) Auth user
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        setError('You must be signed in to search MLS listings.');
        setLoading(false);
        return;
      }

      // 2) Resolve current agent’s brokerage_id
      const { data: agentRow, error: agentErr } = await supabase
        .from('agents')
        .select('brokerage_id')
        .eq('id', user.id)
        .single();

      if (agentErr) {
        console.error('Error loading agent:', agentErr);
        setError(agentErr.message);
        setLoading(false);
        return;
      }

      const bId = agentRow?.brokerage_id ?? null;
      setBrokerageId(bId);

      if (!bId) {
        setAllListings([]);
        setLoading(false);
        return;
      }

      // 3) Load MLS listings for this brokerage (force return type)
      const { data, error: listingsErr } = await supabase
        .from('mls_listings')
        .select(
          [
            'id',
            'mls_number',
            'status',
            'list_price',
            'property_type',
            'listing_title',
            'street_number',
            'street_dir_prefix',
            'street_name',
            'street_suffix',
            'unit',
            'city',
            'state',
            'postal_code',
            'beds',
            'baths',
            'sqft',
            'list_date',
          ].join(', ')
        )
        .eq('brokerage_id', bId)
        .order('last_seen_at', { ascending: false })
        .limit(500)
        .returns<MlsListing[]>();

      if (listingsErr) {
        console.error('Error loading mls_listings:', listingsErr);
        setError(listingsErr.message);
        setLoading(false);
        return;
      }

      setAllListings(data ?? []);
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

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return `$${value.toLocaleString()}`;
  };

  const buildAddressLine = (l: MlsListing) => {
    const parts: string[] = [];
    if (l.street_number) parts.push(l.street_number);
    if (l.street_dir_prefix) parts.push(l.street_dir_prefix);
    if (l.street_name) parts.push(l.street_name);
    if (l.street_suffix) parts.push(l.street_suffix);
    let addr = parts.join(' ').trim();
    if (l.unit) addr = addr ? `${addr} #${l.unit}` : `#${l.unit}`;
    return addr || l.listing_title || '(No address)';
  };

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of allListings) {
      const t = (l.property_type || '').trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allListings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const c = city.trim().toLowerCase();
    const min = parseNumber(minPrice);
    const max = parseNumber(maxPrice);

    return allListings.filter((l) => {
      const addr = buildAddressLine(l);
      const cityVal = (l.city || '').toLowerCase();
      const stateVal = (l.state || '').toLowerCase();
      const zipVal = (l.postal_code || '').toLowerCase();
      const statusVal = (l.status || '').toLowerCase();
      const typeVal = (l.property_type || '').toLowerCase();

      if (q) {
        const text = `${addr} ${cityVal} ${stateVal} ${zipVal} ${l.mls_number}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      if (c) {
        if (cityVal !== c) return false;
      }

      if (status) {
        if (statusVal !== status.toLowerCase()) return false;
      }

      if (type) {
        if (typeVal !== type.toLowerCase()) return false;
      }

      const price = l.list_price ?? null;
      if (min != null && (price == null || price < min)) return false;
      if (max != null && (price == null || price > max)) return false;

      return true;
    });
  }, [allListings, query, city, status, type, minPrice, maxPrice]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          MLS Search
        </h1>
        <p className="text-sm text-slate-300 max-w-2xl">
          Inventory pulled into <code className="font-mono">mls_listings</code> (brokerage scoped).
        </p>
      </header>

      {!loading && !error && !brokerageId && (
        <Card>
          <p className="text-sm text-slate-300">
            Your agent account is not linked to a brokerage yet.
          </p>
        </Card>
      )}

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
            Filters
          </h2>
          <p className="text-[11px] text-slate-400">Results update instantly as you type.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1 text-slate-300">
              Address / City / Zip / MLS #
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="e.g., Main St, San Jose, 95126, 819xxxx"
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
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
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
          Source: <code className="font-mono">mls_listings</code>
        </p>
      </Card>

      {loading && (
        <Card>
          <p className="text-sm text-slate-300">Loading MLS listings…</p>
        </Card>
      )}

      {error && (
        <Card>
          <p className="text-sm text-red-300">Error loading MLS listings: {error}</p>
        </Card>
      )}

      {!loading && !error && brokerageId && allListings.length === 0 && (
        <Card>
          <p className="text-sm text-slate-300">
            No MLS listings found for this brokerage yet. Run the IDX sync again.
          </p>
        </Card>
      )}

      {!loading && !error && allListings.length > 0 && (
        <Card className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-300">
            <span>
              Showing <span className="font-semibold">{filtered.length}</span> of{' '}
              <span className="font-semibold">{allListings.length}</span> MLS listings
            </span>

            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-300">No results match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-white/10">
                <thead className="bg-white/5">
                  <tr className="text-xs text-slate-300">
                    <th className="border-b border-white/10 px-3 py-2 text-left">Address</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left">City</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left">Status</th>
                    <th className="border-b border-white/10 px-3 py-2 text-left">Type</th>
                    <th className="border-b border-white/10 px-3 py-2 text-right">Price</th>
                    <th className="border-b border-white/10 px-3 py-2 text-right">Beds/Baths</th>
                    <th className="border-b border-white/10 px-3 py-2 text-right">SqFt</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const addr = buildAddressLine(l);
                    return (
                      <tr
                        key={l.id}
                        className="hover:bg-white/5 transition-colors text-slate-100"
                      >
                        <td className="border-t border-white/5 px-3 py-2">
                          <span className="text-[#EBD27A]">{addr}</span>
                          <div className="text-[11px] text-slate-400 font-mono">
                            MLS #{l.mls_number}
                          </div>
                        </td>
                        <td className="border-t border-white/5 px-3 py-2">
                          {l.city || '—'}
                          {l.state ? `, ${l.state}` : ''}
                          {l.postal_code ? ` ${l.postal_code}` : ''}
                        </td>
                        <td className="border-t border-white/5 px-3 py-2 text-xs uppercase tracking-wide text-slate-300">
                          {l.status}
                        </td>
                        <td className="border-t border-white/5 px-3 py-2">
                          {l.property_type || '-'}
                        </td>
                        <td className="border-t border-white/5 px-3 py-2 text-right">
                          {formatCurrency(l.list_price)}
                        </td>
                        <td className="border-t border-white/5 px-3 py-2 text-right">
                          {(l.beds ?? '—')} / {(l.baths ?? '—')}
                        </td>
                        <td className="border-t border-white/5 px-3 py-2 text-right">
                          {l.sqft != null ? Number(l.sqft).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
