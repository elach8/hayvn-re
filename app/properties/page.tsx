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
    <main className="min-h-screen max-w-5xl text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Properties
          </h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            Manage the homes you&apos;re tracking across your clients and pipeline.
            MLS data will plug into this grid later.
          </p>
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
          Loading properties…
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100 mb-3">
          Error loading properties: {loadError}
        </div>
      )}

      {!loading && !loadError && properties.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-300">
          No properties yet. Use the <span className="font-semibold">New property</span>{' '}
          button above to add one.
        </div>
      )}

      {/* Table */}
      {!loading && !loadError && properties.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
            <span>
              Showing <span className="font-semibold text-slate-100">{properties.length}</span>{' '}
              tracked properties
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
                  <tr
                    key={p.id}
                    className="hover:bg-white/5 text-slate-100"
                  >
                    <td className="border-b border-white/5 px-3 py-2 align-top">
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
                      <span className="font-medium">
                        {formatPrice(p.list_price)}
                      </span>
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

