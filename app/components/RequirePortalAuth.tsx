'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type State = {
  loading: boolean;
  error: string | null;
  user: PortalUser | null;
};

export default function RequirePortalAuth({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    user: null,
  });

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session) {
          // Not signed in → send to portal sign-in
          router.push('/portal/sign-in');
          return;
        }

        const user = session.user;

        // Ensure we have a client_portal_users row for this auth user
        const { data: existing, error: existingError } = await supabase
          .from('client_portal_users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (existingError) throw existingError;

        let portalUser: PortalUser | null = null;

        if (!existing) {
          const fullName =
            (user.user_metadata && user.user_metadata.full_name) ||
            user.email ||
            'Client';

          const { data: inserted, error: insertError } = await supabase
            .from('client_portal_users')
            .insert({
              id: user.id,
              full_name: fullName,
              email: user.email,
            })
            .select()
            .single();

          if (insertError) throw insertError;
          portalUser = inserted as PortalUser;
        } else {
          portalUser = existing as PortalUser;
        }

        setState({
          loading: false,
          error: null,
          user: portalUser,
        });
      } catch (err: any) {
        console.error('RequirePortalAuth error:', err);
        setState({
          loading: false,
          error: err?.message ?? 'Failed to load portal session',
          user: null,
        });
      }
    };

    run();
  }, [router, pathname]);

  const { loading, error, user } = state;

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading your portal…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-xl bg-white border border-red-200 px-4 py-3 text-sm text-red-700">
          {error || 'You do not have access to the client portal.'}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
