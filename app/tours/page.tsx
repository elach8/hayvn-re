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
    <main className="min-h-screen max-w-5xl">
      <header className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold mb-1">Tours</h1>
          <p className="text-sm text-gray-700">
            See upcoming and past tours across all of your clients.
          </p>
        </div>
        <Link
          href="/tours/new"
          className="text-xs sm:text-sm rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
        >
          + New tour
        </Link>
      </header>

      {loading && (
        <p className="text-sm text-gray-600">Loading tours…</p>
      )}

      {loadError && (
        <p className="text-sm text-red-600 mb-3">
          Error loading tours: {loadError}
        </p>
      )}

      {!loading && !loadError && tours.length === 0 && (
        <p className="text-sm text-gray-600">
          No tours yet. Use the &quot;New tour&quot; button above to create one.
        </p>
      )}

      {!loading && !loadError && tours.length > 0 && (
        <div className="space-y-4 text-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 text-xs sm:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-2 py-1 text-left">Tour</th>
                  <th className="border px-2 py-1 text-left">Client</th>
                  <th className="border px-2 py-1 text-left">Status</th>
                  <th className="border px-2 py-1 text-left">Start</th>
                  <th className="border px-2 py-1 text-left">End</th>
                </tr>
              </thead>
              <tbody>
                {tours.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="border px-2 py-1">
                      <Link
                        href={`/tours/${t.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {t.title || 'Untitled tour'}
                      </Link>
                    </td>
                    <td className="border px-2 py-1">
                      {t.client ? t.client.name || 'Client' : '—'}
                    </td>
                    <td className="border px-2 py-1">
                      {t.status || 'planned'}
                    </td>
                    <td className="border px-2 py-1">
                      {formatDateTime(t.start_time)}
                    </td>
                    <td className="border px-2 py-1">
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



