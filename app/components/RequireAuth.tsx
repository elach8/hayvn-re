'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        // No session → send them to sign-in
        router.push('/sign-in');
      } else {
        setChecking(false);
      }
    };

    check();
  }, [router]);

  if (checking) {
    return (
      <main className="p-6">
        <div className="text-sm text-gray-500">Checking session…</div>
      </main>
    );
  }

  return <>{children}</>;
}
