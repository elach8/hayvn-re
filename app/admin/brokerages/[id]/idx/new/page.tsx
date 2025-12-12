'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type AgentRole = 'super_admin' | 'broker_admin' | 'agent';

export default function AdminNewIdxConnectionPage() {
  const params = useParams();
  const router = useRouter();
  const brokerageId = (params?.id as string) || null;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // sensible defaults for MLSListings VOW Web API
  const [connectionLabel, setConnectionLabel] = useState('MLSListings VOW');
  const [mlsName, setMlsName] = useState('MLSListings');
  const [vendorName, setVendorName] = useState('MLSListings');
  const [endpointUrl, setEndpointUrl] = useState(
    'https://vendordata.api-v2.mlslistings.com/vow'
  );

  // optional (MLSListings token-based auth typically does not need username)
  const [username, setUsername] = useState('');

  // optional: notes field (only saved if your table has it; otherwise ignored)
  // leave empty unless you want to store things like scope, contract expiry, etc.
  const [notes, setNotes] = useState('');

  const ensureSuperAdmin = async (): Promise<
    { ok: true } | { ok: false; message: string }
  > => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, message: 'You must be signed in.' };
    }

    const { data: me, error: meErr } = await supabase
      .from('agents')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (meErr || !me) {
      return { ok: false, message: 'No agent record found for this user.' };
    }

    if ((me.role as AgentRole) !== 'super_admin') {
      return { ok: false, message: 'You do not have permission to do this.' };
    }

    return { ok: true };
  };

  const onSave = async () => {
    if (!brokerageId) {
      setError('Missing brokerage id in route.');
      return;
    }

    setSaving(true);
    setError(null);

    const perm = await ensureSuperAdmin();
    if (!perm.ok) {
      setError(perm.message);
      setSaving(false);
      return;
    }

    // Basic validation
    if (!endpointUrl.trim()) {
      setError('Endpoint URL is required.');
      setSaving(false);
      return;
    }

    // Build insert payload (only include notes if you have that column)
    const payload: any = {
      brokerage_id: brokerageId,
      mls_name: mlsName?.trim() || null,
      connection_label: connectionLabel?.trim() || null,
      vendor_name: vendorName?.trim() || null,
      endpoint_url: endpointUrl?.trim() || null,
      username: username?.trim() || null,

      // start disabled until we add server-side "Test/Sync"
      status: 'disabled',
      last_status_at: null,
      last_error: null,
    };

    // Only include notes if user entered something.
    // If your table doesn't have "notes", Supabase will throw an error —
    // if that happens, tell me and I'll remove it.
    if (notes.trim()) {
      payload.notes = notes.trim();
    }

    const { error: insertErr } = await supabase
      .from('idx_connections')
      .insert(payload);

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    router.push(`/admin/brokerages/${brokerageId}`);
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6">
      <header className="mb-6">
        <div className="text-xs text-slate-400 mb-2">
          <Link
            href={`/admin/brokerages/${brokerageId}`}
            className="hover:underline underline-offset-4 text-sky-300 hover:text-sky-200"
          >
            ← Back to Brokerage
          </Link>
        </div>
        <h1 className="text-xl font-semibold">Add IDX Connection</h1>
        <p className="text-xs text-slate-400">
          This creates a row in <code className="font-mono">idx_connections</code>.
          MLS token stays server-side (env vars) — we’ll add “Test / Sync” next.
        </p>
      </header>

      <section className="max-w-xl border border-slate-800 rounded-2xl p-4 bg-slate-900/60 space-y-3">
        {error ? (
          <div className="text-sm bg-red-900/40 border border-red-700/60 rounded-xl px-4 py-3">
            {error}
          </div>
        ) : null}

        <label className="block">
          <div className="text-[11px] text-slate-400 mb-1">Connection label</div>
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
            value={connectionLabel}
            onChange={(e) => setConnectionLabel(e.target.value)}
            placeholder="e.g., MLSListings VOW"
          />
        </label>

        <label className="block">
          <div className="text-[11px] text-slate-400 mb-1">MLS name</div>
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
            value={mlsName}
            onChange={(e) => setMlsName(e.target.value)}
            placeholder="e.g., MLSListings"
          />
        </label>

        <label className="block">
          <div className="text-[11px] text-slate-400 mb-1">Vendor name</div>
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="e.g., MLSListings"
          />
        </label>

        <label className="block">
          <div className="text-[11px] text-slate-400 mb-1">Endpoint URL</div>
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            placeholder="https://vendordata.api-v2.mlslistings.com/vow"
          />
          <div className="mt-1 text-[10px] text-slate-500">
            For MLSListings VOW this is usually the root (we’ll append /Property, /Media, etc. server-side).
          </div>
        </label>

        <label className="block">
          <div className="text-[11px] text-slate-400 mb-1">Username (optional)</div>
          <input
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Leave blank for token-only auth"
          />
        </label>

        <label className="block">
          <div className="text-[11px] text-slate-400 mb-1">
            Notes (optional)
          </div>
          <textarea
            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional: scope=VOW, contract expiry, etc."
          />
        </label>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={saving || !brokerageId}
            className="rounded-xl bg-sky-600/80 hover:bg-sky-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save connection'}
          </button>

          <Link
            href={`/admin/brokerages/${brokerageId}`}
            className="text-sm text-slate-300 hover:text-slate-100"
          >
            Cancel
          </Link>
        </div>

        <div className="pt-2 text-[11px] text-slate-500">
          Tip: do <b>not</b> store the MLS API token in this table. Keep it in Vercel env vars / server-only code.
        </div>
      </section>
    </main>
  );
}
