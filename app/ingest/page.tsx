// /app/ingest/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

type RunStatus = 'idle' | 'running' | 'done' | 'error';

type Mode = 'full' | 'photos_only';

export default function IngestPage() {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  // UI knobs (defaults are conservative)
  const [mode, setMode] = useState<Mode>('photos_only');
  const [includePhotos, setIncludePhotos] = useState(true);

  const [top, setTop] = useState('100');
  const [propPages, setPropPages] = useState('1');
  const [mediaPages, setMediaPages] = useState('1');
  const [photoListingLimit, setPhotoListingLimit] = useState('200');

  const [dryRun, setDryRun] = useState(false);
  const [connectionId, setConnectionId] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams();

    // mode
    if (mode === 'photos_only') p.set('photos_only', '1');

    // include photos (function currently keys off include_photos=1)
    if (includePhotos) p.set('include_photos', '1');

    // knobs
    p.set('top', String(Math.min(300, Math.max(1, Number(top || '100')))));
    p.set('prop_pages', String(Math.max(1, Number(propPages || '1'))));
    p.set('media_pages', String(Math.max(1, Number(mediaPages || '1'))));
    p.set('photo_listing_limit', String(Math.max(1, Number(photoListingLimit || '30'))));

    if (dryRun) p.set('dry_run', '1');
    if (connectionId.trim()) p.set('connection_id', connectionId.trim());

    return p.toString();
  }, [mode, includePhotos, top, propPages, mediaPages, photoListingLimit, dryRun, connectionId]);

  const runOnce = async () => {
    setStatus('running');
    setErr(null);
    setResult(null);
    setAuthMsg(null);

    // Ensure session so we can send Authorization header
    const {
      data: { session },
      error: sessErr,
    } = await supabase.auth.getSession();

    if (sessErr) {
      setErr(sessErr.message);
      setStatus('error');
      return;
    }

    if (!session) {
      setAuthMsg('You must be signed in to run IDX ingest.');
      setStatus('error');
      return;
    }

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!base || !anon) {
      setErr('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      setStatus('error');
      return;
    }

    try {
      const res = await fetch(`${base}/functions/v1/idx-sync?${qs}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anon,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      const text = await res.text();

      if (!res.ok) {
        setErr(`HTTP ${res.status}: ${text.slice(0, 1600)}`);
        setStatus('error');
        return;
      }

      try {
        setResult(JSON.parse(text));
      } catch {
        setResult(text);
      }

      setStatus('done');
    } catch (e: any) {
      setErr(e?.message ?? 'Request failed');
      setStatus('error');
    }
  };

  useEffect(() => {
    runOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Ingest
            </h1>
            <p className="text-sm text-slate-300">
              Visiting this page runs <code className="font-mono">idx-sync</code>.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-slate-400 hover:underline">
            ← Back
          </Link>
        </header>

        <Card className="space-y-4">
          <div className="text-sm">
            {status === 'idle' && 'Ready.'}
            {status === 'running' && 'Running IDX sync…'}
            {status === 'done' && 'Done.'}
            {status === 'error' && 'Error.'}
          </div>

          {authMsg && (
            <div className="text-sm text-amber-200">
              {authMsg}{' '}
              <Link href="/sign-in" className="text-[#EBD27A] hover:underline">
                Sign in
              </Link>
            </div>
          )}

          {err && <div className="text-sm text-red-300">{err}</div>}

          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="photos_only">Photos only (backfill)</option>
                <option value="full">Full sync (properties + optional photos)</option>
              </select>
              <div className="text-[11px] text-slate-500">
                Photos-only only touches <code className="font-mono">mls_listing_photos</code>.
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Connection ID (optional)</label>
              <input
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                placeholder="connection_id"
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
              <div className="text-[11px] text-slate-500">
                Leave blank to sync all live connections.
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Include photos</label>
              <select
                value={includePhotos ? '1' : '0'}
                onChange={(e) => setIncludePhotos(e.target.value === '1')}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="1">Yes (include_photos=1)</option>
                <option value="0">No</option>
              </select>
              <div className="text-[11px] text-slate-500">
                Your function writes photos only when <code className="font-mono">include_photos=1</code>.
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Dry run</label>
              <select
                value={dryRun ? '1' : '0'}
                onChange={(e) => setDryRun(e.target.value === '1')}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                <option value="0">No</option>
                <option value="1">Yes (dry_run=1)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">top</label>
              <input
                value={top}
                onChange={(e) => setTop(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">prop_pages</label>
              <input
                value={propPages}
                onChange={(e) => setPropPages(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">media_pages</label>
              <input
                value={mediaPages}
                onChange={(e) => setMediaPages(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">photo_listing_limit</label>
              <input
                value={photoListingLimit}
                onChange={(e) => setPhotoListingLimit(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="text-[11px] text-slate-400">Request</div>
            <div className="mt-1 text-xs text-slate-200 font-mono break-all">
              /functions/v1/idx-sync?{qs}
            </div>
          </div>

          {result && (
            <pre className="text-xs whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-slate-200">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={runOnce} className="w-full sm:w-auto" disabled={status === 'running'}>
              {status === 'running' ? 'Running…' : 'Run again'}
            </Button>

            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto"
              disabled={status === 'running'}
            >
              Reload page
            </Button>
          </div>

          <div className="text-[11px] text-slate-500">
            Tip: start with Photos-only + conservative knobs. If it succeeds, increase{' '}
            <span className="text-slate-300">photo_listing_limit</span> gradually.
          </div>
        </Card>
      </div>
    </main>
  );
}
