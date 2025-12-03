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
      <main className="p-6">
        <div className="text-sm text-gray-500">Loading settings…</div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="p-6">
        <div className="text-sm text-red-600">
          {error || 'Unable to load agent.'}
        </div>
      </main>
    );
  }

  const isBroker = agent.role === 'broker';

  return (
    <main className="p-6 space-y-6 max-w-3xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">
          Signed in as {agent.full_name || agent.email} • {agent.role}
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {info && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {info}
        </div>
      )}

      {/* Agent info card */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-medium text-gray-800">Profile</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <span className="font-medium">Name: </span>
            {agent.full_name || '—'}
          </p>
          <p>
            <span className="font-medium">Email: </span>
            {agent.email || '—'}
          </p>
          <p>
            <span className="font-medium">Role: </span>
            {agent.role}
          </p>
        </div>
      </section>

      {/* Brokerage + join code section */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-medium text-gray-800">Brokerage</h2>

        {!brokerage && (
          <p className="text-sm text-gray-500">
            You&apos;re not currently linked to a brokerage. Complete onboarding
            or contact support if this seems wrong.
          </p>
        )}

        {brokerage && (
          <>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium">Name: </span>
                {brokerage.name || '—'}
              </p>
              <p>
                <span className="font-medium">Solo practice: </span>
                {brokerage.is_solo ? 'Yes' : 'No'}
              </p>
              <p>
                <span className="font-medium">MLS: </span>
                {brokerage.mls_name || '—'}
              </p>
              <p>
                <span className="font-medium">MLS office ID: </span>
                {brokerage.mls_office_id || '—'}
              </p>
            </div>

            <div className="pt-3 border-t border-gray-100 space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Team join code
              </h3>

              {isBroker ? (
                <>
                  <p className="text-xs text-gray-500">
                    Share this code with agents so they can join your brokerage
                    in Hayvn-RE. You can regenerate it at any time.
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono tracking-[0.2em]">
                      {brokerage.join_code || '———'}
                    </div>
                    <button
                      type="button"
                      onClick={handleRegenerateJoinCode}
                      disabled={saving}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
                    >
                      {saving ? 'Updating…' : 'Regenerate'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500">
                    Only brokers can see and manage the join code. Ask your
                    broker for the code to share with other agents.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </section>
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
