// app/tours/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
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

  // Per-stop save state
  const [savingStopId, setSavingStopId] = useState<string | null>(null);
  const [saveStopError, setSaveStopError] = useState<string | null>(null);

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
            client_rating:
              Number.isNaN(n) || value.trim() === '' ? null : n,
          };
        }
        if (field === 'stop_order') {
          const n = value.trim() ? Number(value) : NaN;
          return {
            ...s,
            stop_order:
              Number.isNaN(n) || value.trim() === '' ? null : n,
          };
        }
        return { ...s, client_feedback: value };
      }),
    );
  };

  const handleSaveTour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tour) return;

    setSavingTour(true);
    setSaveTourError(null);

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

    setSavingTour(false);
  };

  const handleSaveStop = async (stopId: string) => {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return;

    setSavingStopId(stopId);
    setSaveStopError(null);

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
    }

    setSavingStopId(null);
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

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 pb-8 text-slate-100">
      <header className="flex items-center justify-between mb-4 gap-2 pt-6">
        <Link
          href="/tours"
          className="text-sm text-slate-300 hover:text-white hover:underline"
        >
          ← Back to Tours
        </Link>
        <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 uppercase tracking-wide">
          Tour Detail
        </span>
      </header>

      {loading && (
        <p className="text-sm text-slate-300">Loading tour…</p>
      )}

      {error && (
        <p className="text-sm text-red-300 mb-4">
          Error loading tour: {error}
        </p>
      )}

      {!loading && !error && !tour && (
        <p className="text-sm text-slate-300">Tour not found.</p>
      )}

      {!loading && !error && tour && (
        <>
          {/* Tour summary + edit status/notes */}
          <section className="mb-6 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2 gap-3">
              <div>
                <h1 className="text-xl font-semibold mb-1">
                  {tour.title || 'Untitled tour'}
                </h1>
                <div className="text-sm text-slate-300">
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
              <div className="text-xs text-slate-400 text-right">
                <div>Start: {formatDateTime(tour.start_time)}</div>
                {tour.end_time && (
                  <div>End: {formatDateTime(tour.end_time)}</div>
                )}
              </div>
            </div>

            <form
              onSubmit={handleSaveTour}
              className="mt-3 space-y-3 text-sm"
            >
              {saveTourError && (
                <p className="text-sm text-red-300">
                  {saveTourError}
                </p>
              )}

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

          {/* Route sheet */}
          <section className="mb-6 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Route Sheet</h2>
              <span className="text-xs text-slate-400">
                {routeStops.length} stop
                {routeStops.length === 1 ? '' : 's'}
              </span>
            </div>

            {stopsLoading && (
              <p className="text-sm text-slate-300">
                Building route…
              </p>
            )}

            {!stopsLoading && routeStops.length === 0 && (
              <p className="text-sm text-slate-300">
                No stops found for this tour.
              </p>
            )}

            {!stopsLoading && routeStops.length > 0 && (
              <ol className="space-y-2 text-sm list-decimal list-inside">
                {routeStops.map((stop, index) => {
                  const n =
                    stop.stop_order != null
                      ? stop.stop_order
                      : index + 1;
                  return (
                    <li key={stop.id} className="pl-1">
                      {stop.property ? (
                        <div>
                          <div className="font-medium text-slate-100">
                            Stop {n}: {stop.property.address}
                          </div>
                          <div className="text-xs text-slate-400">
                            {stop.property.city}, {stop.property.state}{' '}
                            • {stop.property.property_type || '-'} •{' '}
                            {formatPrice(stop.property.list_price)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Stage: {stop.property.pipeline_stage}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">
                          (missing property)
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* Stops table */}
          <section className="mb-6 border border-white/10 rounded-xl bg-black/40 backdrop-blur-sm p-4 sm:p-5">
            <h2 className="text-lg font-semibold mb-3">
              Stops on this Tour
            </h2>

            {stopsError && (
              <p className="text-sm text-red-300 mb-2">
                Error loading stops: {stopsError}
              </p>
            )}

            {stopsLoading && (
              <p className="text-sm text-slate-300">
                Loading stops…
              </p>
            )}

            {!stopsLoading && stops.length === 0 && (
              <p className="text-sm text-slate-300">
                No stops found. (They should have been created when you
                created the tour.)
              </p>
            )}

            {!stopsLoading && stops.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-white/10 text-xs sm:text-sm bg-black/30">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">
                        #
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">
                        Property
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">
                        Feedback
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-left text-slate-300">
                        Rating
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-right text-slate-300">
                        Save
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((stop) => (
                      <tr key={stop.id} className="align-top">
                        <td className="border border-white/10 px-2 py-1 w-[60px]">
                          <input
                            type="number"
                            className="w-full border border-white/20 bg-black/40 rounded-md px-1 py-0.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                            value={
                              stop.stop_order != null
                                ? String(stop.stop_order)
                                : ''
                            }
                            onChange={(e) =>
                              updateStopField(
                                stop.id,
                                'stop_order',
                                e.target.value,
                              )
                            }
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
                                {stop.property.city},{' '}
                                {stop.property.state} •{' '}
                                {stop.property.property_type || '-'} •{' '}
                                {formatPrice(stop.property.list_price)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Stage: {stop.property.pipeline_stage}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">
                              (missing property)
                            </span>
                          )}
                        </td>
                        <td className="border border-white/10 px-2 py-1">
                          <textarea
                            className="w-full border border-white/20 bg-black/40 rounded-md px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                            rows={3}
                            placeholder="Client feedback for this stop"
                            value={stop.client_feedback || ''}
                            onChange={(e) =>
                              updateStopField(
                                stop.id,
                                'client_feedback',
                                e.target.value,
                              )
                            }
                          />
                        </td>
                        <td className="border border-white/10 px-2 py-1 w-[90px]">
                          <input
                            type="number"
                            min={1}
                            max={5}
                            className="w-full border border-white/20 bg-black/40 rounded-md px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                            placeholder="1–5"
                            value={
                              stop.client_rating != null
                                ? String(stop.client_rating)
                                : ''
                            }
                            onChange={(e) =>
                              updateStopField(
                                stop.id,
                                'client_rating',
                                e.target.value,
                              )
                            }
                          />
                        </td>
                        <td className="border border-white/10 px-2 py-1 text-right align-top">
                          <button
                            type="button"
                            onClick={() => handleSaveStop(stop.id)}
                            disabled={savingStopId === stop.id}
                            className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#EBD27A] text-slate-900 text-xs font-semibold hover:bg-[#f1db91] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                          >
                            {savingStopId === stop.id
                              ? 'Saving…'
                              : 'Save'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {saveStopError && (
                  <p className="text-xs text-red-300 mt-2">
                    {saveStopError}
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
