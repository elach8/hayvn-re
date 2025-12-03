'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  brokerage_id: string | null;
  onboarding_completed: boolean;
};

type Mode = 'solo' | 'broker' | 'agent_at_brokerage';

function generateJoinCode(length: number = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function OnboardingInner() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [mode, setMode] = useState<Mode>('solo');

  const [brokerageName, setBrokerageName] = useState('');
  const [mlsName, setMlsName] = useState('');
  const [mlsOfficeId, setMlsOfficeId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session) {
          router.push('/sign-in');
          return;
        }

        const user = session.user;

        // Ensure agent record exists
        const { data: existing, error: existingError } = await supabase
          .from('agents')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (existingError) throw existingError;

        let agentRow: Agent;

        if (!existing) {
          const fullName =
            (user.user_metadata && user.user_metadata.full_name) ||
            user.email ||
            'Agent';

          const { data: newAgent, error: agentError } = await supabase
            .from('agents')
            .insert({
              id: user.id,
              full_name: fullName,
              email: user.email,
              role: 'agent',
              brokerage_id: null,
              onboarding_completed: false,
            })
            .select()
            .single();

          if (agentError) throw agentError;
          agentRow = newAgent as Agent;
        } else {
          agentRow = existing as Agent;
        }

        // If onboarding already done, bounce to dashboard
        if (agentRow.onboarding_completed) {
          router.push('/dashboard');
          return;
        }

        // Pre-fill brokerage name if they already have one
        if (agentRow.brokerage_id) {
          const { data: brokerage, error: brokerageError } = await supabase
            .from('brokerages')
            .select('*')
            .eq('id', agentRow.brokerage_id)
            .maybeSingle();

          if (!brokerageError && brokerage && brokerage.name) {
            setBrokerageName(brokerage.name as string);
          }
        }

        setAgent(agentRow);
        setLoading(false);
      } catch (err: any) {
        console.error('Onboarding load error:', err);
        setError(err?.message ?? 'Failed to load onboarding');
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agent) return;

    setSaving(true);
    setError(null);

    try {
      let brokerageId = agent.brokerage_id;
      const trimmedName = brokerageName.trim();

      if (mode === 'solo') {
        // Solo agent → create or reuse a solo brokerage
        if (!brokerageId) {
          const { data: brokerage, error: brokerageError } = await supabase
            .from('brokerages')
            .insert({
              name:
                trimmedName ||
                `${agent.full_name || agent.email || 'Agent'} Real Estate`,
              is_solo: true,
            })
            .select()
            .single();

          if (brokerageError) throw brokerageError;
          brokerageId = brokerage.id as string;
        } else if (trimmedName) {
          await supabase
            .from('brokerages')
            .update({ name: trimmedName })
            .eq('id', brokerageId);
        }

        const { error: updateError } = await supabase
          .from('agents')
          .update({
            role: 'agent',
            brokerage_id: brokerageId,
            onboarding_completed: true,
          })
          .eq('id', agent.id);

        if (updateError) throw updateError;
      } else if (mode === 'broker') {
        // Broker / team lead
        if (!trimmedName) {
          throw new Error('Please enter your brokerage or team name.');
        }

        const newJoinCode = generateJoinCode();

        const { data: brokerage, error: brokerageError } = await supabase
          .from('brokerages')
          .insert({
            name: trimmedName,
            is_solo: false,
            mls_name: mlsName.trim() || null,
            mls_office_id: mlsOfficeId.trim() || null,
            join_code: newJoinCode,
          })
          .select()
          .single();

        if (brokerageError) throw brokerageError;
        brokerageId = brokerage.id as string;

        const { error: updateError } = await supabase
          .from('agents')
          .update({
            role: 'broker',
            brokerage_id: brokerageId,
            onboarding_completed: true,
          })
          .eq('id', agent.id);

        if (updateError) throw updateError;

        // In a future step we can show the join code on a settings page
        // For now, it's stored in brokerages.join_code.
      } else if (mode === 'agent_at_brokerage') {
        // Agent at brokerage → must have a join code
        const trimmedCode = joinCode.trim().toUpperCase();
        if (!trimmedCode) {
          throw new Error('Please enter the join code from your broker.');
        }

        const { data: brokerage, error: brokerageError } = await supabase
          .from('brokerages')
          .select('*')
          .eq('join_code', trimmedCode)
          .maybeSingle();

        if (brokerageError) throw brokerageError;
        if (!brokerage) {
          throw new Error('Invalid join code. Please check with your broker.');
        }

        const finalBrokerageId = brokerage.id as string;

        const { error: updateError } = await supabase
          .from('agents')
          .update({
            role: 'agent',
            brokerage_id: finalBrokerageId,
            onboarding_completed: true,
          })
          .eq('id', agent.id);

        if (updateError) throw updateError;
      }

      router.push('/dashboard');
    } catch (err: any) {
      console.error('Onboarding save error:', err);
      setError(err?.message ?? 'Failed to save onboarding');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="p-6">
        <div className="text-sm text-gray-500">Loading onboarding…</div>
      </main>
    );
  }

  if (error && !agent) {
    return (
      <main className="p-6">
        <div className="text-sm text-red-600">{error}</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white shadow-sm border border-gray-200 p-6 space-y-5"
      >
        <header className="space-y-2">
          <h1 className="text-xl font-semibold">Welcome to Hayvn-RE</h1>
          <p className="text-sm text-gray-500">
            Tell us how you&apos;re using the app so we can set things up
            correctly.
          </p>
        </header>

        <section className="space-y-2">
          <p className="text-xs font-medium text-gray-700">
            How will you use Hayvn-RE?
          </p>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="solo"
                checked={mode === 'solo'}
                onChange={() => setMode('solo')}
              />
              <span>I&apos;m a solo agent (just me)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="broker"
                checked={mode === 'broker'}
                onChange={() => setMode('broker')}
              />
              <span>I run a brokerage or team</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="agent_at_brokerage"
                checked={mode === 'agent_at_brokerage'}
                onChange={() => setMode('agent_at_brokerage')}
              />
              <span>I&apos;m an agent at a brokerage</span>
            </label>
          </div>
        </section>

        {/* Brokerage name field: used for solo & broker */}
        {(mode === 'solo' || mode === 'broker') && (
          <section className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              Brokerage / team name
              <input
                type="text"
                value={brokerageName}
                onChange={(e) => setBrokerageName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder={
                  mode === 'solo'
                    ? 'e.g. John Smith Real Estate'
                    : 'e.g. ACME Realty'
                }
              />
            </label>
          </section>
        )}

        {/* Join code field: only for agent_at_brokerage */}
        {mode === 'agent_at_brokerage' && (
          <section className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              Join code from your broker
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tracking-[0.2em] uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g. 7FJ92KQ3"
              />
            </label>
            <p className="text-xs text-gray-500">
              Your broker can find this join code in their Hayvn-RE settings.
            </p>
          </section>
        )}

        {/* MLS fields only when broker */}
        {mode === 'broker' && (
          <section className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              MLS (optional)
              <input
                type="text"
                value={mlsName}
                onChange={(e) => setMlsName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g. CRMLS"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              MLS office ID (optional)
              <input
                type="text"
                value={mlsOfficeId}
                onChange={(e) => setMlsOfficeId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Office ID from your MLS"
              />
            </label>
          </section>
        )}

        {error && (
          <p className="text-xs text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-indigo-600 text-white text-sm font-medium px-3 py-2.5 hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Continue to dashboard'}
        </button>
      </form>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingInner />
    </RequireAuth>
  );
}

