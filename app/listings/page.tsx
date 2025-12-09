// app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';
import Link from 'next/link';

type Listing = {
  id: string;
  brokerage_id: string;
  idx_connection_id: string | null;
  mls_number: string;
  mls_source: string | null;
  status: string | null;
  list_date: string | null;
  close_date: string | null;
  list_price: number | null;
  close_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  last_seen_at: string | null;
};

type Agent = {
  id: string;
  brokerage_id: string | null;
  role: string | null;
};

function formatMoney(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function ListingsInner() {
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'sold'>('all');
  const [searchCity, setSearchCity] = useState('');
  const [searchMls, setSearchMls] = useState('');
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setLoading(true);

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
          setError('Not signed in');
          setLoading(false);
          return;
        }

        const user = session.user;

        // Load agent to get brokerage_id
        const { data: agentRow, error: agentError } = await supabase
          .from('agents')
          .select('id, brokerage_id, role')
          .eq('id', user.id)
          .maybeSingle();

        if (agentError) throw agentError;
        if (!agentRow) {
          setError('No agent record found for this user.');
          setLoading(false);
          return;
        }

        const typedAgent = agentRow as Agent;
        setAgent(typedAgent);

        if (!typedAgent.brokerage_id) {
          setError('You are not linked to a brokerage yet, so there are no MLS listings to show.');
          setListings([]);
          setLoading(false);
          return;
        }

        // Basic initial load: most recent listings for this brokerage
        const { data: listingRows, error: listingError } = await supabase
          .from('mls_listings')
          .select(
            'id, brokerage_id, idx_connection_id, mls_number, mls_source, status, list_date, close_date, list_price, close_price, beds, baths, sqft, city, state, postal_code, last_seen_at'
          )
          .eq('brokerage_id', typedAgent.brokerage_id)
          .order('last_seen_at', { ascending: false })
          .limit(limit);

        if (listingError) throw listingError;

        setListings((listingRows || []) as Listing[]);
        setLoading(false);
      } catch (err: any) {
        console.error('Listings page load error:', err);
        setError(err?.message ?? 'Failed to load listings');
        setLoading(false);
      }
    };

    load();
  }, [limit]);

  const filtered = listings.filter((l) => {
    if (statusFilter !== 'all') {
      const s = (l.status || '').toLowerCase();
      if (statusFilter === 'active' && s !== 'active') return false;
      if (statusFilter === 'pending' && s !== 'pending') return false;
      if (statusFilter === 'sold' && s !== 'sold') return false;
    }

    if (searchCity.trim()) {
      const c = (l.city || '').toLowerCase();
      if (!c.includes(searchCity.trim().toLowerCase())) return false;
    }

    if (searchMls.trim()) {
      const m = (l.mls_number || '').toLowerCase();
      if (!m.includes(searchMls.trim().toLowerCase())) return false;
    }

    return true;
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              MLS Listings (internal)
            </h1>
            <p className="text-sm text-slate-300">
              View listings synced into Hayvn-RE for your brokerage. This is an internal
              tool to verify IDX data is flowing correctly.
            </p>
          </div>
          <Link
            href="/settings/idx"
            className="inline-flex items-center rounded-lg border border-slate-600 bg-black/40 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-400"
          >
            MLS / IDX settings
          </Link>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
            {error}
          </div>
        )}

        {!error && agent && !loading && listings.length === 0 && (
          <section className="rounded-2xl border border-slate-600/60 bg-black/40 p-4 space-y-2">
            <h2 className="text-sm font-medium text-slate-50">No listings yet</h2>
            <p className="text-xs text-slate-300">
              We don&apos;t see any MLS listings stored for your brokerage yet.
              Once your broker configures an IDX connection and a sync runs, listings
              will start to appear here.
            </p>
          </section>
        )}

        {/* Filters */}
        <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                Status
              </p>
              <div className="inline-flex rounded-full bg-black/60 border border-white/10 p-0.5">
                {(['all', 'active', 'pending', 'sold'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1 text-[11px] rounded-full transition ${
                      statusFilter === s
                        ? 'bg-slate-100 text-black'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                City
              </p>
              <input
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                placeholder="e.g. Los Angeles"
                className="w-40 rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                MLS #
              </p>
              <input
                value={searchMls}
                onChange={(e) => setSearchMls(e.target.value)}
                placeholder="Search MLS number"
                className="w-40 rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                Rows
              </p>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 50)}
                className="rounded-lg border border-white/15 bg-black/70 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Showing {filtered.length} of {listings.length} loaded records for your brokerage.
          </p>
        </section>

        {/* Table */}
        {filtered.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-black/40 p-4 overflow-x-auto">
            <table className="min-w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/10 text-[11px] text-slate-300 uppercase tracking-wide">
                  <th className="py-2 pr-3">MLS #</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Beds</th>
                  <th className="py-2 pr-3">Baths</th>
                  <th className="py-2 pr-3">SqFt</th>
                  <th className="py-2 pr-3">City</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">Zip</th>
                  <th className="py-2 pr-3">List date</th>
                  <th className="py-2 pr-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/5"
                  >
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-100">
                      {l.mls_number}
                    </td>
                    <td className="py-2 pr-3 capitalize text-slate-100">
                      {l.status || '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {formatMoney(l.list_price ?? l.close_price)}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {l.beds ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {l.baths ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {l.sqft ? l.sqft.toLocaleString() : '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {l.city || '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {l.state || '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {l.postal_code || '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {formatDate(l.list_date)}
                    </td>
                    <td className="py-2 pr-3 text-slate-100">
                      {formatDate(l.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-200">
            Loading listings…
          </div>
        )}
      </div>
    </main>
  );
}

export default function ListingsPage() {
  return (
    <RequireAuth>
      <ListingsInner />
    </RequireAuth>
  );
}
