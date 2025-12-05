'use client';

import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function PortalSignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setStatus('loading');
    setErrorMessage(null);

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/portal`
            : undefined,
      },
    }).catch(err => {
      setStatus('error');
      setErrorMessage(err.message);
    });
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
            ? `${window.location.origin}/portal`
            : undefined,
      },
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setStatus('sent');
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 shadow-sm p-6 space-y-5">

        <header className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Client Portal</h1>
          <p className="text-sm text-gray-500">
            Sign in to view your home search, tours, and offers with your agent.
          </p>
        </header>

        {/* Google Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={status === 'loading'}
          className="w-full inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        >
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          <span>or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Magic Link Email */}
        <form onSubmit={handleEmailSignIn} className="space-y-3">
          <label className="block text-xs font-medium text-gray-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-black focus:border-black"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-lg bg-black text-white text-sm font-medium px-4 py-2.5 hover:bg-gray-800 disabled:opacity-60"
          >
            {status === 'loading' ? 'Sending link…' : 'Send magic link'}
          </button>
        </form>

        {/* Messages */}
        {status === 'sent' && (
          <p className="text-xs text-green-600 text-center">
            Check your email for a sign-in link!
          </p>
        )}

        {status === 'error' && errorMessage && (
          <p className="text-xs text-red-600 text-center">{errorMessage}</p>
        )}

        <p className="text-[11px] text-gray-400 text-center">
          Use the same email your agent has on file.
        </p>
      </div>
    </main>
  );
}

