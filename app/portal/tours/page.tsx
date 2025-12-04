// app/portal/tours/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type ClientInfo = {
  id: string;
  name: string | null;
  client_type: string | null;
  stage: string | null;
};

type PortalTour = {
  id: string;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  client_id: string;
  client_name: string | null;
  client_type: string | null;
  client_stage: string | null;
  client_feedback: string | null;
  client_attending: string | null; // 'yes' | 'no' | 'maybe' | null
};

export default function PortalToursPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tours, setTours] = useState<PortalTour[]>([]);

  // Local editable state
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  const [attendingById, setAttendingById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setAuthError(null);
      setLoadError(null);
      setSaveError(null);
      setSaveSuccess(null);

      // 1) Get current auth user
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Portal tours auth error:', sessionError);
        setAuthError('You need to be signed in to view your tours.');
        setLoading(false);
        return;
      }

      if (!session) {
        setAuthError('You need to be signed in to view your tours.');
        setLoading(false);
        return;
      }

      const user = session.user;
      const email = (user.email || '').toLowerCase().trim();

      if (!email) {
        setAuthError(
          'We could not determine your email address. Please contact your agent.'
        );
        setLoading(false);
        return;
      }

      // 2) Find all clients for this email
      const {
        data: clientRows,
        error: clientError,
      } = await supabase
        .from('clients')
        .select('id, name, client_type, stage, email')
        .eq('email', email);

      if (clientError) {
        console.error('Error loading clients for portal tours:', clientError);
        setLoadError('Could not load your tours.');
        setLoading(false);
        return;
      }

      const clients: ClientInfo[] = (clientRows || []).map((row: any) => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        client_type: (row.client_type as string | null) ?? null,
        stage: (row.stage as string | null) ?? null,
      }));

      if (clients.length === 0) {
        setTours([]);
        setLoading(false);
        return;
      }

      const clientIds = clients.map((c) => c.id);
      const clientById = new Map<string, ClientInfo>();
      for (const c of clients) {
        clientById.set(c.id, c);
      }

      // 3) Load tours for those client IDs
      const {
        data: tourRows,
        error: tourError,
      } = await supabase
        .from('tours')
        .select(
          `
          id,
          title,
          status,
          start_time,
          end_time,
          client_id,
          client_feedback,
          client_attending
        `
        )
        .in('client_id', clientIds)
        .order('start_time', { ascending: true });

      if (tourError) {
        console.error('Error loading tours for portal:', tourError);
        setLoadError('Could not load your tours.');
        setLoading(false);
        return;
      }

      const mapped: PortalTour[] = (tourRows || []).map((row: any) => {
        const cid = row.client_id as string;
        const client = clientById.get(cid) || null;

        return {
          id: row.id as string,
          title: (row.title as string | null) ?? null,
          status: (row.status as string | null) ?? null,
          start_time: (row.start_time as string | null) ?? null,
          end_time: (row.end_time as string | null) ?? null,
          client_id: cid,
          client_name: client?.name ?? null,
          client_type: client?.client_type ?? null,
          client_stage: client?.stage ?? null,
          client_feedback: (row.client_feedback as string | null) ?? null,
          client_attending: (row.client_attending as string | null) ?? null,
        };
      });

      setTours(mapped);

      // Initialize editable state
      const fb: Record<string, string> = {};
      const att: Record<string, string> = {};
      for (const t of mapped) {
        fb[t.id] = t.client_feedback ?? '';
        att[t.id] = t.client_attending ?? '';
      }
      setFeedbackById(fb);
      setAttendingById(att);

      setLoading(false);
    };

    loadData();
  }, []);

  const now = useMemo(() => new Date(), []);

  const upcomingTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d >= now;
      }),
    [tours, now]
  );

  const pastTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d < now;
      }),
    [tours, now]
  );

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const formatJourneyLabel = (t: PortalTour) => {
    if (!t.client_type) return 'Journey';
    if (t.client_type === 'buyer') return 'Buying journey';
    if (t.client_type === 'seller') return 'Selling journey';
    return 'Journey';
  };

  const handleSave = async (tour: PortalTour) => {
    setSaveError(null);
    setSaveSuccess(null);
    setSavingId(tour.id);

    const feedback = (feedbackById[tour.id] ?? '').trim();
    const attending = attendingById[tour.id] || null; // '', 'yes', 'no', 'maybe'

    const { error } = await supabase
      .from('tours')
      .update({
        client_feedback: feedback || null,
        client_attending: attending,
      })
      .eq('id', tour.id);

    if (error) {
      console.error('Error saving portal tour feedback:', error);
      setSaveError(error.message || 'Could not save your changes.');
      setSavingId(null);
      return;
    }

    // Sync local tours state
    setTours((prev) =>
      prev.map((t) =>
        t.id === tour.id
          ? {
              ...t,
              client_feedback: feedback || null,
              client_attending: attending,
            }
          : t
      )
    );

    setSavingId(null);
    setSaveSuccess('Your updates were saved.');
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Your tours
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              See upcoming and past tours with your agent, confirm attendance,
              and share what worked (or didn&apos;t).
            </p>
          </div>
          <Link
            href="/portal"
            className="text-sm text-slate-400 hover:text-slate-200 hover:underline"
          >
            ← Back to portal
          </Link>
        </header>

        {authError && (
          <p className="text-sm text-red-300">{authError}</p>
        )}

        {!authError && loadError && (
          <p className="text-sm text-red-300">{loadError}</p>
        )}

        {saveError && (
          <p className="text-sm text-red-300">{saveError}</p>
        )}

        {saveSuccess && (
          <p className="text-sm text-emerald-300">{saveSuccess}</p>
        )}

        {!authError && loading && (
          <p className="text-sm text-slate-300">Loading your tours…</p>
        )}

        {!loading && !authError && tours.length === 0 && !loadError && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <p className="text-sm text-slate-300">
              Your agent hasn&apos;t scheduled any tours tied to your journeys yet.
              When they do, they&apos;ll appear here.
            </p>
          </div>
        )}

        {!loading && !authError && tours.length > 0 && (
          <div className="space-y-6 mt-2">
            {/* Upcoming */}
            {upcomingTours.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h2 className="text-lg font-semibold text-slate-50 mb-1">
                  Upcoming tours
                </h2>
                <p className="text-xs text-slate-400 mb-3">
                  Confirm if you&apos;re attending and share anything your agent
                  should know before the day.
                </p>
                <ul className="space-y-3 text-sm">
                  {upcomingTours.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-50">
                            {t.title || 'Home tour'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {t.client_name || 'Journey'} •{' '}
                            {formatJourneyLabel(t)}
                            {t.client_stage ? ` • ${t.client_stage}` : ''}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs">
                          {t.status && (
                            <span className="inline-flex items-center rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[11px] text-slate-100">
                              {t.status}
                            </span>
                          )}
                          <span className="text-slate-200">
                            {formatDateTime(t.start_time)}
                            {t.end_time
                              ? ` – ${formatDateTime(t.end_time)}`
                              : ''}
                          </span>
                        </div>
                      </div>

                      {/* Feedback / attendance controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)] gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-200">
                            Anything we should know for this tour?
                          </label>
                          <textarea
                            value={feedbackById[t.id] ?? ''}
                            onChange={(e) =>
                              setFeedbackById((prev) => ({
                                ...prev,
                                [t.id]: e.target.value,
                              }))
                            }
                            rows={3}
                            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                            placeholder="Parking, timing, who will attend, access notes…"
                          />
                        </div>

                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium mb-1 text-slate-200">
                              Will you attend?
                            </label>
                            <select
                              value={attendingById[t.id] ?? ''}
                              onChange={(e) =>
                                setAttendingById((prev) => ({
                                  ...prev,
                                  [t.id]: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                            >
                              <option value="">Not sure yet</option>
                              <option value="yes">Yes, I&apos;ll be there</option>
                              <option value="no">No, I can&apos;t make it</option>
                              <option value="maybe">
                                Maybe / still deciding
                              </option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSave(t)}
                            disabled={savingId === t.id}
                            className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg bg-[#EBD27A] text-black text-xs font-medium hover:bg-[#f3e497] disabled:opacity-60"
                          >
                            {savingId === t.id ? 'Saving…' : 'Save updates'}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Past */}
            {pastTours.length > 0 && (
              <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <h2 className="text-lg font-semibold text-slate-50 mb-1">
                  Past tours
                </h2>
                <p className="text-xs text-slate-400 mb-3">
                  Share feedback on past tours to help your agent fine-tune what
                  to show you next.
                </p>
                <ul className="space-y-3 text-sm">
                  {pastTours.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-50">
                            {t.title || 'Home tour'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {t.client_name || 'Journey'} •{' '}
                            {formatJourneyLabel(t)}
                            {t.client_stage ? ` • ${t.client_stage}` : ''}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs">
                          {t.status && (
                            <span className="inline-flex items-center rounded-full border border-white/15 bg-black/40 px-2 py-0.5 text-[11px] text-slate-100">
                              {t.status}
                            </span>
                          )}
                          <span className="text-slate-200">
                            {formatDateTime(t.start_time)}
                            {t.end_time
                              ? ` – ${formatDateTime(t.end_time)}`
                              : ''}
                          </span>
                        </div>
                      </div>

                      {/* Past tour feedback only */}
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)] gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium mb-1 text-slate-200">
                            How did this tour go?
                          </label>
                          <textarea
                            value={feedbackById[t.id] ?? ''}
                            onChange={(e) =>
                              setFeedbackById((prev) => ({
                                ...prev,
                                [t.id]: e.target.value,
                              }))
                            }
                            rows={3}
                            className="w-full rounded-lg border border.white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                            placeholder="Which homes did you like or dislike? Any standouts or dealbreakers?"
                          />
                        </div>

                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => handleSave(t)}
                            disabled={savingId === t.id}
                            className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg bg-[#EBD27A] text-black text-xs font-medium hover:bg-[#f3e497] disabled:opacity-60"
                          >
                            {savingId === t.id ? 'Saving…' : 'Save feedback'}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

