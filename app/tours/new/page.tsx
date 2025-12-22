// app/tours/new/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const preselectClientId = (searchParams.get('clientId') || '').trim();

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
          .is('archived_at', null) // ✅ only non-archived properties
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (clientsRes.error) {
        console.error('Error loading clients:', clientsRes.error);
        setLookupError(clientsRes.error.message);
        setClients([]);
      } else {
        const loadedClients = (clientsRes.data || []) as Client[];
        setClients(loadedClients);

        // ✅ auto-select client when arriving from clients/[id]
        if (
          preselectClientId &&
          loadedClients.some((c) => c.id === preselectClientId)
        ) {
          setClientId(preselectClientId);
        }
      }

      if (propertiesRes.error) {
        console.error('Error loading properties:', propertiesRes.error);
        setLookupError(
          (prev) =>
            prev ||
            propertiesRes.error?.message ||
            'Error loading properties',
        );
        setProperties([]);
      } else {
        setProperties((propertiesRes.data || []) as Property[]);
      }

      setLoadingLookups(false);
    };

    loadLookups();
  }, [preselectClientId]);

  const togglePropertySelection = (id: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const toISOStringOrNull = (value: string) => {
    if (!value.trim()) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const handleBack = () => {
    // ✅ "Back" behavior (most commonly from clients/[id])
    // Fallback to /tours if opened in a fresh tab with no history.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/tours');
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
        'Tour created, but error attaching properties: ' + stopsError.message,
      );
      setSaving(false);
      router.push('/tours');
      return;
    }

    setSaving(false);
    router.push('/tours');
  };

  const formatPrice = (v: number | null) =>
    v == null ? '' : `$${v.toLocaleString()}`;

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 sm:px-6 pb-8 text-slate-100">
      <header className="flex items-center justify-between mb-4 gap-2 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Tour</h1>
          <p className="text-sm text-slate-400">
            Schedule a tour for a client and choose which properties you&apos;ll
            visit.
          </p>
        </div>

        {/* ✅ Back link (history back, not hardcoded to /tours) */}
        <button
          type="button"
          onClick={handleBack}
          className="text-sm text-slate-300 hover:text-white hover:underline"
        >
          ← Back
        </button>
      </header>

      {loadingLookups && (
        <p className="text-sm text-slate-300 mb-4">
          Loading clients and properties…
        </p>
      )}

      {lookupError && (
        <p className="text-sm text-red-300 mb-4">{lookupError}</p>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5"
      >
        {saveError && <p className="text-sm text-red-300">{saveError}</p>}

        {/* Client + basic info */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-300 uppercase tracking-wide">
              Client *
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border border-white/10 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
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
            <label className="block text-xs font-semibold mb-1 text-slate-300 uppercase tracking-wide">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-white/10 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
            >
              <option value="planned">planned</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-300 uppercase tracking-wide">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-white/10 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
              placeholder="Jane Buyer – Saturday OC Tour"
            />
          </div>

          {/* Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-300 uppercase tracking-wide">
                Start Time *
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-white/10 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-300 uppercase tracking-wide">
                End Time (optional)
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-white/10 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
              />
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-2">
          <label className="block text-xs font-semibold mb-1 text-slate-300 uppercase tracking-wide">
            Notes (internal)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-white/10 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
            rows={3}
            placeholder="Plan, meet-up details, reminders…"
          />
        </section>

        {/* Property selection */}
        <section className="space-y-2">
          <label className="block text-xs font-semibold mb-1 text-slate-300 uppercase tracking-wide">
            Properties for this tour *
          </label>
          <p className="text-xs text-slate-400 mb-1">
            Select all properties you plan to show. You can adjust order later
            in the tour detail view.
          </p>

          {properties.length === 0 && (
            <p className="text-sm text-slate-400">
              No active properties in the system yet. Add some in the Properties
              section first (or unarchive if needed).
            </p>
          )}

          {properties.length > 0 && (
            <div className="max-h-64 overflow-y-auto border border-white/10 bg-black/30 rounded-md p-2 space-y-1 text-sm">
              {properties.map((p) => {
                const checked = selectedPropertyIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-white/5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePropertySelection(p.id)}
                      className="h-4 w-4 rounded border-white/30 bg-black/60 text-[#EBD27A] focus:ring-[#EBD27A]"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-100">
                        {p.address}
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.city}, {p.state}{' '}
                        {p.list_price != null && `• ${formatPrice(p.list_price)}`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {selectedPropertyIds.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              {selectedPropertyIds.length} property
              {selectedPropertyIds.length === 1 ? '' : 'ies'} selected (will
              become stops 1–{selectedPropertyIds.length}).
            </p>
          )}
        </section>

        <button
          type="submit"
          disabled={saving || loadingLookups}
          className="inline-flex items-center px-4 py-2 rounded-full bg-[#EBD27A] text-slate-900 text-sm font-semibold hover:bg-[#f1db91] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {saving ? 'Creating tour…' : 'Create Tour'}
        </button>
      </form>
    </main>
  );
}

