'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: 'super_admin' | 'broker_admin' | 'agent';
  brokerage_id: string | null;
};

type Brokerage = {
  id: string;
  name: string;
  mls_name: string | null;
  mls_office_id: string | null;
  join_code: string | null;
  is_solo: boolean;
};

type IdxConnection = {
  id: string;
  brokerage_id: string;
  mls_name: string | null;
  connection_label: string | null;
  vendor_name: string | null;
  endpoint_url: string | null;
  username: string | null;
  status: string | null;
  last_status_at: string | null;
  last_error: string | null;
  created_at: string | null;
};

type ListingRow = {
  id: string;
  mls_number: string;
  status: string;
  list_price: number | null;
  city: string | null;
  state: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  list_date: string | null;
};

type ListingCounts = {
  total: number;
  active: number;
  pending: number;
  sold: number;
};

function statusBadge(status: string | null | undefined) {
  const s = (status || '').toLowerCase();
  if (s === 'live') {
    return {
      label: 'Live',
      className:
        'inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300',
    };
  }
  if (s === 'pending') {
    return {
      label: 'Pending',
      className:
        'inline-flex items-center rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200',
    };
  }
  if (s === 'error') {
    return {
      label: 'Error',
      className:
        'inline-flex items-center rounded-full border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200',
    };
  }
  if (s === 'disabled') {
    return {
      label: 'Disabled',
      className:
        'inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300',
    };
  }
  if (s) {
    return {
      label: s,
      className:
        'inline-flex items-center rounded-full border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200',
    };
  }
  return {
    label: 'Not set',
    className:
      'inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300',
  };
}

