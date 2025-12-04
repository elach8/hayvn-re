// /app/offers/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  brokerage_id: string | null;
};

type Offer = {
  id: string;
  side: string | null;
  offer_price: number | null;
  earnest_money: number | null;
  down_payment: number | null;
  financing_type: string | null;
  status: string | null;
  status_reason: string | null;
  expiration: string | null;
  close_date: string | null;
  contingencies: string | null;
  notes: string | null;
  client_id: string | null;
  property_id: string | null;
  brokerage_id: string | null;
  agent_id: string | null;
  created_at: string;
};

const PENDING_STATUSES = ['submitted', 'pending', 'counter', 'countered'] as const;
const STATUS_FILTERS = ['all', 'pending', 'accepted', 'lost'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function formatMoney(v: number | null) {
  if (v == null) return '—';
  return `$${v.toLocaleString()}`;
}

function formatExpiration(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function OffersInner() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const sessionRes = await supabase.auth.getSession();
      if (sessionRes.error || !sessionRes.data.session) {
        setAgent(null);
        setOffers([]);
        setLoading(false);
        setLoadError('Not signed in');
        return;
      }

      const user = sessionRes.data.session.user;

      const { data: agentRow, error: agentError } = await supabase
        .from('agents')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (agentError || !agentRow) {
        setAgent(null);
        setOffers([]);
        setLoading(false);
        setLoadError(agentError?.message ?? 'Agent not found.');
        return;
      }

      setAgent(agentRow as Agent);

      const { data: offersData, error: offersError } = await supabase
        .from('offers')
        .select('*')
        .eq('agent_id', agentRow.id)
        .order('created_at', { ascending: false });

      if (offersError) {
        setLoadError(offersError.message);
        setOffers([]);
      } else {
        setOffers((offersData || []) as Offer[]);
      }

      setLoading(false);
    };

    load();
  }, []);

  const pendingCount = useMemo(
    () =>
      offers.filter((o) =>
        o.status ? PENDING_STATUSES.includes(o.status as any) : false
      ).length,
    [offers]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: offers.length,
      pending: 0,
      accepted: 0,
      lost: 0,
    };

    for (const o of offers) {
      const s = (o.status || '').toLowerCase();
      if (PENDING_STATUSES.includes(s as any)) counts.pending++;
      if (s === 'accepted' || s === 'closed') counts.accepted++;
      if (s === 'rejected' || s === 'withdrawn') counts.lost++;
    }

    return counts;
  }, [offers]);

  const filteredOffers = useMemo(() => {
    if (statusFilter === 'all') return offers;

    return offers.filter((o) => {
      const s = (o.status || '').toLowerCase();
      if (statusFilter === 'pending') {
        return PENDING_STATUSES.includes(s as any);
      }
      if (statusFilter === 'accepted') {
        return s === 'accepted' || s === 'closed';
      }
      if (statusFilter === 'lost') {
        return s === 'rejected' || s === 'withdrawn';
      }
      return true;
    });
  }, [offers, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Card>
          <p className="text-sm text-slate-300">Loading offers…</p>
        </Card>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Card>
          <p className="text-sm text-red-300">
            {loadError || 'No agent record.'}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header – match Clients style */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Offers
          </h1>
          <p className="text-sm text-slate-300">
            {agent.full_name || agent.email} • {agent.role}
          </p>
          <p className="text-xs text-slate-400">
            Pending offers:{' '}
            <span className="font-semibold text-slate-100">
              {pendingCount}
            </span>
          </p>
        </div>

        <Link href="/offers/new">
          <Button className="w-full sm:w-auto">+ New offer</Button>
        </Link>
      </header>

      {/* Filters (status pills) */}
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <StatusPill
            label={`All (${statusCounts.all ?? 0})`}
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          <StatusPill
            label={`Pending (${statusCounts.pending ?? 0})`}
            active={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
          />
          <StatusPill
            label={`Accepted/Closed (${statusCounts.accepted ?? 0})`}
            active={statusFilter === 'accepted'}
            onClick={() => setStatusFilter('accepted')}
          />
          <StatusPill
            label={`Lost (${statusCounts.lost ?? 0})`}
            active={statusFilter === 'lost'}
            onClick={() => setStatusFilter('lost')}
          />
        </div>

        <p className="text-[11px] text-slate-400">
          Use these pills to quickly focus on active, won, or lost offers.
        </p>
      </Card>

      {/* Errors */}
      {loadError && (
        <Card>
          <p className="text-sm text-red-300">
            Error loading offers: {loadError}
          </p>
        </Card>
      )}

      {/* Empty state */}
      {!loadError && filteredOffers.length === 0 && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-slate-300">
              No offers match this view. Click{' '}
              <span className="font-semibold">New offer</span> to create
              your first one.
            </p>
            <Link href="/offers/new">
              <Button variant="secondary" className="w-full sm:w-auto">
                + New offer
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Offers table */}
      {!loadError && filteredOffers.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-white/10">
                    Side
                  </th>
                  <th className="px-3 py-2 text-left border-b border-white/10">
                    Status
                  </th>
                  <th className="px-3 py-2 text-right border-b border-white/10">
                    Offer
                  </th>
                  <th className="px-3 py-2 text-right border-b border-white/10 hidden md:table-cell">
                    Earnest
                  </th>
                  <th className="px-3 py-2 text-right border-b border-white/10 hidden md:table-cell">
                    Down
                  </th>
                  <th className="px-3 py-2 text-left border-b border-white/10 hidden sm:table-cell">
                    Financing
                  </th>
                  <th className="px-3 py-2 text-left border-b border-white/10 hidden lg:table-cell">
                    Close date
                  </th>
                  <th className="px-3 py-2 text-left border-b border-white/10 hidden lg:table-cell">
                    Expires
                  </th>
                  <th className="px-3 py-2 text-right border-b border-white/10">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOffers.map((o) => {
                  const created = new Date(o.created_at);
                  const sideLabel =
                    o.side === 'buy'
                      ? 'Buy side'
                      : o.side === 'sell'
                      ? 'List side'
                      : '—';

                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-white/5 transition-colors text-slate-100"
                    >
                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] capitalize text-slate-100 border border-white/15">
                          {sideLabel}
                        </span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] capitalize text-slate-100 border border-white/15">
                          {(o.status || 'draft').replace('_', ' ')}
                        </span>
                        {o.status_reason && (
                          <div className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">
                            {o.status_reason}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top text-right">
                        <span className="font-medium">
                          {formatMoney(o.offer_price)}
                        </span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top text-right hidden md:table-cell">
                        {formatMoney(o.earnest_money)}
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top text-right hidden md:table-cell">
                        {formatMoney(o.down_payment)}
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top hidden sm:table-cell">
                        <span className="text-xs text-slate-200 capitalize">
                          {o.financing_type || '—'}
                        </span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top hidden lg:table-cell">
                        <span className="text-xs text-slate-200">
                          {o.close_date || '—'}
                        </span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top hidden lg:table-cell">
                        <span className="text-xs text-slate-200">
                          {formatExpiration(o.expiration)}
                        </span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top text-right">
                        <span className="text-xs text-slate-300">
                          {created.toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function StatusPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-1 rounded-full border text-xs transition whitespace-nowrap',
        active
          ? 'bg-white/20 text-white border-white/40 shadow-sm'
          : 'bg-black/30 text-slate-200 border-white/15 hover:bg-white/10',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

export default function OffersPage() {
  return (
    <RequireAuth>
      <OffersInner />
    </RequireAuth>
  );
}



