// app/settings/page.tsx
'use client';

import { useEffect, useState } from 'react';
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

