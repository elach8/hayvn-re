'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>(
    'idle'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setStatus('loading');
    setErrorMessage(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/dashboard`
            : undefined,
      },
    });

    if (error) {
      console.error(error);
      setStatus('error');
      setErrorMessage(error.message);
    }
  };

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/dashboard`
            : undefined,
      },
    });

    if (error) {
      console.error(error);
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setStatus('sent');
  };

  const isLoading = status === 'loading';

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/80 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Hayvn-RE Agent Portal
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Use your Google account or request a secure magic link by email.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl backdrop-blur-sm p-6 space-y-6">
          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100/5 border border-slate-600 px-3 py-2.5 text-sm font-medium text-slate-50 hover:bg-slate-100/10 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-900 text-xs font-bold">
              G
            </span>
            <span>{isLoading ? 'Connecting…' : 'Continue with Google'}</span>
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="flex-1 h-px bg-slate-800" />
            <span>or</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Email magic link */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Work email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/80 focus:border-emerald-400/80 transition"
                placeholder="you@example.com"
              />
              <p className="text-[11px] text-slate-500">
                We&apos;ll email you a one-time sign-in link. No passwords to remember.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full rounded-xl bg-emerald-400 text-slate-900 text-sm font-semibold px-3 py-2.5 hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-[0_0_0_1px_rgba(16,185,129,0.4),0_18px_45px_-15px_rgba(16,185,129,0.8)]"
            >
              {isLoading ? 'Sending link…' : 'Send magic link'}
            </button>
          </form>

          {status === 'sent' && (
            <p className="text-xs text-emerald-400">
              Check your email for a sign-in link. After clicking it, you&apos;ll
              be redirected back to your dashboard.
            </p>
          )}

          {status === 'error' && errorMessage && (
            <p className="text-xs text-red-400">
              {errorMessage}
            </p>
          )}

          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="w-full text-[11px] text-slate-500 hover:text-slate-300 mt-1 underline-offset-2 hover:underline transition"
          >
            Skip for now and go to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}

