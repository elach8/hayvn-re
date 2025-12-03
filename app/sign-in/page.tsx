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
    } else {
      // Supabase will redirect to Google, then back.
      // After redirect, session will be present and /dashboard will work.
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

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-sm border border-gray-200 p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold">Sign in to Hayvn-RE</h1>
          <p className="text-sm text-gray-500">
            Use your Google account or request a magic link by email.
          </p>
        </header>

        {/* Google sign-in */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={status === 'loading'}
          className="w-full inline-flex items-center justify-center rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        >
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          <span>or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Email magic link */}
        <form onSubmit={handleEmailSignIn} className="space-y-3">
          <label className="block text-xs font-medium text-gray-700">
            Work email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-xl bg-indigo-600 text-white text-sm font-medium px-3 py-2.5 hover:bg-indigo-700 disabled:opacity-60"
          >
            {status === 'loading' ? 'Sending link…' : 'Send magic link'}
          </button>
        </form>

        {status === 'sent' && (
          <p className="text-xs text-green-600">
            Check your email for a sign-in link. After clicking it, you&apos;ll
            be redirected back here.
          </p>
        )}

        {status === 'error' && errorMessage && (
          <p className="text-xs text-red-600">{errorMessage}</p>
        )}

        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="w-full text-xs text-gray-500 hover:text-gray-700 mt-2"
        >
          Go to dashboard
        </button>
      </div>
    </main>
  );
}
