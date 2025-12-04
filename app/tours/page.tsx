// app/tours/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Client = {
  id: string;
  name: string | null;
};

type Tour = {
  id: string;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  client_id: string | null;
  client: Client | null;
};

export default function ToursPage() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from('tours')
        .select(
          `
          id,
          title,
          status,
          start_time,
          end_time,
          client_id,
          clients (
            id,
            name
          )
        `
        )
        .order('start_time', { ascending: true });

      if (error) {
        console.error('Error loading tours:', error);
        setLoadError(error.message);
        setTours([]);
        setLoading(false);
        return;
      }

      const mapped: Tour[] = (data || []).map((row: any) => ({
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        status: (row.status as string | null) ?? null,
        start_time: (row.start_time as string | null) ?? null,
        end_time: (row.end_time as string | null) ?? null,
        client_id: (row.client_id as string | null) ?? null,
        client: row.clients
          ? ({
              id: row.clients.id as string,
              name: (row.clients.name as string | null) ?? null,
            } as Client)
          : null,
      }));

      setTours(mapped);
      setLoading(false);
    };

    load();
  }, []);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 sm:px-6 pb-8 text-slate-100">
      <header className="flex items-center justify-between mb-4 gap-2 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tours</h1>
          <p className="text-sm text-slate-400">
            See upcoming and past tours across all of your clients.
          </p>
        </div>
        <Link
          href="/tours/new"
          className="text-xs sm:text-sm rounded-full border border-[#EBD27A]/70 bg-black/40 px-3 py-1.5 text-[#EBD27A] hover:bg-[#EBD27A] hover:text-slate-900 transition-colors whitespace-nowrap shadow-sm"
        >
          + New tour
        </Link>
      </header>

      {loading && (
        <p className="text-sm text-slate-300">Loading tours…</p>
      )}

      {loadError && (
        <p className="text-sm text-red-300 mb-3">
          Error loading tours: {loadError}
        </p>
      )}

      {!loading && !loadError && tours.length === 0 && (
        <p className="text-sm text-slate-400">
          No tours yet. Use the &quot;New tour&quot; button above to create one.
        </p>
      )}

      {!loading && !loadError && tours.length > 0 && (
        <div className="space-y-4 text-sm">
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    Tour
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    Client
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    Status
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    Start
                  </th>
                  <th className="border-b border-white/10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    End
                  </th>
                </tr>
              </thead>
              <tbody>
                {tours.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="border-b border-white/5 px-3 py-2">
                      <Link
                        href={`/tours/${t.id}`}
                        className="text-[#EBD27A] hover:underline font-medium"
                      >
                        {t.title || 'Untitled tour'}
                      </Link>
                    </td>
                    <td className="border-b border-white/5 px-3 py-2 text-slate-200">
                      {t.client ? t.client.name || 'Client' : '—'}
                    </td>
                    <td className="border-b border-white/5 px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                        {t.status || 'planned'}
                      </span>
                    </td>
                    <td className="border-b border-white/5 px-3 py-2 text-slate-300">
                      {formatDateTime(t.start_time)}
                    </td>
                    <td className="border-b border-white/5 px-3 py-2 text-slate-300">
                      {formatDateTime(t.end_time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}



