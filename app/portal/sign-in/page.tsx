// app/portal/sign-in/page.tsx
'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function PortalSignInPage() {
  const [email, setEmail] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const redirectUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/portal`
      : undefined;

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email to get a sign-in link.');
      return;
    }

    setMagicLoading(true);
    try {
      const { error: supaError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (supaError) {
        console.error('Magic link error:', supaError);
        setError(supaError.message || 'Could not send magic link.');
      } else {
        setSuccess(
          'Check your email for a sign-in link. Open it on this device to go straight to your portal.'
        );
      }
    } catch (err: any) {
      console.error('Magic link exception:', err);
      setError(err?.message ?? 'Could not send magic link.');
    } finally {
      setMagicLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccess(null);
    setOauthLoading(true);

    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      setError(err?.message ?? 'Could not start Google sign-in.');
      setOauthLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-10 flex flex-col items-center">
        {/* Header */}
        <header className="w-full max-w-md mb-6 text-center space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
            Hayvn-RE
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            Client Portal
          </h1>
          <p className="text-sm text-slate-300">
            Sign in to see your journeys, saved homes, tours, and offers with your agent.
          </p>
        </header>

        {/* Card */}
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 px-6 py-6 shadow-sm space-y-5">
          <div className="space-y-2 text-center">
            <h2 className="text-base font-semibold text-slate-50">
              Sign in to continue
            </h2>
            <p className="text-sm text-slate-300">
              Use the same email address your agent has on file so we can link your home journey.
            </p>
          </div>

          {/* Magic link form */}
          <form onSubmit={handleMagicLink} className="space-y-3">
            <label className="block text-xs font-medium text-slate-200">
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                className="mt-1 block w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#EBD27A] focus:border-[#EBD27A]"
                placeholder="you@example.com"
              />
            </label>

            <button
              type="submit"
              disabled={magicLoading}
              className="w-full inline-flex items-center justify-center rounded-xl bg-slate-50 text-black text-sm font-medium px-3 py-2.5 hover:bg-white transition-colors disabled:opacity-60"
            >
              {magicLoading ? 'Sending magic link…' : 'Email me a sign-in link'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] text-slate-500 uppercase tracking-[0.18em]">
              or
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={oauthLoading}
            className="w-full inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 text-sm font-medium px-4 py-2.5 text-slate-50 hover:bg-white/10 disabled:opacity-60"
          >
            {oauthLoading ? 'Starting Google sign-in…' : 'Continue with Google'}
          </button>

          {/* Messages */}
          {error && (
            <p className="text-xs text-red-300 mt-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-300 mt-2">
              {success}
            </p>
          )}

          <p className="text-[11px] text-slate-500 mt-1">
            If you don&apos;t see a journey after signing in, ask your agent to confirm they used
            this exact email in Hayvn-RE.
          </p>

          <div className="pt-3 border-t border-white/10 text-center">
            <Link
              href="/"
              className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
            >
              ← Back to main site
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
