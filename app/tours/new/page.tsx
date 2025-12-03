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

export default function NewTourPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('planned');
  const [startTime, setStartTime] = useState(''); // datetime-local string
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');

  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);

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

  const togglePropertySelection = (id: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toISOStringOrNull = (value: string) => {
    if (!value.trim()) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (!clientId) {
      setSaveError('Select a client.');
      return;
    }

    if (!startTime) {
      setSaveError('Start time is required.');
      return;
    }

    if (selectedPropertyIds.length === 0) {
      setSaveError('Select at least one property for the tour.');
      return;
    }

    setSaving(true);

    const startIso = toISOStringOrNull(startTime);
    const endIso = toISOStringOrNull(endTime);

    const tourTitle =
      title.trim() ||
      `${clients.find((c) => c.id === clientId)?.name || 'Client'} – Tour`;

    // 1) Insert tour
    const { data: tourData, error: tourError } = await supabase
      .from('tours')
      .insert([
        {
          client_id: clientId,
          title: tourTitle,
          status,
          start_time: startIso,
          end_time: endIso,
          notes: notes.trim() || null,
        },
      ])
      .select('id')
      .maybeSingle();

    if (tourError || !tourData) {
      console.error('Error creating tour:', tourError);
      setSaveError(tourError?.message || 'Failed to create tour.');
      setSaving(false);
      return;
    }

    const tourId = tourData.id as string;

    // 2) Insert tour_properties rows
    const rows = selectedPropertyIds.map((pid, index) => ({
      tour_id: tourId,
      property_id: pid,
      stop_order: index + 1,
    }));

    const { error: stopsError } = await supabase
      .from('tour_properties')
      .insert(rows);

    if (stopsError) {
      console.error('Error attaching tour properties:', stopsError);
      setSaveError(
        'Tour created, but error attaching properties: ' +
          stopsError.message
      );
      setSaving(false);
      // Still redirect to tour list; you can fix manually later
      router.push('/tours');
      return;
    }

    setSaving(false);
    router.push('/tours');
  };

  const formatPrice = (v: number | null) =>
    v == null ? '' : `$${v.toLocaleString()}`;

  return (
    <main className="min-h-screen max-w-3xl">
      <header className="flex items-center justify-between mb-3 gap-2">
        <div>
          <h1 className="text-2xl font-bold mb-1">New Tour</h1>
          <p className="text-sm text-gray-700">
            Schedule a tour for a client and choose which properties
            you&apos;ll visit.
          </p>
        </div>
        <Link
          href="/tours"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to Tours
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

        {/* Client + basic info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

          <div>
            <label className="block text-sm font-medium mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="planned">planned</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Title (optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Jane Buyer – Saturday OC Tour"
          />
        </div>

        {/* Time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Start Time *
            </label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              End Time (optional)
            </label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Notes (internal)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            rows={3}
            placeholder="Plan, meet-up details, reminders…"
          />
        </div>

        {/* Property selection */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Properties for this tour *
          </label>
          <p className="text-xs text-gray-600 mb-2">
            Select all properties you plan to show. You can adjust order
            later in the tour detail view.
          </p>

          {properties.length === 0 && (
            <p className="text-sm text-gray-600">
              No properties in the system yet. Add some in the
              Properties section first.
            </p>
          )}

          {properties.length > 0 && (
            <div className="max-h-64 overflow-y-auto border rounded-md p-2 space-y-1 text-sm">
              {properties.map((p) => {
                const checked = selectedPropertyIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePropertySelection(p.id)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        {p.address}
                      </div>
                      <div className="text-xs text-gray-500">
                        {p.city}, {p.state}{' '}
                        {p.list_price != null &&
                          `• ${formatPrice(p.list_price)}`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {selectedPropertyIds.length > 0 && (
            <p className="text-xs text-gray-600 mt-1">
              {selectedPropertyIds.length} property
              {selectedPropertyIds.length === 1 ? '' : 'ies'} selected
              (will become stops 1–
              {selectedPropertyIds.length}).
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || loadingLookups}
          className="inline-flex items-center px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
        >
          {saving ? 'Creating tour…' : 'Create Tour'}
        </button>
      </form>
    </main>
  );
}
