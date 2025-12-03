'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Client = {
  id: string;
  name: string;
  client_type: string | null;
};

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  list_price: number | null;
};

const STATUS_OPTIONS = [
  'draft',
  'submitted',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
];

const FINANCING_OPTIONS = [
  'cash',
  'conventional',
  'fha',
  'va',
  'other',
];

export default function NewOfferPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Form state
  const [propertyId, setPropertyId] = useState('');
  const [clientId, setClientId] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');

  const [offerPrice, setOfferPrice] = useState('');
  const [earnestMoney, setEarnestMoney] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [financingType, setFinancingType] = useState('conventional');
  const [contingencies, setContingencies] = useState(
    'inspection, appraisal, loan'
  );
  const [closeDate, setCloseDate] = useState(''); // yyyy-mm-dd
  const [expiration, setExpiration] = useState(''); // datetime-local

  const [status, setStatus] = useState('draft');
  const [statusReason, setStatusReason] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const loadLookups = async () => {
      setLoadingLookups(true);
      setLookupError(null);

      const [clientsRes, propertiesRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id, name, client_type')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('properties')
          .select('id, address, city, state, list_price')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (clientsRes.error) {
        console.error('Error loading clients:', clientsRes.error);
        setLookupError(clientsRes.error.message);
      } else {
        setClients((clientsRes.data || []) as Client[]);
      }

      if (propertiesRes.error) {
        console.error('Error loading properties:', propertiesRes.error);
        setLookupError(
          (prev) =>
            prev ||
            propertiesRes.error?.message ||
            'Error loading properties'
        );
      } else {
        setProperties((propertiesRes.data || []) as Property[]);
      }

      setLoadingLookups(false);
    };

    loadLookups();
  }, []);

  const toNumericOrNull = (value: string) => {
    const trimmed = value.trim().replace(/,/g, '');
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isNaN(n) ? null : n;
  };

  const toIsoOrNull = (value: string) => {
    if (!value.trim()) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (!propertyId) {
      setSaveError('Select a property.');
      return;
    }

    if (!clientId) {
      setSaveError('Select a client.');
      return;
    }

    if (!offerPrice.trim()) {
      setSaveError('Offer price is required.');
      return;
    }

    setSaving(true);

    const offerPriceNum = toNumericOrNull(offerPrice);
    const earnestMoneyNum = toNumericOrNull(earnestMoney);
    const downPaymentNum = toNumericOrNull(downPayment);
    const expirationIso = toIsoOrNull(expiration);
    const closeDateVal = closeDate.trim() || null;

    const { error } = await supabase.from('offers').insert([
      {
        property_id: propertyId,
        client_id: clientId,
        side,
        offer_price: offerPriceNum,
        earnest_money: earnestMoneyNum,
        down_payment: downPaymentNum,
        financing_type: financingType.trim() || null,
        contingencies: contingencies.trim() || null,
        close_date: closeDateVal,
        expiration: expirationIso,
        status,
        status_reason: statusReason.trim() || null,
        notes: notes.trim() || null,
      },
    ]);

    if (error) {
      console.error('Error creating offer:', error);
      setSaveError(error.message || 'Failed to create offer.');
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push('/offers');
  };

  const formatSuggestedPrice = () => {
    if (!propertyId) return '';
    const p = properties.find((x) => x.id === propertyId);
    if (!p?.list_price) return '';
    return `$${p.list_price.toLocaleString()}`;
  };

  return (
    <main className="min-h-screen max-w-3xl">
      <header className="flex items-center justify-between mb-3 gap-2">
        <div>
          <h1 className="text-2xl font-bold mb-1">New Offer</h1>
          <p className="text-sm text-gray-700">
            Create an offer from a client on a property.
          </p>
        </div>
        <Link
          href="/offers"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to Offers
        </Link>
      </header>

      {loadingLookups && (
        <p className="text-sm text-gray-600 mb-4">
          Loading clients and properties…
        </p>
      )}

      {lookupError && (
        <p className="text-sm text-red-600 mb-4">
          {lookupError}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 border border-gray-200 rounded-lg p-4"
      >
        {saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}

        {/* Property + Client */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Property *
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Select property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address} – {p.city}, {p.state}
                </option>
              ))}
            </select>
            {propertyId && (
              <p className="text-xs text-gray-500 mt-1">
                List price: {formatSuggestedPrice() || '-'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Client *
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.client_type ? ` (${c.client_type})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Side + status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Side
            </label>
            <select
              value={side}
              onChange={(e) =>
                setSide(e.target.value as 'buy' | 'sell')
              }
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="buy">buy</option>
              <option value="sell">sell</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
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

          <div>
            <label className="block text-sm font-medium mb-1">
              Status reason (optional)
            </label>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. lost to higher price"
            />
          </div>
        </div>

        {/* Money fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Offer price *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. 850000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Earnest money
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={earnestMoney}
              onChange={(e) => setEarnestMoney(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. 25000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Down payment
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={downPayment}
              onChange={(e) => setDownPayment(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. 170000"
            />
          </div>
        </div>

        {/* Terms */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Financing type
            </label>
            <select
              value={financingType}
              onChange={(e) => setFinancingType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {FINANCING_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Close date
            </label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Expiration
            </label>
            <input
              type="datetime-local"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Contingencies
          </label>
          <textarea
            value={contingencies}
            onChange={(e) => setContingencies(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Internal notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            rows={3}
            placeholder="Talking points, reasoning, client constraints…"
          />
        </div>

        <button
          type="submit"
          disabled={saving || loadingLookups}
          className="inline-flex items-center px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
        >
          {saving ? 'Creating offer…' : 'Create Offer'}
        </button>
      </form>
    </main>
  );
}