export default function AdminBrokerageDetailPage() {
  const params = useParams();
  const brokerageId = (params?.id as string) || null;

  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brokerage, setBrokerage] = useState<Brokerage | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [idxConnections, setIdxConnections] = useState<IdxConnection[]>([]);

  const [listingCounts, setListingCounts] = useState<ListingCounts>({
    total: 0,
    active: 0,
    pending: 0,
    sold: 0,
  });
  const [recentListings, setRecentListings] = useState<ListingRow[]>([]);

  useEffect(() => {
    if (!brokerageId) {
      setError('Missing brokerage id in route.');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      // 1) Auth check
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError('You must be signed in to view this page.');
        setLoading(false);
        return;
      }

      // 2) Ensure this user is a super_admin
      const {
        data: currentAgent,
        error: currentAgentError,
      } = await supabase
        .from('agents')
        .select('id, role')
        .eq('id', user.id)
        .single();

      if (currentAgentError || !currentAgent) {
        setError('No agent record found for this user.');
        setLoading(false);
        return;
      }

      if (currentAgent.role !== 'super_admin') {
        setNotAllowed(true);
        setLoading(false);
        return;
      }

      // 3) Load brokerage, agents, idx connections, listing counts + recent listings
      const [
        { data: bRow, error: bError },
        { data: agentRows, error: aError },
        { data: idxRows, error: idxError },
        // listing counts (4 queries)
        { count: totalCount, error: totalError },
        { count: activeCount, error: activeError },
        { count: pendingCount, error: pendingError },
        { count: soldCount, error: soldError },
        // recent listings
        { data: recentRows, error: recentError },
      ] = await Promise.all([
        supabase
          .from('brokerages')
          .select(
            'id, name, mls_name, mls_office_id, join_code, is_solo'
          )
          .eq('id', brokerageId)
          .single(),
        supabase
          .from('agents')
          .select('id, full_name, email, phone, role, brokerage_id')
          .eq('brokerage_id', brokerageId)
          .order('full_name', { ascending: true }),
        supabase
          .from('idx_connections')
          .select(
            'id, brokerage_id, mls_name, connection_label, vendor_name, endpoint_url, username, status, last_status_at, last_error, created_at'
          )
          .eq('brokerage_id', brokerageId)
          .order('created_at', { ascending: true }),

        // counts
        supabase
          .from('mls_listings')
          .select('id', { count: 'exact', head: true })
          .eq('brokerage_id', brokerageId),
        supabase
          .from('mls_listings')
          .select('id', { count: 'exact', head: true })
          .eq('brokerage_id', brokerageId)
          .eq('is_active', true),
        supabase
          .from('mls_listings')
          .select('id', { count: 'exact', head: true })
          .eq('brokerage_id', brokerageId)
          .eq('is_pending', true),
        supabase
          .from('mls_listings')
          .select('id', { count: 'exact', head: true })
          .eq('brokerage_id', brokerageId)
          .eq('is_sold', true),

        // recent listings
        supabase
          .from('mls_listings')
          .select(
            'id, mls_number, status, list_price, city, state, beds, baths, sqft, list_date'
          )
          .eq('brokerage_id', brokerageId)
          .order('first_seen_at', { ascending: false })
          .limit(25),
      ]);

      if (bError || !bRow) {
        setError('Brokerage not found.');
        setLoading(false);
        return;
      }

      if (aError) {
        setError('Failed to load agents for this brokerage.');
        setLoading(false);
        return;
      }

      if (idxError) {
        setError('Failed to load IDX connections for this brokerage.');
        setLoading(false);
        return;
      }

      if (totalError || activeError || pendingError || soldError) {
        setError('Failed to load listing counts.');
        setLoading(false);
        return;
      }

      if (recentError) {
        setError('Failed to load recent listings.');
        setLoading(false);
        return;
      }

      setBrokerage(bRow as Brokerage);
      setAgents((agentRows ?? []) as Agent[]);
      setIdxConnections((idxRows ?? []) as IdxConnection[]);
      setListingCounts({
        total: totalCount ?? 0,
        active: activeCount ?? 0,
        pending: pendingCount ?? 0,
        sold: soldCount ?? 0,
      });
      setRecentListings((recentRows ?? []) as ListingRow[]);
      setLoading(false);
    };

    load();
  }, [brokerageId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-sm opacity-80">Loading brokerage…</div>
      </main>
    );
  }

  if (notAllowed) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-sm bg-red-900/40 border border-red-700/60 rounded-xl px-4 py-3">
          You do not have permission to view this page.
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-sm bg-red-900/40 border border-red-700/60 rounded-xl px-4 py-3">
          {error}
        </div>
      </main>
    );
  }

  if (!brokerage) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-400">Brokerage not found.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400 mb-1">
            <Link
              href="/admin"
              className="hover:underline underline-offset-4 text-sky-300 hover:text-sky-200"
            >
              ← Back to Admin
            </Link>
          </div>
          <h1 className="text-xl font-semibold">{brokerage.name}</h1>
          <p className="text-xs text-slate-400">
            Internal brokerage overview for troubleshooting and support.
          </p>
        </div>
        <div className="text-right text-[11px] text-slate-400">
          {brokerage.is_solo ? 'Solo brokerage' : 'Multi-agent brokerage'}
        </div>
      </header>

      {/* Top summary cards */}
      <section className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
            MLS Info
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-400">MLS Name</span>
              <span>{brokerage.mls_name || '—'}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-400">Office ID</span>
              <span>{brokerage.mls_office_id || '—'}</span>
            </div>
          </div>
        </div>

        <div className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
            Access
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-400">Agents</span>
              <span>{agents.length}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-400">Join Code</span>
              <span className="font-mono">
                {brokerage.join_code || '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
            Listings Snapshot
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-slate-400">Total</span>
              <span>{listingCounts.total}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-emerald-300">Active</span>
              <span>{listingCounts.active}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-amber-200">Pending</span>
              <span>{listingCounts.pending}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-sky-200">Sold</span>
              <span>{listingCounts.sold}</span>
            </div>
          </div>
        </div>
      </section>

      {/* IDX Connections */}
      <section className="space-y-3 mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">IDX Connections</h2>
          <div className="text-[11px] text-slate-400">
            One brokerage may have multiple IDX/RESO/RETS connections.
          </div>
        </div>

        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-900/80">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-slate-300">
                  Label
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  MLS / Vendor
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Endpoint
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Username
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Status
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Last status
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Last error
                </th>
              </tr>
            </thead>
            <tbody>
              {idxConnections.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-3 text-slate-500 text-[11px]"
                    colSpan={7}
                  >
                    No IDX connections configured yet for this brokerage.
                  </td>
                </tr>
              ) : (
                idxConnections.map((c) => {
                  const { label, className } = statusBadge(c.status);
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-slate-800/80 align-top"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-100">
                          {c.connection_label || 'Untitled connection'}
                        </div>
                        {c.mls_name && (
                          <div className="text-[10px] text-slate-500">
                            MLS: {c.mls_name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        <div>{c.vendor_name || '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        <div className="max-w-[200px] truncate font-mono">
                          {c.endpoint_url || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        <span className="font-mono">
                          {c.username || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={className}>{label}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {c.last_status_at
                          ? new Date(
                              c.last_status_at
                            ).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {c.last_error ? (
                          <span className="block max-w-xs truncate">
                            {c.last_error}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Listings */}
      <section className="space-y-3 mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Listings (last 25)</h2>
          <div className="text-[11px] text-slate-400">
            Pulled from <code className="font-mono">mls_listings</code> for this brokerage.
          </div>
        </div>

        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-900/80">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-slate-300">
                  MLS #
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Status
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Price
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Beds/Baths
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  SqFt
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Location
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  List Date
                </th>
              </tr>
            </thead>
            <tbody>
              {recentListings.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-3 text-slate-500 text-[11px]"
                    colSpan={7}
                  >
                    No listings found yet for this brokerage.
                  </td>
                </tr>
              ) : (
                recentListings.map((l) => (
                  <tr key={l.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 font-mono text-slate-100">
                      {l.mls_number}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {l.status}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {l.list_price != null
                        ? `$${Number(l.list_price).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {l.beds ?? '-'} / {l.baths ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {l.sqft != null
                        ? Number(l.sqft).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {l.city || '—'}
                      {l.state ? `, ${l.state}` : ''}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {l.list_date
                        ? new Date(l.list_date).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Agents list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Agents in this brokerage</h2>
          <div className="text-[11px] text-slate-400">
            Roles: super_admin, broker_admin, agent
          </div>
        </div>

        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-900/80">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-slate-300">
                  Agent
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Email
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Phone
                </th>
                <th className="px-3 py-2 font-medium text-slate-300">
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-3 text-slate-500 text-[11px]"
                    colSpan={4}
                  >
                    No agents are linked to this brokerage yet.
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2">
                      {a.full_name || 'Unnamed agent'}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {a.email || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {a.phone || '—'}
                    </td>
                    <td className="px-3 py-2 uppercase tracking-wide text-[10px] text-slate-400">
                      {a.role}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
