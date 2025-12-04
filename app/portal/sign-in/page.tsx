// app/portal/sign-in/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function PortalSignInPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/portal`
              : undefined,
        },
      });

      if (error) {
        console.error('Portal sign-in error:', error);
        setError(error.message || 'Something went wrong signing you in.');
        setLoading(false);
      }
      // On success, Supabase will redirect to Google, then back to /portal
    } catch (err: any) {
      console.error('Portal sign-in unexpected error:', err);
      setError('Something went wrong signing you in.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black flex items-center justify-center px-4 text-slate-50">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/60 backdrop-blur-sm px-6 py-6 space-y-4 shadow-[0_18px_45px_rgba(0,0,0,0.65)]">
        <header className="space-y-2 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Hayvn-RE
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">
            Client Portal
          </h1>
          <p className="text-sm text-slate-300">
            Sign in to see the homes your agent has shared, tour plans, and
            offers in one place.
          </p>
        </header>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="w-full inline-flex items-center justify-center rounded-lg bg-[#EBD27A] text-black text-sm font-medium px-4 py-2.5 hover:bg-[#f3e497] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {error && (
          <p className="text-[11px] text-red-300 text-center">{error}</p>
        )}

        <p className="text-[11px] text-slate-400 text-center">
          Use the same email address your agent has on file for you. If you
          aren&apos;t sure which one that is, check with them first.
        </p>
      </div>
    </main>
  );
}

