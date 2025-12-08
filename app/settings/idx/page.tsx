// app/settings/idx/page.tsx
'use client';

import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../../components/RequireAuth';
import Link from 'next/link';

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
};

type TestResult = {
  loading: boolean;
  ok: boolean | null;
  message: string | null;
};

function statusChip(status: IdxStatus | null) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2.5 py-0.5 text-[11px] text-slate-200">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
        Not set
      </span>
    );
  }

  if (status === 'live') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-0.5 text-[11px] text-emerald-100">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Live
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-950/50 px-2.5 py-0.5 text-[11px] text-amber-100">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
        Pending
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-900/70 px-2.5 py-0.5 text-[11px] text-slate-200">
      <span className="mr-1 h-1.5 w-1.5 rounded-full bg-slate-500" />
      Disabled
    </span>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function IdxSettingsInner() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [brokerage, setBrokerage] = useState<Brokerage | null>(null);
  const [connections, setConnections] = useState<IdxConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {}
  );

  const isBroker = agent?.role === 'broker';

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

        if (!typedAgent.brokerage_id) {
          setLoading(false);
          return;
        }

        // Load brokerage
        const { data: brokerageRow, error: brokerageError } = await supabase
          .from('brokerages')
          .select('*')
          .eq('id', typedAgent.brokerage_id)
          .maybeSingle();

        if (brokerageError) throw brokerageError;
        setBrokerage(brokerageRow as Brokerage);

        // Load idx connections for this brokerage
        const { data: idxRows, error: idxError } = await supabase
          .from('idx_connections')
          .select('*')
          .eq('brokerage_id', typedAgent.brokerage_id)
          .order('created_at', { ascending: false });

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

  const handleCreateConnection = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!brokerage || !isBroker) return;

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const formData = new FormData(e.currentTarget);

      const connection_label = (formData.get('connection_label') || '')
        .toString()
        .trim();
      const vendor_name = (formData.get('vendor_name') || '')
        .toString()
        .trim();
      const mls_name = (formData.get('mls_name') || '').toString().trim();
      const endpoint_url = (formData.get('endpoint_url') || '')
        .toString()
        .trim();
      const username = (formData.get('username') || '').toString().trim();
      const password = (formData.get('password') || '').toString().trim();
      const api_key = (formData.get('api_key') || '').toString().trim();
      const notes = (formData.get('notes') || '').toString().trim();
      const status = (formData.get('status') || 'pending') as IdxStatus;

      const { data, error: insertError } = await supabase
        .from('idx_connections')
        .insert([
          {
            brokerage_id: brokerage.id,
            connection_label: connection_label || null,
            vendor_name: vendor_name || null,
            mls_name: mls_name || brokerage.mls_name || null,
            endpoint_url: endpoint_url || null,
            username: username || null,
            password: password || null,
            api_key: api_key || null,
            notes: notes || null,
            status,
          },
        ])
        .select('*');

      if (insertError) throw insertError;

      setConnections((prev) => [
        ...(data as IdxConnection[]),
        ...prev,
      ]);
      setInfo('IDX connection created.');
      e.currentTarget.reset();
    } catch (err: any) {
      console.error('Create idx_connection error:', err);
      setError(err?.message ?? 'Failed to create IDX connection');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (conn: IdxConnection) => {
    setTestResults((prev) => ({
      ...prev,
      [conn.id]: {
        loading: true,
        ok: null,
        message: null,
      },
    }));
    setError(null);
    setInfo(null);

    try {
      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!projectUrl) {
        throw new Error(
          'NEXT_PUBLIC_SUPABASE_URL is not set. Add it in your Vercel env.'
        );
      }

      const url = `${projectUrl}/functions/v1/idx-sync?connection_id=${encodeURIComponent(
        conn.id
      )}&dry_run=1`;

      const res = await fetch(url, {
        method: 'GET',
      });

      const json = await res.json();
      const ok = res.ok && json?.ok !== false;

      setTestResults((prev) => ({
        ...prev,
        [conn.id]: {
          loading: false,
          ok,
          message:
            json?.error ||
            json?.message ||
            (ok ? 'IDX sync test succeeded.' : 'IDX sync test reported an error.'),
        },
      }));

      if (ok) {
        setInfo('IDX sync test completed successfully.');
      } else {
        setError(
          json?.error ||
            json?.message ||
            'IDX sync test reported an error. Check connection details.'
        );
      }
    } catch (err: any) {
      console.error('IDX sync test error:', err);
      setTestResults((prev) => ({
        ...prev,
        [conn.id]: {
          loading: false,
          ok: false,
          message: err?.message ?? 'IDX sync test failed.',
        },
      }));
      setError(err?.message ?? 'IDX sync test failed.');
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

  if (!brokerage) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
          <header className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              MLS / IDX settings
            </h1>
            <p className="text-sm text-slate-300">
              Signed in as{' '}
              <span className="font-medium text-slate-50">
                {agent.full_name || agent.email}
              </span>
            </p>
          </header>
          <div className="rounded-2xl border border-slate-500/40 bg-black/40 px-4 py-3 text-sm text-slate-200">
            You&apos;re not currently linked to a brokerage, so there&apos;s no
            MLS / IDX configuration to manage here. Once you&apos;re attached
            to a brokerage, your broker can configure IDX access.
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center rounded-lg bg-slate-100 text-black text-xs font-medium px-3 py-1.5 hover:bg-white"
          >
            Back to Settings
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                MLS / IDX settings
              </h1>
              <p className="text-sm text-slate-300">
                Brokerage:{' '}
                <span className="font-medium text-slate-50">
                  {brokerage.name || '—'}
                </span>
              </p>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center rounded-lg border border-slate-600 bg-black/40 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-400"
            >
              Back to Settings
            </Link>
          </div>
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

        {/* Summary card */}
        <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2">
          <h2 className="text-sm font-medium text-slate-50">
            How MLS / IDX works in Hayvn-RE
          </h2>
          <p className="text-xs text-slate-300">
            We don&apos;t host your IDX feed ourselves. Instead, you work with
            your MLS or an IDX vendor to enable access, then paste the
            endpoint and credentials here. Hayvn-RE uses that feed to keep your
            listings, buyer matches, and market radar up to date.
          </p>
          <p className="text-[11px] text-slate-400">
            You can keep using clients, tours, and offers even without IDX. Once
            a connection is live, we&apos;ll start syncing Active, Pending, and
            recent Sold listings for your office.
          </p>
        </section>

        {/* Only broker can create / edit connections */}
        {!isBroker && (
          <section className="rounded-2xl border border-slate-600/60 bg-black/40 p-4 space-y-2">
            <h2 className="text-sm font-medium text-slate-50">
              Broker-only settings
            </h2>
            <p className="text-xs text-slate-300">
              Only the broker-of-record can create or change MLS / IDX
              connections. If your team needs listing data in Hayvn-RE, share
              this page with your broker and ask them to configure the feed.
            </p>
          </section>
        )}

        {/* New connection form (broker only) */}
        {isBroker && (
          <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
            <h2 className="text-sm font-medium text-slate-50">
              Add IDX connection
            </h2>
            <p className="text-xs text-slate-300">
              Use this if your MLS or vendor gives you a dedicated endpoint and
              credentials for your office. You can have more than one connection
              if needed (e.g. multiple MLSes).
            </p>

            <form
              onSubmit={handleCreateConnection}
              className="space-y-3 rounded-xl border border-white/10 bg-black/60 p-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                    Label
                  </label>
                  <input
                    name="connection_label"
                    className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="e.g. CRMLS Office feed"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                    Vendor name
                  </label>
                  <input
                    name="vendor_name"
                    className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="e.g. CRMLS, IDX Broker, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                    MLS name
                  </label>
                  <input
                    name="mls_name"
                    defaultValue={brokerage.mls_name ?? ''}
                    className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="e.g. CRMLS"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                    Endpoint URL
                  </label>
                  <input
                    name="endpoint_url"
                    className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="Provided by your MLS or IDX vendor"
                  />
                </div>
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
                    API key (optional)
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
                  className="w-full rounded-lg border border-white/15 bg-black/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400 min-h-[60px]"
                  placeholder="Any special instructions from your MLS or vendor."
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300 uppercase tracking-wide">
                  Status
                </label>
                <select
                  name="status"
                  className="w-full sm:w-auto rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  defaultValue="pending"
                >
                  <option value="pending">Pending (waiting on MLS)</option>
                  <option value="live">Live (ready to sync)</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-100 text-black text-xs font-medium px-3 py-1.5 hover:bg-white disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Add IDX connection'}
                </button>
                <p className="text-[11px] text-slate-400">
                  You can mark a connection Live once you&apos;ve tested it.
                </p>
              </div>
            </form>
          </section>
        )}

        {/* Existing connections list */}
        <section className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
          <h2 className="text-sm font-medium text-slate-50">
            Existing connections
          </h2>

          {connections.length === 0 ? (
            <p className="text-xs text-slate-300">
              No IDX connections configured yet. Once your MLS or vendor sends
              you endpoint and credentials, add them above.
            </p>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => {
                const test = testResults[conn.id];
                return (
                  <div
                    key={conn.id}
                    className="rounded-xl border border-white/10 bg-black/60 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-slate-50">
                            {conn.connection_label || 'IDX connection'}
                          </p>
                          {statusChip(conn.status)}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Vendor: {conn.vendor_name || '—'} • MLS:{' '}
                          {conn.mls_name || brokerage.mls_name || '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 break-all">
                          {conn.endpoint_url || 'No endpoint URL set yet.'}
                        </p>
                      </div>
                      {isBroker && (
                        <button
                          type="button"
                          onClick={() => handleTestConnection(conn)}
                          disabled={test?.loading}
                          className="rounded-lg bg-slate-100 text-black text-[11px] font-medium px-3 py-1.5 hover:bg-white disabled:opacity-60"
                        >
                          {test?.loading ? 'Testing…' : 'Test sync'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <p>
                        <span className="font-medium text-slate-300">
                          Last status:
                        </span>{' '}
                        {conn.last_status_at
                          ? formatDateTime(conn.last_status_at)
                          : '—'}
                      </p>
                      <p>
                        <span className="font-medium text-slate-300">
                          Last error:
                        </span>{' '}
                        {conn.last_error || '—'}
                      </p>
                    </div>

                    {conn.notes && (
                      <p className="text-[11px] text-slate-400">
                        <span className="font-medium text-slate-300">
                          Notes:
                        </span>{' '}
                        {conn.notes}
                      </p>
                    )}

                    {test && test.message && (
                      <p
                        className={`text-[11px] ${
                          test.ok ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        Test: {test.message}
                      </p>
                    )}
                  </div>
                );
              })}
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

