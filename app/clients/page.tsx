'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

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

const STAGES = ['lead', 'active', 'under_contract', 'past', 'lost'] as const;
type StageFilter = (typeof STAGES)[number] | 'all';

const TYPES = ['buyer', 'seller', 'both'] as const;

function formatBudget(min: number | null, max: number | null) {
  if (min == null && max == null) return '-';
  const toMoney = (v: number | null) =>
    v == null ? '' : `$${v.toLocaleString()}`;
  if (min != null && max != null) return `${toMoney(min)} – ${toMoney(max)}`;
  if (min != null) return `${toMoney(min)}+`;
  return `up to ${toMoney(max)}`;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [search, setSearch] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const loadClients = async () => {
      setLoading(true);
      setError(null);

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
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading clients:', error);
        setError(error.message);
        setClients([]);
      } else {
        setClients((data || []) as Client[]);
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

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (stageFilter !== 'all') {
        if ((c.stage || '') !== stageFilter) return false;
      }

      if (!term) return true;

      const haystack = [
        c.name,
        c.email,
        c.phone,
        c.preferred_locations,
        c.client_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [clients, stageFilter, search]);

  const handleDelete = async (client: Client) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Delete client "${client.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeleteError(null);
    setDeletingId(client.id);

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', client.id);

    if (error) {
      console.error('Error deleting client:', error);
      setDeleteError(error.message || 'Failed to delete client.');
      setDeletingId(null);
      return;
    }

    setClients((prev) => prev.filter((c) => c.id !== client.id));
    setDeletingId(null);
  };

  return (
    <main className="min-h-screen max-w-4xl">
      {/* Header */}
      <header className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-gray-700">
            Track buyers, sellers, and past clients in one place.
          </p>
        </div>

        <Link
          href="/clients/new"
          className="inline-flex items-center px-3 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800"
        >
          + Add client
        </Link>
      </header>

      {/* Filters */}
      <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setStageFilter('all')}
            className={`px-3 py-1 rounded-full border ${
              stageFilter === 'all'
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All ({stageCounts.all ?? 0})
          </button>
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStageFilter(s)}
              className={`px-3 py-1 rounded-full border capitalize ${
                stageFilter === s
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.replace('_', ' ')} ({stageCounts[s] ?? 0})
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Search by name, email, phone…"
          />
        </div>
      </section>

      {/* Errors / loading */}
      {error && (
        <p className="text-sm text-red-600 mb-2">
          Error loading clients: {error}
        </p>
      )}

      {deleteError && (
        <p className="text-sm text-red-600 mb-2">
          Error deleting client: {deleteError}
        </p>
      )}

      {loading && <p className="text-sm text-gray-600">Loading clients…</p>}

      {!loading && !error && filteredClients.length === 0 && (
        <p className="text-sm text-gray-600">
          No clients yet. Click <span className="font-semibold">Add client</span>{' '}
          to create your first buyer or seller.
        </p>
      )}

      {/* Clients table */}
      {!loading && !error && filteredClients.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left border-b">Client</th>
                <th className="px-3 py-2 text-left border-b">Type</th>
                <th className="px-3 py-2 text-left border-b">Stage</th>
                <th className="px-3 py-2 text-left border-b">Budget</th>
                <th className="px-3 py-2 text-left border-b hidden md:table-cell">
                  Preferred locations
                </th>
                <th className="px-3 py-2 text-right border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-b align-top">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                      {c.phone && <div>📞 {c.phone}</div>}
                      {c.email && <div>✉️ {c.email}</div>}
                    </div>
                  </td>

                  <td className="px-3 py-2 border-b align-top">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-700">
                      {c.client_type || '—'}
                    </span>
                  </td>

                  <td className="px-3 py-2 border-b align-top">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-700">
                      {(c.stage || 'lead').replace('_', ' ')}
                    </span>
                  </td>

                  <td className="px-3 py-2 border-b align-top">
                    {formatBudget(c.budget_min, c.budget_max)}
                  </td>

                  <td className="px-3 py-2 border-b align-top hidden md:table-cell">
                    {c.preferred_locations ? (
                      <span className="text-xs text-gray-700">
                        {c.preferred_locations}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>

                  <td className="px-3 py-2 border-b align-top">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/clients/${c.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === c.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}



