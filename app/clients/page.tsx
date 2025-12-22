// /app/clients/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  client_type: string | null;
  stage: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_locations: string | null;
};

type PendingMeta = {
  pendingCount: number;
  latestId: string | null;
};

const STAGES = ['lead', 'active', 'under_contract', 'past', 'lost'] as const;
type StageFilter = (typeof STAGES)[number] | 'all';

const TYPES = ['buyer', 'seller', 'both'] as const;
type TypeFilter = (typeof TYPES)[number] | 'all';

function formatBudget(min: number | null, max: number | null) {
  if (min == null && max == null) return '-';
  const toMoney = (v: number | null) => (v == null ? '' : `$${v.toLocaleString()}`);
  if (min != null && max != null) return `${toMoney(min)} – ${toMoney(max)}`;
  if (min != null) return `${toMoney(min)}+`;
  return `up to ${toMoney(max)}`;
}

function normalizeClientType(v: string | null): 'buyer' | 'seller' | 'both' | 'unknown' {
  const t = (v || '').toLowerCase().trim();
  if (t === 'buyer') return 'buyer';
  if (t === 'seller') return 'seller';
  if (t === 'both') return 'both';
  return 'unknown';
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ✅ pending criteria change badge data
  const [pendingByClient, setPendingByClient] = useState<Record<string, PendingMeta>>({});
  const [pendingLoadError, setPendingLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadClients = async () => {
      setLoading(true);
      setError(null);
      setPendingLoadError(null);

      const { data, error } = await supabase
        .from('clients')
        .select(
          `
          id,
          name,
          email,
          phone,
          client_type,
          stage,
          budget_min,
          budget_max,
          preferred_locations
        `,
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading clients:', error);
        setError(error.message);
        setClients([]);
        setPendingByClient({});
        setLoading(false);
        return;
      }

      const rows = (data || []) as Client[];
      setClients(rows);

      // Best-effort: fetch pending criteria changes for visible clients
      try {
        const ids = rows.map((r) => r.id).filter(Boolean);
        if (ids.length === 0) {
          setPendingByClient({});
          setLoading(false);
          return;
        }

        const { data: pendingRows, error: pendingErr } = await supabase
          .from('client_criteria_changes')
          .select('id, client_id, created_at')
          .in('client_id', ids)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (pendingErr) {
          // Non-fatal: table may not exist yet in dev
          throw pendingErr;
        }

        const map: Record<string, PendingMeta> = {};
        for (const r of pendingRows || []) {
          const clientId = (r as any).client_id as string;
          const changeId = (r as any).id as string;

          if (!map[clientId]) {
            map[clientId] = { pendingCount: 1, latestId: changeId };
          } else {
            map[clientId].pendingCount += 1;
          }
        }

        setPendingByClient(map);
      } catch (e: any) {
        console.error('Error loading pending criteria changes (non-fatal):', e);
        setPendingLoadError(e?.message || 'Could not load pending criteria change requests.');
        setPendingByClient({});
      }

      setLoading(false);
    };

    loadClients();
  }, []);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: clients.length };
    for (const s of STAGES) counts[s] = 0;
    for (const c of clients) {
      const s = (c.stage as StageFilter) || 'lead';
      if (!counts[s]) counts[s] = 0;
      counts[s]++;
    }
    return counts;
  }, [clients]);

  const typeCounts = useMemo(() => {
    const counts: Record<TypeFilter, number> = {
      all: clients.length,
      buyer: 0,
      seller: 0,
      both: 0,
    };

    for (const c of clients) {
      const t = normalizeClientType(c.client_type);
      if (t === 'buyer') counts.buyer += 1;
      else if (t === 'seller') counts.seller += 1;
      else if (t === 'both') counts.both += 1;
    }

    return counts;
  }, [clients]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();

    return clients.filter((c) => {
      // Stage filter
      if (stageFilter !== 'all') {
        if ((c.stage || '') !== stageFilter) return false;
      }

      // Type filter
      if (typeFilter !== 'all') {
        const ct = normalizeClientType(c.client_type);
        if (ct !== typeFilter) return false;
      }

      // Search
      if (!term) return true;

      const haystack = [c.name, c.email, c.phone, c.preferred_locations, c.client_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [clients, stageFilter, typeFilter, search]);

  const handleDelete = async (client: Client) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete client "${client.name}"? This cannot be undone.`)
    ) {
      return;
    }

    setDeleteError(null);
    setDeletingId(client.id);

    const { error } = await supabase.from('clients').delete().eq('id', client.id);

    if (error) {
      console.error('Error deleting client:', error);
      setDeleteError(error.message || 'Failed to delete client.');
      setDeletingId(null);
      return;
    }

    setClients((prev) => prev.filter((c) => c.id !== client.id));
    setPendingByClient((prev) => {
      const next = { ...prev };
      delete next[client.id];
      return next;
    });
    setDeletingId(null);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Clients</h1>
          <p className="text-sm text-slate-300">Track buyers, sellers, and past clients in one place.</p>
        </div>

        <Link href="/clients/new">
          <Button className="w-full sm:w-auto">+ Add client</Button>
        </Link>
      </header>

      {/* Filters */}
      <Card className="space-y-4">
        <div className="flex flex-col gap-3">
          {/* Stage pills */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <FilterPill
              label={`All (${stageCounts.all ?? 0})`}
              active={stageFilter === 'all'}
              onClick={() => setStageFilter('all')}
            />
            {STAGES.map((s) => (
              <FilterPill
                key={s}
                label={`${s.replace('_', ' ')} (${stageCounts[s] ?? 0})`}
                active={stageFilter === s}
                onClick={() => setStageFilter(s)}
              />
            ))}
          </div>

          {/* Type pills + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <FilterPill
                label={`All types (${typeCounts.all})`}
                active={typeFilter === 'all'}
                onClick={() => setTypeFilter('all')}
              />
              <FilterPill
                label={`Buyers (${typeCounts.buyer})`}
                active={typeFilter === 'buyer'}
                onClick={() => setTypeFilter('buyer')}
              />
              <FilterPill
                label={`Sellers (${typeCounts.seller})`}
                active={typeFilter === 'seller'}
                onClick={() => setTypeFilter('seller')}
              />
              <FilterPill
                label={`Both (${typeCounts.both})`}
                active={typeFilter === 'both'}
                onClick={() => setTypeFilter('both')}
              />
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="Search by name, email, phone…"
              />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Filters apply instantly. Use this as your primary client list instead of spreadsheet hell.
        </p>

        {pendingLoadError && (
          <p className="text-[11px] text-amber-200">Pending criteria badge unavailable: {pendingLoadError}</p>
        )}
      </Card>

      {/* Errors / loading */}
      {error && (
        <Card>
          <p className="text-sm text-red-300">Error loading clients: {error}</p>
        </Card>
      )}

      {deleteError && (
        <Card>
          <p className="text-sm text-red-300">Error deleting client: {deleteError}</p>
        </Card>
      )}

      {loading && (
        <Card>
          <p className="text-sm text-slate-300">Loading clients…</p>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && filteredClients.length === 0 && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-slate-300">
              No clients match these filters. Click <span className="font-semibold">Add client</span> to create your next
              buyer or seller.
            </p>
            <Link href="/clients/new">
              <Button variant="secondary" className="w-full sm:w-auto">
                + Add client
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Clients table */}
      {!loading && !error && filteredClients.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-white/10">Client</th>
                  <th className="px-3 py-2 text-left border-b border-white/10">Type</th>
                  <th className="px-3 py-2 text-left border-b border-white/10">Stage</th>
                  <th className="px-3 py-2 text-left border-b border-white/10">Budget</th>
                  <th className="px-3 py-2 text-left border-b border-white/10 hidden md:table-cell">
                    Preferred locations
                  </th>
                  <th className="px-3 py-2 text-right border-b border-white/10">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => {
                  const pending = pendingByClient[c.id];
                  const hasPending = !!pending && pending.pendingCount > 0 && !!pending.latestId;

                  const ct = normalizeClientType(c.client_type);

                  return (
                    <tr key={c.id} className="hover:bg-white/5 transition-colors text-slate-100">
                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link href={`/clients/${c.id}`} className="font-medium text-[#EBD27A] hover:underline">
                              {c.name}
                            </Link>

                            <div className="text-xs text-slate-400 mt-0.5 space-y-0.5">
                              {c.phone && <div>📞 {c.phone}</div>}
                              {c.email && <div>✉️ {c.email}</div>}
                            </div>
                          </div>

                          {/* ✅ Pending criteria badge (click → prefilled edit) */}
                          {hasPending && (
                            <Link
                              href={`/clients/${encodeURIComponent(c.id)}/edit?change=${encodeURIComponent(
                                pending.latestId!,
                              )}`}
                              className="shrink-0 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-400/15"
                              title="Client requested criteria updates"
                            >
                              Criteria
                              <span className="rounded-full bg-amber-300/20 px-1.5 py-0.5 text-[10px] text-amber-100 border border-amber-300/20">
                                {pending.pendingCount}
                              </span>
                            </Link>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] capitalize border',
                            ct === 'buyer'
                              ? 'bg-emerald-500/10 text-emerald-200 border-emerald-300/20'
                              : ct === 'seller'
                              ? 'bg-sky-500/10 text-sky-200 border-sky-300/20'
                              : ct === 'both'
                              ? 'bg-violet-500/10 text-violet-200 border-violet-300/20'
                              : 'bg-white/10 text-slate-100 border-white/15',
                          ].join(' ')}
                        >
                          {c.client_type || '—'}
                        </span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] capitalize text-slate-100 border border-white/15">
                          {(c.stage || 'lead').replace('_', ' ')}
                        </span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <span className="text-sm text-slate-100">{formatBudget(c.budget_min, c.budget_max)}</span>
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top hidden md:table-cell">
                        {c.preferred_locations ? (
                          <span className="text-xs text-slate-200">{c.preferred_locations}</span>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 border-b border-white/5 align-top">
                        <div className="flex justify-end gap-2">
                          <Link href={`/clients/${c.id}`} className="text-xs text-[#EBD27A] hover:underline">
                            View
                          </Link>

                          <Link
                            href={`/clients/${c.id}/edit`}
                            className="text-xs text-slate-200 hover:text-white hover:underline"
                          >
                            Edit
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                            className="text-xs text-red-300 hover:text-red-200 hover:underline disabled:opacity-50"
                          >
                            {deletingId === c.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
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

function FilterPill({
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
        active ? 'bg-white/20 text-white border-white/40 shadow-sm' : 'bg-black/30 text-slate-200 border-white/15 hover:bg-white/10',
      ].join(' ')}
    >
      {label}
    </button>
  );
}


