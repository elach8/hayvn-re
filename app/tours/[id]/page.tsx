// app/tours/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Tour = {
  id: string;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  client_id: string | null;
  client_name: string | null;
  client_type: string | null;
};

type TourStop = {
  id: string;
  stop_order: number | null;
  client_feedback: string | null;
  client_rating: number | null;
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    list_price: number | null;
    property_type: string | null;
    pipeline_stage: string;
  } | null;
};

const STATUS_OPTIONS = ['planned', 'in_progress', 'done', 'cancelled'];

export default function TourDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [tour, setTour] = useState<Tour | null>(null);
  const [stops, setStops] = useState<TourStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopsLoading, setStopsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stopsError, setStopsError] = useState<string | null>(null);

  // Edit tour fields
  const [status, setStatus] = useState('planned');
  const [notes, setNotes] = useState('');
  const [savingTour, setSavingTour] = useState(false);
  const [saveTourError, setSaveTourError] = useState<string | null>(null);
  const [saveTourSuccess, setSaveTourSuccess] = useState<string | null>(null);

  // Per-stop save state
  const [savingStopId, setSavingStopId] = useState<string | null>(null);
  const [saveStopError, setSaveStopError] = useState<string | null>(null);
  const [saveStopSuccess, setSaveStopSuccess] = useState<string | null>(null);

  // NEW: Tour Mode (mobile-first, one stop at a time)
  const [tourMode, setTourMode] = useState(false);
  const [activeStopIndex, setActiveStopIndex] = useState(0);

  useEffect(() => {
    if (!id) return;

    const loadTour = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('tours')
        .select(
          `
          id,
          title,
          status,
          start_time,
          end_time,
          notes,
          client_id,
          clients (
            name,
            client_type
          )
        `,
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error loading tour:', error);
        setError(error.message);
        setTour(null);
      } else if (data) {
        const row = data as any;

        const t: Tour = {
          id: row.id,
          title: row.title,
          status: row.status,
          start_time: row.start_time,
          end_time: row.end_time,
          notes: row.notes,
          client_id: row.client_id,
          client_name: row.clients?.name ?? null,
          client_type: row.clients?.client_type ?? null,
        };

        setTour(t);
        setStatus(t.status || 'planned');
        setNotes(t.notes || '');

        // Default to Tour Mode when tour is in progress
        setTourMode((prev) => prev || t.status === 'in_progress');
      }

      setLoading(false);
    };

    const loadStops = async () => {
      setStopsLoading(true);
      setStopsError(null);

      const { data, error } = await supabase
        .from('tour_properties')
        .select(
          `
          id,
          stop_order,
          client_feedback,
          client_rating,
          properties (
            id,
            address,
            city,
            state,
            list_price,
            property_type,
            pipeline_stage
          )
        `,
        )
        .eq('tour_id', id)
        .order('stop_order', { ascending: true });

      if (error) {
        console.error('Error loading tour stops:', error);
        setStopsError(error.message);
        setStops([]);
      } else {
        const mapped: TourStop[] = (data || []).map((row: any) => ({
          id: row.id,
          stop_order: row.stop_order,
          client_feedback: row.client_feedback,
          client_rating: row.client_rating,
          property: row.properties
            ? {
                id: row.properties.id,
                address: row.properties.address,
                city: row.properties.city,
                state: row.properties.state,
                list_price: row.properties.list_price,
                property_type: row.properties.property_type,
                pipeline_stage: row.properties.pipeline_stage,
              }
            : null,
        }));
        setStops(mapped);
      }

      setStopsLoading(false);
    };

    loadTour();
    loadStops();
  }, [id]);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const formatPrice = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const updateStopField = (
    stopId: string,
    field: 'client_feedback' | 'client_rating' | 'stop_order',
    value: string,
  ) => {
    setStops((prev) =>
      prev.map((s) => {
        if (s.id !== stopId) return s;

        if (field === 'client_rating') {
          const n = value.trim() ? Number(value) : NaN;
          return {
            ...s,
            client_rating: Number.isNaN(n) || value.trim() === '' ? null : n,
          };
        }

        if (field === 'stop_order') {
          const n = value.trim() ? Number(value) : NaN;
          return {
            ...s,
            stop_order: Number.isNaN(n) || value.trim() === '' ? null : n,
          };
        }

        return { ...s, client_feedback: value };
      }),
    );
  };

  const prependLine = (existing: string | null, line: string) => {
    const cur = (existing ?? '').trim();
    const l = line.trim();
    if (!l) return cur;
    if (!cur) return l;
    // Avoid duplicating same tag line back-to-back
    if (cur.split('\n')[0]?.trim() === l) return cur;
    return `${l}\n${cur}`;
  };

  const quickTag = (stopId: string, label: string) => {
    setStops((prev) =>
      prev.map((s) =>
        s.id === stopId
          ? { ...s, client_feedback: prependLine(s.client_feedback, `• ${label}`) }
          : s,
      ),
    );
  };

  const quickSetRating = (stopId: string, rating: number | null) => {
    setStops((prev) =>
      prev.map((s) => (s.id === stopId ? { ...s, client_rating: rating } : s)),
    );
  };

  const handleSaveTour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tour) return;

    setSavingTour(true);
    setSaveTourError(null);
    setSaveTourSuccess(null);

    const { error } = await supabase
      .from('tours')
      .update({
        status,
        notes: notes.trim() || null,
      })
      .eq('id', tour.id);

    if (error) {
      console.error('Error saving tour:', error);
      setSaveTourError(error.message);
      setSavingTour(false);
      return;
    }

    setTour((prev) => (prev ? { ...prev, status, notes: notes.trim() || null } : prev));
    setSavingTour(false);
    setSaveTourSuccess('Saved.');
    setTimeout(() => setSaveTourSuccess(null), 1200);
  };

  const handleSaveStop = async (stopId: string) => {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return;

    setSavingStopId(stopId);
    setSaveStopError(null);
    setSaveStopSuccess(null);

    const { error } = await supabase
      .from('tour_properties')
      .update({
        client_feedback: stop.client_feedback?.trim() || null,
        client_rating: stop.client_rating,
        stop_order: stop.stop_order,
      })
      .eq('id', stopId);

    if (error) {
      console.error('Error saving stop:', error);
      setSaveStopError(error.message);
      setSavingStopId(null);
      return;
    }

    setSavingStopId(null);
    setSaveStopSuccess('Saved stop.');
    setTimeout(() => setSaveStopSuccess(null), 1200);
  };

  // Route sheet: sort by stop_order (nulls last)
  const routeStops = useMemo(() => {
    const copy = [...stops];
    copy.sort((a, b) => {
      const ao = a.stop_order ?? 9999;
      const bo = b.stop_order ?? 9999;
      return ao - bo;
    });
    return copy;
  }, [stops]);

  // Keep activeStopIndex in bounds as stops load/change
  useEffect(() => {
    if (routeStops.length === 0) {
      setActiveStopIndex(0);
      return;
    }
    setActiveStopIndex((i) => Math.min(Math.max(i, 0), routeStops.length - 1));
  }, [routeStops.length]);

  const activeStop = routeStops[activeStopIndex] || null;

  const goPrev = () => setActiveStopIndex((i) => Math.max(0, i - 1));
  const goNext = () => setActiveStopIndex((i) => Math.min(routeStops.length - 1, i + 1));

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/tours');
  };

  const tourStatusPill = (s: string | null) => {
    const v = (s || 'planned').toLowerCase();
    const cls =
      v === 'done'
        ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200'
        : v === 'in_progress'
        ? 'border-amber-300/30 bg-amber-500/10 text-amber-200'
        : v === 'cancelled'
        ? 'border-red-300/30 bg-red-500/10 text-red-200'
        : 'border-white/15 bg-white/5 text-slate-200';

    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
        {v}
      </span>
    );
  };

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 pb-8 text-slate-100">
      <header className="flex items-center justify-between mb-4 gap-2 pt-6">
        <button
          type="button"
          onClick={handleBack}
          className="text-sm text-slate-300 hover:text-white hover:underline"
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 uppercase tracking-wide">
            Tour Detail
          </span>
        </div>
      </header>

      {loading && <p className="text-sm text-slate-300">Loading tour…</p>}

      {error && (
        <p className="text-sm text-red-300 mb-4">Error loading tour: {error}</p>
      )}

      {!loading && !error && !tour && (
        <p className="text-sm text-slate-300">Tour not found.</p>
      )}

      {!loading && !error && tour && (
        <>
          {/* Tour summary + edit status/notes */}
          <section className="mb-6 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5">
            <div className="flex items-start justify-between mb-2 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold">
                    {tour.title || 'Untitled tour'}
                  </h1>
                  {tourStatusPill(tour.status)}
                </div>

                <div className="text-sm text-slate-300 mt-1">
                  {tour.client_id ? (
                    <Link
                      href={`/clients/${tour.client_id}`}
                      className="text-[#EBD27A] hover:underline"
                    >
                      {tour.client_name || 'Client'}
                    </Link>
                  ) : (
                    <span>-</span>
                  )}
                  {tour.client_type && (
                    <span className="text-xs text-slate-400 ml-1">
                      ({tour.client_type})
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-400 text-right shrink-0">
                <div>Start: {formatDateTime(tour.start_time)}</div>
                {tour.end_time && <div>End: {formatDateTime(tour.end_time)}</div>}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-3">
              <div className="text-xs text-slate-400">
                Tour Mode is optimized for quick taps during showings.
              </div>

              <button
                type="button"
                onClick={() => setTourMode((v) => !v)}
                className={[
                  'inline-flex items-center rounded-full border px-3 py-1 text-xs transition whitespace-nowrap',
                  tourMode
                    ? 'border-amber-300/30 bg-amber-500/10 text-amber-200'
                    : 'border-white/15 bg-black/30 text-slate-200 hover:bg-white/10',
                ].join(' ')}
              >
                {tourMode ? 'Tour Mode: ON' : 'Tour Mode: OFF'}
              </button>
            </div>

            <form onSubmit={handleSaveTour} className="mt-4 space-y-3 text-sm">
              {saveTourError && <p className="text-sm text-red-300">{saveTourError}</p>}
              {saveTourSuccess && <p className="text-sm text-emerald-300">{saveTourSuccess}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[11px] font-semibold mb-1 text-slate-300 uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="border border-white/15 bg-black/40 rounded-md px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1 text-slate-300 uppercase tracking-wide">
                  Notes (internal)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-white/15 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                  rows={3}
                  placeholder="Log what happened on the tour, client reactions, follow-ups, etc."
                />
              </div>

              <button
                type="submit"
                disabled={savingTour}
                className="inline-flex items-center px-4 py-2 rounded-full bg-[#EBD27A] text-slate-900 text-sm font-semibold hover:bg-[#f1db91] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {savingTour ? 'Saving…' : 'Save Tour'}
              </button>
            </form>
          </section>

          {/* NEW: Tour Mode (one stop at a time) */}
          {tourMode && (
            <section className="mb-6 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-lg font-semibold">Tour Mode</h2>
                  <p className="text-xs text-slate-400">
                    Quick taps now; details later.
                  </p>
                </div>

                <div className="text-xs text-slate-400">
                  {routeStops.length === 0 ? '0 stops' : `Stop ${activeStopIndex + 1} / ${routeStops.length}`}
                </div>
              </div>

              {stopsLoading && <p className="text-sm text-slate-300">Loading stops…</p>}

              {!stopsLoading && routeStops.length === 0 && (
                <p className="text-sm text-slate-300">No stops found for this tour.</p>
              )}

              {!stopsLoading && activeStop && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    {activeStop.property ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-400 mb-1">
                              Stop {(activeStop.stop_order ?? activeStopIndex + 1).toString()}
                            </div>

                            <div className="text-base font-semibold text-slate-50">
                              {activeStop.property.address}
                            </div>

                            <div className="text-xs text-slate-400 mt-1">
                              {activeStop.property.city}, {activeStop.property.state} •{' '}
                              {activeStop.property.property_type || '-'} •{' '}
                              {formatPrice(activeStop.property.list_price)}
                            </div>

                            <div className="text-[11px] text-slate-500 mt-1">
                              Stage: {activeStop.property.pipeline_stage}
                            </div>

                            <div className="mt-2">
                              <Link
                                href={`/properties/${activeStop.property.id}`}
                                className="text-xs text-[#EBD27A] hover:underline"
                              >
                                Open property →
                              </Link>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-[11px] text-slate-400 mb-1">Rating</div>
                            <div className="text-sm font-semibold text-slate-100">
                              {activeStop.client_rating != null ? `${activeStop.client_rating}/5` : '—'}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-500">(missing property)</span>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Quick taps
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!activeStop) return;
                            quickSetRating(activeStop.id, 5);
                            quickTag(activeStop.id, 'Loved it');
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                        >
                          👍 Love
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!activeStop) return;
                            quickSetRating(activeStop.id, 1);
                            quickTag(activeStop.id, 'Not a fit');
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                        >
                          👎 No
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!activeStop) return;
                            quickTag(activeStop.id, 'Top contender');
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                        >
                          ⭐ Top
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!activeStop) return;
                            quickTag(activeStop.id, 'Would consider offer');
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                        >
                          💰 Offer?
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {['Noise', 'Layout', 'Kitchen', 'Yard', 'Street', 'Schools', 'Too small', 'Too pricey', 'Great value'].map(
                          (t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => activeStop && quickTag(activeStop.id, t)}
                              className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                            >
                              {t}
                            </button>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Quick note (optional)
                      </div>

                      <textarea
                        value={activeStop.client_feedback ?? ''}
                        onChange={(e) => updateStopField(activeStop.id, 'client_feedback', e.target.value)}
                        rows={5}
                        className="w-full border border-white/15 bg-black/40 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                        placeholder="Type a short note (or just use quick taps)."
                      />

                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-400">
                          Stop order:{' '}
                          <input
                            type="number"
                            value={activeStop.stop_order != null ? String(activeStop.stop_order) : ''}
                            onChange={(e) => updateStopField(activeStop.id, 'stop_order', e.target.value)}
                            className="ml-1 w-16 border border-white/15 bg-black/40 rounded-md px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSaveStop(activeStop.id)}
                          disabled={savingStopId === activeStop.id}
                          className="inline-flex items-center px-4 py-2 rounded-full bg-[#EBD27A] text-slate-900 text-xs font-semibold hover:bg-[#f1db91] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                        >
                          {savingStopId === activeStop.id ? 'Saving…' : 'Save stop'}
                        </button>
                      </div>

                      {saveStopError && <p className="text-xs text-red-300">{saveStopError}</p>}
                      {saveStopSuccess && <p className="text-xs text-emerald-300">{saveStopSuccess}</p>}
                    </div>
                  </div>

                  {/* Prev / Next */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={goPrev}
                      disabled={activeStopIndex === 0}
                      className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      ← Prev
                    </button>

                    <button
                      type="button"
                      onClick={goNext}
                      disabled={activeStopIndex >= routeStops.length - 1}
                      className="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Route sheet */}
          <section className="mb-6 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Route Sheet</h2>
              <span className="text-xs text-slate-400">
                {routeStops.length} stop{routeStops.length === 1 ? '' : 's'}
              </span>
            </div>

            {stopsLoading && <p className="text-sm text-slate-300">Building route…</p>}

            {!stopsLoading && routeStops.length === 0 && (
              <p className="text-sm text-slate-300">No stops found for this tour.</p>
            )}

            {!stopsLoading && routeStops.length > 0 && (
              <ol className="space-y-2 text-sm list-decimal list-inside">
                {routeStops.map((stop, index) => {
                  const n = stop.stop_order != null ? stop.stop_order : index + 1;
                  const isActive = stop.id === activeStop?.id;

                  return (
                    <li key={stop.id} className="pl-1">
                      {stop.property ? (
                        <div className={isActive ? 'rounded-lg border border-amber-300/30 bg-amber-500/10 p-2' : ''}>
                          <div className="font-medium text-slate-100">
                            Stop {n}: {stop.property.address}
                          </div>
                          <div className="text-xs text-slate-400">
                            {stop.property.city}, {stop.property.state} • {stop.property.property_type || '-'} •{' '}
                            {formatPrice(stop.property.list_price)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Stage: {stop.property.pipeline_stage}
                            {stop.client_rating != null ? ` • Rating: ${stop.client_rating}/5` : ''}
                          </div>

                          {tourMode && (
                            <button
                              type="button"
                              onClick={() => {
                                const idx = routeStops.findIndex((s) => s.id === stop.id);
                                if (idx >= 0) setActiveStopIndex(idx);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="mt-1 text-xs text-[#EBD27A] hover:underline"
                            >
                              Jump to this stop →
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">(missing property)</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* Stops table (details/admin mode) */}
          <section className="mb-6 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold">Stops on this Tour</h2>
              <span className="text-xs text-slate-400">Details / admin view</span>
            </div>

            {stopsError && <p className="text-sm text-red-300 mb-2">Error loading stops: {stopsError}</p>}
            {stopsLoading && <p className="text-sm text-slate-300">Loading stops…</p>}

            {!stopsLoading && stops.length === 0 && (
              <p className="text-sm text-slate-300">
                No stops found. (They should have been created when you created the tour.)
              </p>
            )}

            {!stopsLoading && stops.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-white/10 text-xs sm:text-sm bg-black/30">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">#</th>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">Property</th>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">Feedback</th>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">Rating</th>
                      <th className="border border-white/10 px-2 py-1 text-right text-slate-300">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((stop) => (
                      <tr key={stop.id} className="align-top">
                        <td className="border border-white/10 px-2 py-1 w-[60px]">
                          <input
                            type="number"
                            className="w-full border border-white/20 bg-black/40 rounded-md px-1 py-0.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                            value={stop.stop_order != null ? String(stop.stop_order) : ''}
                            onChange={(e) => updateStopField(stop.id, 'stop_order', e.target.value)}
                          />
                        </td>

                        <td className="border border-white/10 px-2 py-1 min-w-[200px]">
                          {stop.property ? (
                            <>
                              <Link
                                href={`/properties/${stop.property.id}`}
                                className="text-[#EBD27A] hover:underline"
                              >
                                {stop.property.address}
                              </Link>
                              <div className="text-[11px] text-slate-400">
                                {stop.property.city}, {stop.property.state} • {stop.property.property_type || '-'} •{' '}
                                {formatPrice(stop.property.list_price)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Stage: {stop.property.pipeline_stage}
                              </div>

                              <div className="mt-1 flex flex-wrap gap-2">
                                {['Loved it', 'Not a fit', 'Top contender', 'Would consider offer'].map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => quickTag(stop.id, t)}
                                    className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-white/10"
                                  >
                                    + {t}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">(missing property)</span>
                          )}
                        </td>

                        <td className="border border-white/10 px-2 py-1">
                          <textarea
                            className="w-full border border-white/20 bg-black/40 rounded-md px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                            rows={3}
                            placeholder="Client feedback for this stop"
                            value={stop.client_feedback || ''}
                            onChange={(e) => updateStopField(stop.id, 'client_feedback', e.target.value)}
                          />
                        </td>

                        <td className="border border-white/10 px-2 py-1 w-[90px]">
                          <input
                            type="number"
                            min={1}
                            max={5}
                            className="w-full border border-white/20 bg-black/40 rounded-md px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                            placeholder="1–5"
                            value={stop.client_rating != null ? String(stop.client_rating) : ''}
                            onChange={(e) => updateStopField(stop.id, 'client_rating', e.target.value)}
                          />
                          <div className="mt-1 flex gap-1">
                            {[1, 3, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => quickSetRating(stop.id, n)}
                                className="flex-1 rounded-md border border-white/10 bg-white/5 px-1 py-1 text-[11px] hover:bg-white/10"
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </td>

                        <td className="border border-white/10 px-2 py-1 text-right align-top">
                          <button
                            type="button"
                            onClick={() => handleSaveStop(stop.id)}
                            disabled={savingStopId === stop.id}
                            className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#EBD27A] text-slate-900 text-xs font-semibold hover:bg-[#f1db91] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                          >
                            {savingStopId === stop.id ? 'Saving…' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {saveStopError && <p className="text-xs text-red-300 mt-2">{saveStopError}</p>}
                {saveStopSuccess && <p className="text-xs text-emerald-300 mt-2">{saveStopSuccess}</p>}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
