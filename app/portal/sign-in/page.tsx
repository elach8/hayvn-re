'use client';

import { supabase } from '@/lib/supabaseClient';

export default function PortalSignInPage() {
  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/portal`
            : undefined,
      },
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 shadow-sm p-6 space-y-4">
        <header className="space-y-2 text-center">
          <h1 className="text-lg font-semibold">Client Portal</h1>
          <p className="text-sm text-gray-500">
            Sign in to view your home search, tours, and offers with your agent.
          </p>
        </header>

        <button
          type="button"
          onClick={handleSignIn}
          className="w-full rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-indigo-700"
        >
          Continue with Google
        </button>

        <p className="text-[11px] text-gray-400 text-center">
          You&apos;ll need to use the same email your agent has on file.
        </p>
      </div>
    </main>
  );
}
