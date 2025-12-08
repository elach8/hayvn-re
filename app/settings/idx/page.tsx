// app/settings/idx/page.tsx
'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../../components/RequireAuth';

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
  mls_name: string | null;
  mls_office_id: string | null;
};

type IdxStatus = 'pending' | 'live' | 'disabled';

type IdxConnection = {
  id: string;
  brokerage_id: string;
  mls_name: string | null;
  connection_label: string | null;
  vendor_name: string | null;
  endpoint_url: string | null;
  username: string | null;
  password: string | null;
  api_key: string | null;
  notes: string | null;
  status: IdxStatus | null;
  last_status_at: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const IDX_STATUSES: IdxStatus[] = ['pending', 'live', 'disabled'];

function badgeClasses(status: IdxStatus | null | undefined) {
  if (status === 'live') {
    return {
      wrapper:
        'border-emerald-500/40 bg-emerald-950/40 text-emerald-100',
      dot: 'bg-emerald-400',
      label: 'Live',
    };
  }
  if (status === 'disabled') {
    return {
      wrapper: 'border-slate-500/40 bg-slate-900/70 text-slate-200',
      dot: 'bg-slate-400',
      label: 'Disabled',
    };
  }
  // pending or null
  return {
    wrapper: 'border-amber-500/40 bg-amber-950/40 text-amber-100',
    dot: 'bg-amber-400',
    label: 'Pending',
  };
}

function IdxSettingsInner() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [brokerage, setBrokerage] = useState<Brokerage | null>(null);
  const [connections, setConnections] = useState<IdxConnection[]>([]);
  const [creatingNew, setCreatingNew] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setInfo(null);
        setLoading(true);

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

        if (!typedAgent.brokerage_id) {
          setInfo('You are not linked to a brokerage yet.');
          setLoading(false);
          return;
        }

        // Load brokerage
        const { data: brokerageRow, error: brokerageError } = await supabase
          .from('brokerages')
          .select('id, name, mls_name, mls_office_id')
          .eq('id', typedAgent.brokerage_id)
          .maybeSingle();

        if (brokerageError) throw brokerageError;
        if (!brokerageRow) {
          setError('Brokerage not found for this agent.');
          setLoading(false);
          return;
        }

        setBrokerage(brokerageRow as Brokerage);

        // Load IDX connections
        const { data: idxRows, error: idxError } = await supabase
          .from('idx_connections')
          .select('*')
          .eq('brokerage_id', brokerageRow.id)
          .order('created_at', { ascending: true });

        if (idxError) throw idxError;

        setConnections((idxRows || []) as IdxConnection[]);
        setLoading(false);
      } catch (err: any) {
        console.error('IDX settings load error:', err);
        setError(err?.message ?? 'Failed to load IDX settings');
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleSaveExisting = async (
    id: string,
    e: FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (!brokerage) return;

    setSavingId(id);
    setError(null);
    setInfo(null);

    try {
      const formData = new FormData(e.currentTarget);

      const payload = {
        mls_name: (formData.get('mls_name') || '').toString().trim() || null,
        connection_label:
          (formData.get('connection_label') || '').toString().trim() || null,
        vendor_name:
          (formData.get('vendor_name') || '').toString().trim() || null,
        endpoint_url:
          (formData.get('endpoint_url') || '').toString().trim() || null,
        username:
          (formData.get('username') || '').toString().trim() || null,
        password:
          (formData.get('password') || '').toString().trim() || null,
        api_key: (formData.get('api_key') || '').toString().trim() || null,
        notes: (formData.get('notes') || '').toString().trim() || null,
        status: (formData.get('status') || '').toString().trim() || 'pending',
      };

      const { data, error: updateError } = await supabase
        .from('idx_connections')
        .update(payload)
        .eq('id', id)
        .eq('brokerage_id', brokerage.id)
        .select()
        .single();

      if (updateError) throw updateError;

      const updated = data as IdxConnection;
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? updated : c)),
      );
      setInfo('IDX connection updated.');
    } catch (err: any) {
      console.error('Update IDX connection error:', err);
      setError(err?.message ?? 'Failed to update IDX connection');
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateNew = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!brokerage) return;

    setSavingId('new');
    setError(null);
    setInfo(null);

    try {
      const formData = new FormData(e.currentTarget);

      const payload = {
        brokerage_id: brokerage.id,
        mls_name: (formData.get('mls_name') || '').toString().trim() || null,
        connection_label:
          (formData.get('connection_label') || '').toString().trim() || null,
        vendor_name:
          (formData.get('vendor_name') || '').toString().trim() || null,
        endpoint_url:
          (formData.get('endpoint_url') || '').toString().trim() || null,
        username:
          (formData.get('username') || '').toString().trim() || null,
        password:
          (formData.get('password') || '').toString().trim() || null,
        api_key: (formData.get('api_key') || '').toString().trim() || null,
        notes: (formData.get('notes') || '').toString().trim() || null,
        status: (formData.get('status') || '').toString().trim() || 'pending',
      };

      const { data, error: insertError } = await supabase
        .from('idx_connections')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;

      const created = data as IdxConnection;
      setConnections((prev) => [...prev, created]);
      setCreatingNew(false);
      setInfo('IDX connection created.');
    } catch (err: any) {
      console.error('Create IDX connection error:', err);
      setError(err?.message ?? 'Failed to create IDX connection');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!brokerage) return;
    setDeletingId(id);
    setError(null);
    setInfo(null);

    try {
      const { error: deleteError } = await supabase
        .from('idx_connections')
        .delete()
        .eq('id', id)
        .eq('brokerage_id', brokerage.id);

      if (deleteError) throw deleteError;

      setConnections((prev) => prev.filter((c) => c.id !== id));
      setInfo('IDX connection deleted.');
    } catch (err: any) {
      console.error('Delete IDX connection error:', err);
      setError(err?.message ?? 'Failed to delete IDX connection');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-200">
            Loading IDX settings…
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

  if (agent.role !== 'broker') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
          <header>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              MLS / IDX Settings
            </h1>
            <p className="text-sm text-slate-300">
              Signed in as{' '}
              <span className="font-medium text-slate-50">
                {agent.full_name || agent.email}
              </span>{' '}
              <span className="text-slate-400">• {agent.role}</span>
            </p>
          </header>
          <div className="rounded-2xl border border-slate-500/40 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
            Only brokers can manage IDX connections for a brokerage. If you
            think this is incorrect, contact your broker or Hayvn-RE support.
          </div>
        </div>
      </main>
    );
  }

  if (!brokerage) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
          <header>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              MLS / IDX Settings
            </h1>
          </header>
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error || 'No brokerage found for this broker.'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            MLS / IDX Settings
          </h1>
          <p className="text-sm text-slate-300">
            Brokerage:{' '}
            <span className="font-medium text-slate-50">
              {brokerage.name || '—'}
            </span>
            {brokerage.mls_name && (
              <span className="text-slate-400">
                {' '}
                • MLS {brokerage.mls_name}
              </span>
            )}
            {brokerage.mls_office_id && (
              <span className="text-slate-400">
                {' '}
                • Office ID {brokerage.mls_office_id}
              </span>
            )}
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

        <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-slate-50">
              IDX Connections
            </h2>
            <p className="text-xs text-slate-400">
              Store the technical details you receive from your MLS or IDX
              vendor. You can add multiple connections (for example, if you
              connect different MLSes or a back-office feed).
            </p>
          </div>

          {connections.length === 0 && !creatingNew && (
            <div className="rounded-xl border border-dashed border-slate-600/60 bg-black/40 px-4 py-3 text-xs text-slate-300">
              No IDX connections yet. When your MLS or vendor sends connection
              info, click “Add connection” to store it here.
            </div>
          )}

          <div className="space-y-4">
            {connections.map((conn) => {
              const badge = badgeClasses(conn.status || 'pending');
              const isSaving = savingId === conn.id;
              const isDeleting = deletingId === conn.id;

              return (
                <form
                  key={conn.id}
                  onSubmit={(e) => handleSaveExisting(conn.id, e)}
                  className="rounded-xl border border-white/10 bg-black/60 p-3 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wide">
                        {conn.connection_label || 'IDX connection'}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Created {conn.created_at
                          ? new Date(conn.created_at).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${badge.wrapper}`}
                    >
                      <span
                        className={`mr-1 h-1.5 w-1.5 rounded-full ${badge.dot}`}
                      />
                      {badge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                        Label
                      </label>
                      <input
                        name="connection_label"
                        defaultValue={conn.connection_label ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder="e.g. Office IDX feed"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                        Vendor
                      </label>
                      <input
                        name="vendor_name"
                        defaultValue={conn.vendor_name ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder="e.g. CRMLS, IDX Broker"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                        MLS name (override)
                      </label>
                      <input
                        name="mls_name"
                        defaultValue={conn.mls_name ?? brokerage.mls_name ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      Endpoint URL
                    </label>
                    <input
                      name="endpoint_url"
                      defaultValue={conn.endpoint_url ?? ''}
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="https://..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                        Username
                      </label>
                      <input
                        name="username"
                        defaultValue={conn.username ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                        Password
                      </label>
                      <input
                        name="password"
                        type="password"
                        defaultValue={conn.password ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                        API key
                      </label>
                      <input
                        name="api_key"
                        defaultValue={conn.api_key ?? ''}
                        className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      Notes (what this feed is used for)
                    </label>
                    <textarea
                      name="notes"
                      defaultValue={conn.notes ?? ''}
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none min-h-[70px]"
                      placeholder="Any special instructions, rate limits, etc."
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                        Status
                      </label>
                      <select
                        name="status"
                        defaultValue={conn.status || 'pending'}
                        className="rounded-lg border border-white/15 bg-black/70 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        {IDX_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="rounded-lg bg-slate-100 text-black text-xs font-medium px-3 py-1.5 hover:bg-white disabled:opacity-60"
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDelete(conn.id)}
                        className="rounded-lg border border-red-500/50 text-red-200 text-xs font-medium px-3 py-1.5 hover:bg-red-900/40 disabled:opacity-60"
                      >
                        {isDeleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {conn.last_error && (
                    <p className="text-[11px] text-red-300">
                      Last error: {conn.last_error}
                    </p>
                  )}
                </form>
              );
            })}

            {creatingNew && (
              <form
                onSubmit={handleCreateNew}
                className="rounded-xl border border-dashed border-emerald-500/50 bg-emerald-950/20 p-3 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-semibold text-emerald-100 uppercase tracking-wide">
                      New IDX connection
                    </h3>
                    <p className="text-[11px] text-emerald-200/80">
                      Paste the details from your MLS or IDX vendor. You can
                      edit this later.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      Label
                    </label>
                    <input
                      name="connection_label"
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="e.g. Office IDX feed"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      Vendor
                    </label>
                    <input
                      name="vendor_name"
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="e.g. CRMLS, IDX Broker"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      MLS name (optional)
                    </label>
                    <input
                      name="mls_name"
                      defaultValue={brokerage.mls_name ?? ''}
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="If different from brokerage settings"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                    Endpoint URL
                  </label>
                  <input
                    name="endpoint_url"
                    className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="https://..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      Username
                    </label>
                    <input
                      name="username"
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      Password
                    </label>
                    <input
                      name="password"
                      type="password"
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      API key
                    </label>
                    <input
                      name="api_key"
                      className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none min-h-[70px]"
                    placeholder="Any special instructions, rate limits, sample queries, etc."
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue="pending"
                      className="rounded-lg border border-white/15 bg-black/70 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    >
                      {IDX_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={savingId === 'new'}
                      className="rounded-lg bg-emerald-400 text-black text-xs font-medium px-3 py-1.5 hover:bg-emerald-300 disabled:opacity-60"
                    >
                      {savingId === 'new' ? 'Saving…' : 'Create connection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatingNew(false)}
                      className="rounded-lg border border-slate-500/60 text-slate-200 text-xs font-medium px-3 py-1.5 hover:bg-slate-900/60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {!creatingNew && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setCreatingNew(true)}
                className="inline-flex items-center rounded-lg border border-emerald-400/70 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-950/40"
              >
                <span className="mr-1 text-base leading-none">＋</span>
                Add connection
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function IdxSettingsPage() {
  return (
    <RequireAuth>
      <IdxSettingsInner />
    </RequireAuth>
  );
}
