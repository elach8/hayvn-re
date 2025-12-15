'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

export default function IngestPage() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setStatus('running');
      setErr(null);
      setResult(null);

      const { data, error } = await supabase.functions.invoke('idx-sync', {
        // if you later add query params like connection_id, we can pass those in body
        body: {},
      });

      if (error) {
        setErr(error.message || 'IDX sync failed');
        setStatus('error');
        return;
      }

      setResult(data);
      setStatus('done');
    };

    run();
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

        <Card className="space-y-3">
          <div className="text-sm">
            {status === 'idle' && 'Ready.'}
            {status === 'running' && 'Running IDX sync…'}
            {status === 'done' && 'Done.'}
            {status === 'error' && 'Error.'}
          </div>

          {err && <div className="text-sm text-red-300">{err}</div>}

          {result && (
            <pre className="text-xs whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-slate-200">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}

          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto"
            disabled={status === 'running'}
          >
            Run again
          </Button>
        </Card>
      </div>
    </main>
  );
}
