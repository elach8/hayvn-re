'use client';

import { useEffect, useState } from 'react';
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
};

type BrokerageWithAgents = Brokerage & {
  agents: Agent[];
};

type IdxConnectionRow = {
  brokerage_id: string;
  status: string | null;
  last_status_at: string | null;
  last_error: string | null;
};

type IdxSummary = {
  hasConnections: boolean;
  anyLive: boolean;
  anyPending: boolean;
  anyError: boolean;
  lastStatusAt: string | null;
};

function summarizeIdx(connections: IdxConnectionRow[] | undefined): IdxSummary {
  if (!connections || connections.length === 0) {
    return {
      hasConnections: false,
      anyLive: false,
      anyPending: false,
      anyError: false,
      lastStatusAt: null,
    };
  }

  let anyLive = false;
  let anyPending = false;
  let anyError = false;
  let lastStatusAt: string | null = null;

  for (const c of connections) {
    const status = (c.status || '').toLowerCase();
    if (status === 'live') anyLive = true;
    if (status === 'pending') anyPending = true;
    if (status === 'error') anyError = true;
    if (status === 'disabled') {
      // optional: treat disabled as "error-ish" or neutral
    }

    if (c.last_status_at) {
      if (!lastStatusAt || c.last_status_at > lastStatusAt) {
        lastStatusAt = c.last_status_at;
      }
    }
  }

  return {
    hasConnections: true,
    anyLive,
    anyPending,
    anyError,
    lastStatusAt,
  };
}

export default function AdminBrokeragesPage() {
  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);
  const [brokerages, setBrokerages] = useState<BrokerageWithAgents[]>([]);
  const [idxByBrokerage, setIdxByBrokerage] = useState<
    Record<string, IdxSummary>
  >({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      // 1) Get current auth user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError('You must be signed in to view this page.');
        setLoading(false);
        return;
      }

      // 2) Look up agent record for this user
      const {
        data: agent,
        error: agentError,
      } = await supabase
        .from('agents')
        .select('*')
        .eq('id', user.id)
        .single();

      if (agentError || !agent) {
        setError('No agent record found for this user.');
        setLoading(false);
        return;
      }

      if (agent.role !== 'super_admin') {
        setNotAllowed(true);
        setLoading(false);
        return;
      }

      // 3) Load all brokerages, all agents, and idx connections
      const [
        { data: brokerageRows, error: brokerageError },
        { data: agentRows, error: allAgentsError },
        { data: idxRows, error: idxError },
      ] = await Promise.all([
        supabase
          .from('brokerages')
          .select('id, name, mls_name, mls_office_id, join_code')
          .order('name', { ascending: true }),
        supabase
          .from('agents')
          .select('id, full_name, email, phone, role, brokerage_id')
          .order('full_name', { ascending: true }),
        supabase
          .from('idx_connections')
          .select('brokerage_id, status, last_status_at, last_error'),
      ]);

      if (brokerageError || allAgentsError || idxError) {
        setError('Failed to load brokerages, agents, or IDX connections.');
        setLoading(false);
        return;
      }

      const agentsByBrokerage: Record<string, Agent[]> = {};
      (agentRows ?? []).forEach((a) => {
        if (!a.brokerage_id) return;
        if (!agentsByBrokerage[a.brokerage_id]) {
          agentsByBrokerage[a.brokerage_id] = [];
        }
        agentsByBrokerage[a.brokerage_id].push(a as Agent);
      });

      const idxByBrokerageTemp: Record<string, IdxSummary> = {};
      const idxGroups: Record<string, IdxConnectionRow[]> = {};

      (idxRows ?? []).forEach((c) => {
        if (!c.brokerage_id) return;
        if (!idxGroups[c.brokerage_id]) idxGroups[c.brokerage_id] = [];
        idxGroups[c.brokerage_id].push(c as IdxConnectionRow);
      });

      Object.entries(idxGroups).forEach(([brokerageId, list]) => {
        idxByBrokerageTemp[brokerageId] = summarizeIdx(list);
      });

      const combined: BrokerageWithAgents[] = (brokerageRows ?? []).map(
        (b) => ({
          ...(b as Brokerage),
          agents: agentsByBrokerage[b.id] ?? [],
        })
      );

      setBrokerages(combined);
      setIdxByBrokerage(idxByBrokerageTemp);
      setLoading(false);
    };

    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-sm opacity-80">Loading admin console…</div>
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Hayvn-RE Admin</h1>
          <p className="text-xs text-slate-400">
            Internal view of brokerages, agents, and IDX tenants. For
            troubleshooting and support only.
          </p>
        </div>
        <Link
          href="/"
          className="text-xs text-sky-300 hover:text-sky-200 underline-offset-4 hover:underline"
        >
          Back to app
        </Link>
      </header>

      <section className="space-y-4">
        {brokerages.length === 0 && (
          <div className="text-xs text-slate-400">No brokerages found.</div>
        )}

        {brokerages.map((b) => {
          const idxSummary = idxByBrokerage[b.id];
          const hasIdx = idxSummary?.hasConnections;
          let idxLabel = 'Not configured';
          let idxClass =
            'inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300';

          if (idxSummary) {
            if (idxSummary.anyLive) {
              idxLabel = 'IDX: Live';
              idxClass =
                'inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300';
            } else if (idxSummary.anyPending) {
              idxLabel = 'IDX: Pending';
              idxClass =
                'inline-flex items-center rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200';
            } else if (idxSummary.anyError) {
              idxLabel = 'IDX: Error';
              idxClass =
                'inline-flex items-center rounded-full border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200';
            } else if (idxSummary.hasConnections) {
              idxLabel = 'IDX: Configured';
              idxClass =
                'inline-flex items-center rounded-full border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200';
            }
          }

          return (
            <div
              key={b.id}
              className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60"
            >
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <Link
                    href={`/admin/brokerages/${b.id}`}
                    className="text-sm font-semibold text-sky-300 hover:text-sky-200 hover:underline underline-offset-4"
                  >
                    {b.name}
                  </Link>
                  <div className="text-[11px] text-slate-400">
                    MLS: {b.mls_name || '—'} · Office ID:{' '}
                    {b.mls_office_id || '—'}
                  </div>
                  {b.join_code && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      Join code:{' '}
                      <span className="font-mono">{b.join_code}</span>
                    </div>
                  )}
                </div>
                <div className="text-right text-[11px] text-slate-400 space-y-1">
                  <div>{b.agents.length} agent{b.agents.length === 1 ? '' : 's'}</div>
                  <div>
                    <span className={idxClass}>{idxLabel}</span>
                  </div>
                  {hasIdx && idxSummary?.lastStatusAt && (
                    <div className="text-[10px] text-slate-500">
                      Last IDX status: {new Date(idxSummary.lastStatusAt).toLocaleString()}
                    </div>
                  )}
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
                    {b.agents.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-2 text-slate-500 text-[11px]"
                          colSpan={4}
                        >
                          No agents linked to this brokerage yet.
                        </td>
                      </tr>
                    ) : (
                      b.agents.map((a) => (
                        <tr
                          key={a.id}
                          className="border-t border-slate-800/80"
                        >
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
            </div>
          );
        })}
      </section>
    </main>
  );
}

