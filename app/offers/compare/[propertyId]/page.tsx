'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  list_price: number | null;
};

type OfferCompareRow = {
  id: string;
  side: string | null;
  offer_price: number | null;
  earnest_money: number | null;
  down_payment: number | null;
  financing_type: string | null;
  contingencies: string | null;
  close_date: string | null;
  expiration: string | null;
  status: string | null;
  status_reason: string | null;
  created_at: string;

  client_id: string | null;
  client_name: string | null;
  client_type: string | null;
};

export default function OfferComparePage() {
  const params = useParams();
  const propertyId = params?.propertyId as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [offers, setOffers] = useState<OfferCompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      // Load property
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .select('id, address, city, state, list_price')
        .eq('id', propertyId)
        .maybeSingle();

      if (propError) {
        console.error('Error loading property:', propError);
        setError(propError.message);
        setProperty(null);
        setOffers([]);
        setLoading(false);
        return;
      }

      setProperty(propData as Property | null);

      // Load offers for this property
      const { data: offersData, error: offersError } = await supabase
        .from('offers')
        .select(
          `
          id,
          side,
          offer_price,
          earnest_money,
          down_payment,
          financing_type,
          contingencies,
          close_date,
          expiration,
          status,
          status_reason,
          created_at,
          client_id,
          clients (
            name,
            client_type
          )
        `
        )
        .eq('property_id', propertyId)
        .order('offer_price', { ascending: false });

      if (offersError) {
        console.error('Error loading offers:', offersError);
        setError(offersError.message);
        setOffers([]);
      } else {
        const mapped: OfferCompareRow[] = (offersData || []).map(
          (row: any) => ({
            id: row.id,
            side: row.side,
            offer_price: row.offer_price,
            earnest_money: row.earnest_money,
            down_payment: row.down_payment,
            financing_type: row.financing_type,
            contingencies: row.contingencies,
            close_date: row.close_date,
            expiration: row.expiration,
            status: row.status,
            status_reason: row.status_reason,
            created_at: row.created_at,
            client_id: row.client_id,
            client_name: row.clients?.name ?? null,
            client_type: row.clients?.client_type ?? null,
          })
        );
        setOffers(mapped);
      }

      setLoading(false);
    };

    load();
  }, [propertyId]);

  const formatMoney = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const formatDate = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString();
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const pct = (part: number | null, whole: number | null) => {
    if (part == null || whole == null || whole === 0) return '-';
    const v = (part / whole) * 100;
    return `${v.toFixed(1)}%`;
  };

  const summary = useMemo(() => {
    if (!offers.length) return null;
    const prices = offers
      .map((o) => o.offer_price)
      .filter((v): v is number => typeof v === 'number');
    if (!prices.length) return null;

    const max = Math.max(...prices);
    const min = Math.min(...prices);
    const avg = prices.reduce((acc, v) => acc + v, 0) / prices.length;

    return { max, min, avg };
  }, [offers]);

  return (
    <main className="min-h-screen max-w-5xl">
      <header className="flex items-center justify-between mb-4 gap-2">
        <Link
          href="/offers"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to Offers
        </Link>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          Offer Comparison
        </span>
      </header>

      {loading && <p>Loading comparison…</p>}

      {error && (
        <p className="text-sm text-red-600 mb-4">
          Error: {error}
        </p>
      )}

      {!loading && !error && !property && (
        <p>Property not found.</p>
      )}

      {!loading && !error && property && (
        <>
          {/* Property header */}
          <section className="mb-4 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold mb-1">
                  Offers for{' '}
                  <Link
                    href={`/properties/${property.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {property.address}
                  </Link>
                </h1>
                <div className="text-sm text-gray-700">
                  {property.city}, {property.state}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-gray-500 text-xs">
                  List price
                </div>
                <div className="font-semibold">
                  {formatMoney(property.list_price)}
                </div>
              </div>
            </div>
          </section>

          {/* Summary metrics */}
          <section className="mb-4 border border-gray-200 rounded-lg p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                <div>
                  <div className="text-gray-500 text-xs">
                    Number of offers
                  </div>
                  <div className="font-semibold">
                    {offers.length}
                  </div>
                </div>

                {summary && (
                  <>
                    <div>
                      <div className="text-gray-500 text-xs">
                        Highest offer
                      </div>
                      <div className="font-semibold">
                        {formatMoney(summary.max)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">
                        Lowest offer
                      </div>
                      <div className="font-semibold">
                        {formatMoney(summary.min)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">
                        Average offer
                      </div>
                      <div className="font-semibold">
                        {formatMoney(Math.round(summary.avg))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="text-xs text-gray-500">
                Click a client or offer ID to drill in.
              </div>
            </div>
          </section>

          {/* Comparison table */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">
              Offers side-by-side
            </h2>

            {offers.length === 0 && (
              <p className="text-sm text-gray-600">
                No offers yet for this property.
              </p>
            )}

            {offers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 text-xs sm:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1 text-left">
                        Offer
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Client
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Side
                      </th>
                      <th className="border px-2 py-1 text-right">
                        Offer price
                      </th>
                      <th className="border px-2 py-1 text-right">
                        Vs list
                      </th>
                      <th className="border px-2 py-1 text-right">
                        Down
                      </th>
                      <th className="border px-2 py-1 text-right">
                        EM
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Financing
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Close
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Expiration
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => {
                      const vsList =
                        o.offer_price != null &&
                        property.list_price != null
                          ? o.offer_price - property.list_price
                          : null;
                      const vsListLabel =
                        vsList == null
                          ? '-'
                          : `${vsList >= 0 ? '+' : ''}${formatMoney(
                              vsList
                            )}`;

                      return (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="border px-2 py-1">
                            <div className="flex flex-col gap-0.5">
                              <Link
                                href={`/offers/${o.id}`}
                                className="text-blue-600 hover:underline"
                              >
                                #{o.id.slice(0, 8)}
                              </Link>
                              <span className="text-[11px] text-gray-500">
                                {formatDate(o.created_at)}
                              </span>
                            </div>
                          </td>
                          <td className="border px-2 py-1">
                            {o.client_id ? (
                              <div className="flex flex-col gap-0.5">
                                <Link
                                  href={`/clients/${o.client_id}`}
                                  className="text-blue-600 hover:underline"
                                >
                                  {o.client_name || 'Client'}
                                </Link>
                                {o.client_type && (
                                  <span className="text-[11px] text-gray-500">
                                    {o.client_type}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="border px-2 py-1">
                            {o.side || '-'}
                          </td>
                          <td className="border px-2 py-1 text-right">
                            {formatMoney(o.offer_price)}
                          </td>
                          <td className="border px-2 py-1 text-right">
                            {vsListLabel}
                          </td>
                          <td className="border px-2 py-1 text-right">
                            {formatMoney(o.down_payment)}
                            <div className="text-[11px] text-gray-500">
                              {pct(o.down_payment, o.offer_price)} down
                            </div>
                          </td>
                          <td className="border px-2 py-1 text-right">
                            {formatMoney(o.earnest_money)}
                            <div className="text-[11px] text-gray-500">
                              {pct(o.earnest_money, o.offer_price)} EM
                            </div>
                          </td>
                          <td className="border px-2 py-1">
                            {o.financing_type || '-'}
                          </td>
                          <td className="border px-2 py-1">
                            {o.close_date || '-'}
                          </td>
                          <td className="border px-2 py-1">
                            {formatDateTime(o.expiration)}
                          </td>
                          <td className="border px-2 py-1">
                            <div className="flex flex-col gap-0.5">
                              <span>{o.status || '-'}</span>
                              {o.status_reason && (
                                <span className="text-[11px] text-gray-500">
                                  {o.status_reason}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
