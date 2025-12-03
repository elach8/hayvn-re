// app/portal/messages/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ClientInfo = {
  id: string;
  name: string | null;
  client_type: string | null;
  stage: string | null;
};

type PortalMessage = {
  id: string;
  client_id: string;
  title: string | null;
  body: string;
  author_name: string | null;
  is_pinned: boolean;
  created_at: string | null;
  client: ClientInfo | null;
};

export default function PortalMessagesPage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAuthError(null);
      setLoadError(null);

      // 1) Auth
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Portal messages auth error:', sessionError);
        setAuthError('You need to be signed in to view messages.');
        setLoading(false);
        return;
      }

      if (!session) {
        setAuthError('You need to be signed in to view messages.');
        setLoading(false);
        return;
      }

      const user = session.user;
      const email = (user.email || '').toLowerCase().trim();

      if (!email) {
        setAuthError(
          'We could not determine your email address. Please contact your agent.'
        );
        setLoading(false);
        return;
      }

      const pu: PortalUser = {
        id: user.id,
        full_name:
          (user.user_metadata as any)?.full_name ||
          (user.user_metadata as any)?.name ||
          null,
        email: (user.email ?? null) as string | null,
      };
      setPortalUser(pu);

      // 2) Find all CRM clients with this email
      const { data: clientRows, error: clientError } = await supabase
        .from('clients')
        .select('id, name, client_type, stage, email')
        .eq('email', email);

      if (clientError) {
        console.error('Error loading clients for portal messages:', clientError);
        setLoadError('Could not load your messages.');
        setLoading(false);
        return;
      }

      const clientList: ClientInfo[] = (clientRows || []).map((row: any) => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        client_type: (row.client_type as string | null) ?? null,
        stage: (row.stage as string | null) ?? null,
      }));

      setClients(clientList);

      if (clientList.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      const clientIds = clientList.map((c) => c.id);
      const clientById = new Map<string, ClientInfo>();
      for (const c of clientList) clientById.set(c.id, c);

      // 3) Load messages for those client IDs
      const { data: msgRows, error: msgError } = await supabase
        .from('client_portal_messages')
        .select('*')
        .in('client_id', clientIds)
        .order('is_pinned', { ascending: false }) // pinned first
        .order('created_at', { ascending: false });

      if (msgError) {
        console.error('Error loading portal messages:', msgError);
        setLoadError('Could not load your messages.');
        setLoading(false);
        return;
      }

      const mapped: PortalMessage[] = (msgRows || []).map((row: any) => {
        const client_id = row.client_id as string;
        const client = clientById.get(client_id) || null;

        return {
          id: row.id as string,
          client_id,
          title: (row.title as string | null) ?? null,
          body: row.body as string,
          author_name: (row.author_name as string | null) ?? null,
          is_pinned: !!row.is_pinned,
          created_at: (row.created_at as string | null) ?? null,
          client,
        };
      });

      setMessages(mapped);
      setLoading(false);
    };

    load();
  }, []);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const groupedByClient = useMemo(() => {
    const map = new Map<string, { client: ClientInfo | null; items: PortalMessage[] }>();
    for (const m of messages) {
      const key = m.client_id;
      if (!map.has(key)) {
        map.set(key, {
          client: m.client || null,
          items: [],
        });
      }
      map.get(key)!.items.push(m);
    }
    return Array.from(map.values());
  }, [messages]);

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Messages from your agent</h1>
          <p className="text-sm text-gray-700">
            See important updates and notes your agent has shared about your home journey.
          </p>
        </div>
        <Link
          href="/portal"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to portal
        </Link>
      </header>

      {portalUser && (
        <p className="text-xs text-gray-500 mb-3">
          Signed in as{' '}
          <span className="font-medium">
            {portalUser.full_name || portalUser.email}
          </span>
          .
        </p>
      )}

      {authError && (
        <p className="text-sm text-red-600 mb-3">{authError}</p>
      )}

      {!authError && loadError && (
        <p className="text-sm text-red-600 mb-3">{loadError}</p>
      )}

      {!authError && loading && (
        <p className="text-sm text-gray-600">Loading your messages…</p>
      )}

      {!loading && !authError && !loadError && messages.length === 0 && (
        <p className="text-sm text-gray-600">
          You don&apos;t have any messages from your agent yet. When they post updates
          to your journey, they&apos;ll show up here.
        </p>
      )}

      {!loading &&
        !authError &&
        !loadError &&
        messages.length > 0 && (
          <div className="space-y-6 text-sm">
            {groupedByClient.map(({ client, items }) => (
              <section
                key={client?.id || 'unknown'}
                className="border border-gray-200 rounded-lg p-4"
              >
                <header className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">
                      {client?.name || 'Home journey'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {client?.client_type === 'buyer'
                        ? 'Buying journey'
                        : client?.client_type === 'seller'
                        ? 'Selling journey'
                        : 'Journey'}
                      {client?.stage ? ` • ${client.stage}` : ''}
                    </p>
                  </div>
                </header>

                <ul className="space-y-3">
                  {items.map((m) => (
                    <li
                      key={m.id}
                      className={`border rounded-md p-3 ${
                        m.is_pinned ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">
                              {m.title || 'Update from your agent'}
                            </h3>
                            {m.is_pinned && (
                              <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 whitespace-nowrap">
                                Important
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {m.body}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                        <span>
                          {m.author_name || 'Your agent'}
                        </span>
                        <span>{formatDateTime(m.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
    </main>
  );
}
