// app/properties/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string | null;
  created_at: string | null;
};

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
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
          created_at
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading properties:', error);
        setLoadError(error.message);
        setProperties([]);
        setLoading(false);
        return;
      }

      setProperties((data || []) as Property[]);
      setLoading(false);
    };

    load();
  }, []);

  const formatPrice = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const formatDate = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  };

  return (
    <main className="min-h-screen max-w-5xl">
      <header className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold mb-1">Properties</h1>
          <p className="text-sm text-gray-700">
            Manage the homes you&apos;re tracking across your clients and pipeline.
          </p>
        </div>
        <Link
          href="/properties/new"
          className="text-xs sm:text-sm rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
        >
          + New property
        </Link>
      </header>

      {loading && (
        <p className="text-sm text-gray-600">Loading properties…</p>
      )}

      {loadError && (
        <p className="text-sm text-red-600 mb-3">
          Error loading properties: {loadError}
        </p>
      )}

      {!loading && !loadError && properties.length === 0 && (
        <p className="text-sm text-gray-600">
          No properties yet. Use the &quot;New property&quot; button above to add one.
        </p>
      )}

      {!loading && !loadError && properties.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-xs sm:text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Address</th>
                <th className="border px-2 py-1 text-left">Type</th>
                <th className="border px-2 py-1 text-left">Stage</th>
                <th className="border px-2 py-1 text-right">List price</th>
                <th className="border px-2 py-1 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">
                    <Link
                      href={`/properties/${p.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {p.address}
                    </Link>
                    <div className="text-[11px] text-gray-500">
                      {p.city || ''}
                      {p.state ? `, ${p.state}` : ''}
                    </div>
                  </td>
                  <td className="border px-2 py-1">
                    {p.property_type || '—'}
                  </td>
                  <td className="border px-2 py-1">
                    {p.pipeline_stage || '—'}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {formatPrice(p.list_price)}
                  </td>
                  <td className="border px-2 py-1">
                    {formatDate(p.created_at)}
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

