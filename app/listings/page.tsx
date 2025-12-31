// app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';

type AgentRole = 'broker' | 'agent' | 'assistant' | 'admin';

type Agent = {
  id: string;
  brokerage_id: string | null;
  role: AgentRole | null;
};

type ViewMode = 'mine' | 'brokerage';

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string | null;
  created_at: string | null;

  // ownership fields
  agent_id: string | null;
  brokerage_id: string | null;
};

function ListingsInner() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('mine');

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isBroker = agent?.role === 'broker';
  const canBrokerageView = !!(isBroker && agent?.brokerage_id);

  const formatPrice = (v: number | null) => (v == null ? '-' : `$${v.toLocaleString()}`);

  const formatDate = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  };

  const load = async (mode: ViewMode, existingAgent?: Agent | null) => {
    try {
      setLoadError(null);
      if (!agent && !existingAgent) setLoading(true);
      setReloading(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session) {
        setLoadError('Not signed in');
        setProperties([]);
        setLoading(false);
        setReloading(false);
        return;
      }

      const user = session.user;

      // Load agent row (or reuse)
      let a = existingAgent ?? null;
      if (!a) {
        const { data: agentRow, error: agentError } = await supabase
          .from('agents')
          .select('id, brokerage_id, role')
          .eq('id', user.id)
          .maybeSingle();

        if (agentError) throw agentError;
        if (!agentRow) {
          setLoadError('No agent record found for this user.');
          setProperties([]);
          setLoading(false);
          setReloading(false);
          return;
        }
        a = agentRow as Agent;
        setAgent(a);
      } else {
        setAgent(a);
      }

      // If someone toggles brokerage without permissions, fall back to mine
      const effectiveMode: ViewMode =
        mode === 'brokerage' && !(a.role === 'broker' && a.brokerage_id) ? 'mine' : mode;

      // Query properties (these are the "Listings" we manage)
      let q = supabase
        .from('properties')
        .select(
          `
          id,
          address,
          city,
          state,
          list_price,
          property_type,
          pipeline_stage,
          created_at,
          agent_id,
          brokerage_id
        `,
        )
        .order('created_at', { ascending: false });

      if (effectiveMode === 'mine') {
        q = q.eq('agent_id', a.id);
      } else {
        q = q.eq('brokerage_id', a.brokerage_id as string);
      }

      const { data, error } = await q;

      if (error) throw error;

      setProperties((data || []) as Property[]);
      setLoading(false);
      setReloading(false);
      setViewMode(effectiveMode);
    } catch (err: any) {
      console.error('Listings load error:', err);
      setLoadError(err?.message ?? 'Failed to load listings');
      setProperties([]);
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    load('mine');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeView = async (mode: ViewMode) => {
    setViewMode(mode);
    await load(mode, agent);
  };

  return (
    <main className="min-h-screen max-w-5xl text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Listings
          </h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            Properties you’re listing (agent view) with an optional brokerage view for brokers.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-white/10 bg-black/40 p-1 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => onChangeView('mine')}
                className={
                  'px-3 py-1 rounded-full transition-colors ' +
                  (viewMode === 'mine'
                    ? 'bg-[#EBD27A] text-slate-900 font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-white/5')
                }
              >
                My listings
              </button>

              {canBrokerageView && (
                <button
                  type="button"
                  onClick={() => onChangeView('brokerage')}
                  className={
                    'px-3 py-1 rounded-full transition-colors ' +
                    (viewMode === 'brokerage'
                      ? 'bg-[#EBD27A] text-slate-900 font-semibold shadow-sm'
                      : 'text-slate-300 hover:bg-white/5')
                  }
                >
                  Brokerage
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => load(viewMode, agent)}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-slate-200 hover:border-white/20 hover:bg-white/5 transition-colors"
            >
              {reloading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <Link
          href="/properties/new"
          className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-50 hover:bg-white/10 whitespace-nowrap"
        >
          + New property
        </Link>
      </header>

      {/* States */}
      {loading && (
        <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-300">
          Loading listings…
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100 mb-3">
          Error loading listings: {loadError}
        </div>
      )}

      {!loading && !loadError && properties.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-300">
          No listings yet. Use the <span className="font-semibold">New property</span>{' '}
          button above to add one.
        </div>
      )}

      {/* Table */}
      {!loading && !loadError && properties.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
            <span>
              Showing{' '}
              <span className="font-semibold text-slate-100">{properties.length}</span>{' '}
              {viewMode === 'brokerage' ? 'brokerage' : 'agent'} listings
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    Address
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    Type
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    Stage
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-right font-medium">
                    List price
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left font-medium">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id} className="hover:bg-white/5 text-slate-100">
                    <td className="border-b border-white/5 px-3 py-2 align-top">
                      {/* Reuse the existing property detail page */}
                      <Link
                        href={`/properties/${p.id}`}
                        className="text-[#EBD27A] hover:underline font-medium"
                      >
                        {p.address}
                      </Link>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {p.city || ''}
                        {p.state ? `, ${p.state}` : ''}
                      </div>
                    </td>

                    <td className="border-b border-white/5 px-3 py-2 align-top">
                      {p.property_type ? (
                        <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] capitalize text-slate-100">
                          {p.property_type}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">—</span>
                      )}
                    </td>

                    <td className="border-b border-white/5 px-3 py-2 align-top">
                      {p.pipeline_stage ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 capitalize">
                          {p.pipeline_stage}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">—</span>
                      )}
                    </td>

                    <td className="border-b border-white/5 px-3 py-2 text-right align-top">
                      <span className="font-medium">{formatPrice(p.list_price)}</span>
                    </td>

                    <td className="border-b border-white/5 px-3 py-2 align-top text-slate-300">
                      <span className="text-[11px] sm:text-xs">
                        {formatDate(p.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
