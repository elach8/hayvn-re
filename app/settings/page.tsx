// app/settings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';

type AgentRole = 'broker' | 'agent' | 'assistant' | 'admin';

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AgentRole | null;
  brokerage_id: string | null;
};

type Brokerage = {
  id: string;
  name: string | null;
  is_solo: boolean | null;
  mls_name: string | null;
  mls_office_id: string | null;
  join_code: string | null;
};

function generateJoinCode(length: number = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid 0/O and 1/I
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function getIdxEmailTemplate(brokerage: Brokerage | null, agent: Agent | null) {
  const brokerageName = brokerage?.name || '[Your Brokerage Name]';
  const mlsName = brokerage?.mls_name || '[MLS Name]';
  const mlsOfficeId = brokerage?.mls_office_id || '[MLS Office ID]';
  const agentName = agent?.full_name || '[Your Name]';
  const agentEmail = agent?.email || '[Your Email]';

  return `Hi,

I'm ${agentName} with ${brokerageName}. We would like to set up an IDX (RESO Web API / RETS or equivalent) feed for our brokerage.

Details:
• MLS: ${mlsName}
• MLS Office ID: ${mlsOfficeId}
• Primary contact email: ${agentEmail}

The IDX data will be used in a private brokerage tool called Hayvn-RE to help our team manage clients, tours, and listings. We are not building a public IDX search site at this time; this is primarily for internal brokerage workflow.

Please let us know:
1) What steps are required to authorize IDX access for our office.
2) Any paperwork or agreements we need to sign.
3) The technical details for the feed (endpoint URL, credentials, and any vendor contact if you work through a third party).

You can send any technical documentation or next steps to me at ${agentEmail}.

Thank you!`;
}

function SettingsInner() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [brokerage, setBrokerage] = useState<Brokerage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setInfo(null);

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session) {
          setError('Not signed in');
          setLoading(false);
          return;
        }

        const user = session.user;

        // Load agent
        const { data: agentRow, error: agentError } = await supabase
          .from('agents')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (agentError) throw agentError;
        if (!agentRow) {
          setError('No agent record found for this user.');
          setLoading(false);
          return;
        }

        const typedAgent = agentRow as Agent;
        setAgent(typedAgent);

        if (typedAgent.brokerage_id) {
          const { data: brokerageRow, error: brokerageError } = await supabase
            .from('brokerages')
            .select('*')
            .eq('id', typedAgent.brokerage_id)
            .maybeSingle();

          if (brokerageError) throw brokerageError;
          setBrokerage(brokerageRow as Brokerage);
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Settings load error:', err);
        setError(err?.message ?? 'Failed to load settings');
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleUpdateMlsDetails = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!brokerage) return;

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const formData = new FormData(e.currentTarget);
      const mlsName = (formData.get('mls_name') || '').toString().trim();
      const mlsOfficeId = (formData.get('mls_office_id') || '').toString().trim();

      const { data, error: updateError } = await supabase
        .from('brokerages')
        .update({
          mls_name: mlsName || null,
          mls_office_id: mlsOfficeId || null,
        })
        .eq('id', brokerage.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setBrokerage(data as Brokerage);
      setInfo('MLS details updated.');
    } catch (err: any) {
      console.error('Update MLS details error:', err);
      setError(err?.message ?? 'Failed to update MLS details');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateJoinCode = async () => {
    if (!agent || !brokerage) return;
    if (agent.role !== 'broker') return;

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const newCode = generateJoinCode();

      const { data, error: updateError } = await supabase
        .from('brokerages')
        .update({ join_code: newCode })
        .eq('id', brokerage.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setBrokerage(data as Brokerage);
      setInfo('Join code updated.');
    } catch (err: any) {
      console.error('Regenerate join code error:', err);
      setError(err?.message ?? 'Failed to regenerate join code');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyIdxEmail = async () => {
    if (!agent) return;
    const text = getIdxEmailTemplate(brokerage, agent);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setInfo('Email text copied to clipboard.');
      } else {
        setInfo('Copy not available in this browser. Please select and copy the text manually.');
      }
    } catch (err: any) {
      console.error('Clipboard copy error:', err);
      setError('Unable to copy. Please select and copy the text manually.');
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-200">
            Loading settings…
          </div>
        </div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error || 'Unable to load agent.'}
          </div>
        </div>
      </main>
    );
  }

  const isBroker = agent.role === 'broker';
  const hasBrokerage = !!brokerage;
  const hasMlsName = !!brokerage?.mls_name;
  const hasMlsOfficeId = !!brokerage?.mls_office_id;
  const idxReady = hasMlsName && hasMlsOfficeId;

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Settings
          </h1>
          <p className="text-sm text-slate-300">
            Signed in as{' '}
            <span className="font-medium text-slate-50">
              {agent.full_name || agent.email}
            </span>{' '}
            <span className="text-slate-400">
              • {agent.role || 'agent'}
            </span>
          </p>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-100">
            {info}
          </div>
        )}

        {/* Agent info card */}
        <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2">
          <h2 className="text-sm font-medium text-slate-50">Profile</h2>
          <div className="text-sm text-slate-200 space-y-1">
            <p>
              <span className="font-medium text-slate-100">Name: </span>
              <span className="text-slate-200">
                {agent.full_name || '—'}
              </span>
            </p>
            <p>
              <span className="font-medium text-slate-100">Email: </span>
              <span className="text-slate-200">
                {agent.email || '—'}
              </span>
            </p>
            <p>
              <span className="font-medium text-slate-100">Role: </span>
              <span className="capitalize text-slate-200">
                {agent.role || '—'}
              </span>
            </p>
          </div>
        </section>

        {/* Brokerage + join code section */}
        <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
          <h2 className="text-sm font-medium text-slate-50">Brokerage</h2>

          {!brokerage && (
            <p className="text-sm text-slate-300">
              You&apos;re not currently linked to a brokerage. Complete
              onboarding or contact support if this seems wrong.
            </p>
          )}

          {brokerage && (
            <>
              <div className="text-sm text-slate-200 space-y-1">
                <p>
                  <span className="font-medium text-slate-100">Name: </span>
                  <span>{brokerage.name || '—'}</span>
                </p>
                <p>
                  <span className="font-medium text-slate-100">
                    Solo practice:{' '}
                  </span>
                  <span>{brokerage.is_solo ? 'Yes' : 'No'}</span>
                </p>
                <p>
                  <span className="font-medium text-slate-100">MLS: </span>
                  <span>{brokerage.mls_name || '—'}</span>
                </p>
                <p>
                  <span className="font-medium text-slate-100">
                    MLS office ID:{' '}
                  </span>
                  <span>{brokerage.mls_office_id || '—'}</span>
                </p>
              </div>

              {isBroker && (
                <form
                  onSubmit={handleUpdateMlsDetails}
                  className="mt-3 rounded-xl border border-white/10 bg-black/60 p-3 space-y-3"
                >
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    Edit MLS details
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    If your MLS name or office ID is missing or incorrect, you can
                    update it here based on what your MLS shows in their portal.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="mls_name"
                        className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide"
                      >
                        MLS name
                      </label>
                      <input
                        id="mls_name"
                        name="mls_name"
                        defaultValue={brokerage.mls_name ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder="e.g. CRMLS"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="mls_office_id"
                        className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide"
                      >
                        MLS office ID
                      </label>
                      <input
                        id="mls_office_id"
                        name="mls_office_id"
                        defaultValue={brokerage.mls_office_id ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder="e.g. office code from your MLS"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-slate-100 text-black text-xs font-medium px-3 py-1.5 hover:bg-white disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : 'Save MLS details'}
                    </button>
                    <p className="text-[11px] text-slate-400">
                      You can keep using Hayvn-RE even if these are not set yet.
                    </p>
                  </div>
                </form>
              )}

              <div className="pt-3 border-t border-white/10 space-y-2">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Team join code
                </h3>

                {isBroker ? (
                  <>
                    <p className="text-xs text-slate-400">
                      Share this code with agents so they can join your brokerage
                      in Hayvn-RE. You can regenerate it at any time.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="rounded-xl border border-white/20 bg-black/60 px-3 py-2 text-sm font-mono tracking-[0.25em] text-[#EBD27A]">
                        {brokerage.join_code || '———'}
                      </div>
                      <button
                        type="button"
                        onClick={handleRegenerateJoinCode}
                        disabled={saving}
                        className="rounded-lg bg-[#EBD27A] text-black text-xs font-medium px-3 py-1.5 hover:bg-[#f1dd9a] disabled:opacity-60"
                      >
                        {saving ? 'Updating…' : 'Regenerate'}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    Only brokers can see and manage the join code. Ask your
                    broker for the code to share with other agents.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        {/* MLS & IDX setup section */}
        <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-slate-50">
                MLS &amp; IDX Setup
              </h2>
              <p className="text-xs text-slate-400">
                Connect your brokerage to your MLS so Hayvn-RE can pull real
                listing data. This doesn&apos;t block you from using the app;
                it simply unlocks richer insights once it&apos;s active.
              </p>
            </div>

            {hasBrokerage && (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  idxReady
                    ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100'
                    : hasMlsName || hasMlsOfficeId
                    ? 'border-amber-500/40 bg-amber-950/40 text-amber-100'
                    : 'border-slate-500/40 bg-slate-900/60 text-slate-200'
                }`}
              >
                <span
                  className={`mr-1 h-1.5 w-1.5 rounded-full ${
                    idxReady
                      ? 'bg-emerald-400'
                      : hasMlsName || hasMlsOfficeId
                      ? 'bg-amber-400'
                      : 'bg-slate-400'
                  }`}
                />
                {idxReady
                  ? 'Ready for IDX feed'
                  : hasMlsName || hasMlsOfficeId
                  ? 'Partially configured'
                  : 'Not configured yet'}
              </span>
            )}
          </div>

          {!hasBrokerage && (
            <p className="text-sm text-slate-300">
              Once you&apos;re linked to a brokerage, we&apos;ll guide you
              through MLS and IDX setup here.
            </p>
          )}

          {hasBrokerage && (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/60 p-3 space-y-2">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                  1. Confirm your MLS details
                </h3>
                <div className="text-xs text-slate-300 space-y-1">
                  <p>
                    <span className="font-medium text-slate-100">MLS: </span>
                    <span>{brokerage?.mls_name || 'Not set'}</span>
                  </p>
                  <p>
                    <span className="font-medium text-slate-100">
                      MLS office ID:{' '}
                    </span>
                    <span>{brokerage?.mls_office_id || 'Not set'}</span>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    If any of this is missing or looks wrong, your MLS
                    administrator or broker-of-record can confirm the correct
                    values. You can keep using Hayvn-RE while this is sorted
                    out.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/60 p-3 space-y-2">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                  2. Ask your MLS to enable IDX access
                </h3>
                <p className="text-xs text-slate-300">
                  Most MLS systems require a quick form or email to enable IDX
                  or RESO Web API access for your office. We&apos;ve prepared a
                  simple email you can send to your MLS support team.
                </p>

                <div className="relative">
                  <textarea
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-xs text-slate-100 font-mono leading-snug resize-none min-h-[140px]"
                    readOnly
                    value={getIdxEmailTemplate(brokerage, agent)}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleCopyIdxEmail}
                      className="rounded-lg bg-slate-100 text-black text-xs font-medium px-3 py-1.5 hover:bg-white"
                    >
                      Copy email text
                    </button>
                    <p className="text-[11px] text-slate-400">
                      Paste this into your email client, adjust if needed, and
                      send it to your MLS support.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/60 p-3 space-y-2">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                  3. Keep using Hayvn-RE while IDX is pending
                </h3>
                <p className="text-xs text-slate-300">
                  You can continue using clients, tours, offers, and other
                  tools today. Once your MLS or IDX vendor sends connection
                  details, we&apos;ll add a place here to store the technical
                  settings and start syncing listing data.
                </p>
                {!isBroker && (
                  <p className="text-[11px] text-slate-400">
                    If you&apos;re not the broker-of-record, share this page
                    with your broker so they can request IDX access on behalf of
                    the office.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsInner />
    </RequireAuth>
  );
}


