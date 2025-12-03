'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Offer = {
  id: string;
  property_id: string;
  client_id: string | null;
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
  notes: string | null;
  created_at: string;

  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_list_price: number | null;

  client_name: string | null;
  client_type: string | null;
};

const STATUS_OPTIONS = [
  'draft',
  'submitted',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
];

export default function OfferDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [status, setStatus] = useState('draft');
  const [statusReason, setStatusReason] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const loadOffer = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('offers')
        .select(
          `
          id,
          property_id,
          client_id,
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
          notes,
          created_at,
          properties (
            address,
            city,
            state,
            list_price
          ),
          clients (
            name,
            client_type
          )
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error loading offer:', error);
        setError(error.message);
        setOffer(null);
      } else if (data) {
        const row = data as any;

        const mapped: Offer = {
          id: row.id,
          property_id: row.property_id,
          client_id: row.client_id,
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
          notes: row.notes,
          created_at: row.created_at,
          property_address: row.properties?.address ?? null,
          property_city: row.properties?.city ?? null,
          property_state: row.properties?.state ?? null,
          property_list_price: row.properties?.list_price ?? null,
          client_name: row.clients?.name ?? null,
          client_type: row.clients?.client_type ?? null,
        };

        setOffer(mapped);
        setStatus(mapped.status || 'draft');
        setStatusReason(mapped.status_reason || '');
        setNotes(mapped.notes || '');
      }

      setLoading(false);
    };

    loadOffer();
  }, [id]);

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

  const computePercent = (part: number | null, whole: number | null) => {
    if (part == null || whole == null || whole === 0) return '-';
    const pct = (part / whole) * 100;
    return `${pct.toFixed(1)}%`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offer) return;

    setSaving(true);
    setSaveError(null);

    const { error } = await supabase
      .from('offers')
      .update({
        status,
        status_reason: statusReason.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', offer.id);

    if (error) {
      console.error('Error updating offer:', error);
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  return (
    <main className="min-h-screen max-w-4xl">
      <header className="flex items-center justify-between mb-4 gap-2">
        <Link
          href="/offers"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to Offers
        </Link>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          Offer Detail
        </span>
      </header>

      {loading && <p>Loading offer…</p>}

      {error && (
        <p className="text-sm text-red-600 mb-4">
          Error loading offer: {error}
        </p>
      )}

      {!loading && !error && !offer && (
        <p>Offer not found.</p>
      )}

      {!loading && !error && offer && (
        <>
          {/* Summary header */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-xl font-bold mb-1">
                  {offer.side === 'sell' ? 'Listing-side offer' : 'Buyer offer'}
                </h1>
                <div className="text-sm text-gray-700">
                  {offer.property_id ? (
                    <Link
                      href={`/properties/${offer.property_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {offer.property_address || 'Property'}
                    </Link>
                  ) : (
                    <span>-</span>
                  )}
                  {offer.property_city && (
                    <span className="text-xs text-gray-500 ml-1">
                      ({offer.property_city}, {offer.property_state})
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Created: {formatDateTime(offer.created_at)}
                </div>
              </div>
              <div className="text-right text-sm">
                {offer.client_id ? (
                  <>
                    <div className="text-gray-500 text-xs">
                      Client
                    </div>
                    <Link
                      href={`/clients/${offer.client_id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {offer.client_name || 'Client'}
                    </Link>
                    {offer.client_type && (
                      <div className="text-[11px] text-gray-500">
                        {offer.client_type}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-gray-500">
                    No client linked
                  </div>
                )}
              </div>
            </div>

            {/* Price + quick metrics */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">
                  Offer price
                </div>
                <div className="font-semibold">
                  {formatMoney(offer.offer_price)}
                </div>
                {offer.property_list_price != null && (
                  <div className="text-[11px] text-gray-500">
                    List: {formatMoney(offer.property_list_price)}
                  </div>
                )}
              </div>

              <div>
                <div className="text-gray-500 text-xs">
                  Down payment
                </div>
                <div className="font-semibold">
                  {formatMoney(offer.down_payment)}
                </div>
                <div className="text-[11px] text-gray-500">
                  {computePercent(offer.down_payment, offer.offer_price)} down
                </div>
              </div>

              <div>
                <div className="text-gray-500 text-xs">
                  Earnest money
                </div>
                <div className="font-semibold">
                  {formatMoney(offer.earnest_money)}
                </div>
                <div className="text-[11px] text-gray-500">
                  {computePercent(offer.earnest_money, offer.offer_price)} EM
                </div>
              </div>

              <div>
                <div className="text-gray-500 text-xs">
                  Financing
                </div>
                <div className="font-semibold">
                  {offer.financing_type || '-'}
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">
                  Close date
                </div>
                <div className="font-semibold">
                  {offer.close_date || '-'}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">
                  Expiration
                </div>
                <div className="font-semibold">
                  {formatDateTime(offer.expiration)}
                </div>
              </div>
            </div>

            {/* Contingencies */}
            <div className="mt-3 text-sm">
              <div className="text-gray-500 text-xs">
                Contingencies
              </div>
              <div className="whitespace-pre-wrap">
                {offer.contingencies || '-'}
              </div>
            </div>
          </section>

          {/* Status + notes edit */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">
              Status & Notes
            </h2>

            <form onSubmit={handleSave} className="space-y-3 text-sm">
              {saveError && (
                <p className="text-sm text-red-600">{saveError}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium mb-1">
                    Status reason (optional)
                  </label>
                  <input
                    type="text"
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. lost to higher price, seller chose all-cash, etc."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Internal notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  rows={4}
                  placeholder="Context, motivations, competing offers, key constraints…"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-3 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
