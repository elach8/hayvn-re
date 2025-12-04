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
    const map = new Map<
      string,
      { client: ClientInfo | null; items: PortalMessage[] }
    >();
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
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              Messages from your agent
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Important updates, notes, and check-ins your agent has shared
              about your home journey.
            </p>
          </div>
          <Link
            href="/portal"
            className="text-sm text-slate-400 hover:text-slate-200 hover:underline"
          >
            ← Back to portal
          </Link>
        </header>

        {portalUser && (
          <p className="text-xs text-slate-400">
            Signed in as{' '}
            <span className="font-medium text-slate-100">
              {portalUser.full_name || portalUser.email}
            </span>
            .
          </p>
        )}

        {authError && (
          <p className="text-sm text-red-300 mt-2">{authError}</p>
        )}

        {!authError && loadError && (
          <p className="text-sm text-red-300 mt-2">{loadError}</p>
        )}

        {!authError && loading && (
          <p className="text-sm text-slate-300 mt-2">
            Loading your messages…
          </p>
        )}

        {!loading && !authError && !loadError && messages.length === 0 && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <p className="text-sm text-slate-300">
              You don&apos;t have any messages from your agent yet. When they
              post updates to your journey, they&apos;ll show up here.
            </p>
          </div>
        )}

        {!loading && !authError && !loadError && messages.length > 0 && (
          <div className="space-y-6 text-sm mt-3">
            {groupedByClient.map(({ client, items }) => (
              <section
                key={client?.id || 'unknown'}
                className="rounded-2xl border border-white/10 bg-black/40 p-4"
              >
                <header className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-50">
                      {client?.name || 'Home journey'}
                    </h2>
                    <p className="text-xs text-slate-400">
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
                      className={[
                        'rounded-xl border px-3 py-3',
                        m.is_pinned
                          ? 'border-[#EBD27A] bg-[#EBD27A]/10'
                          : 'border-white/10 bg-white/5',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-slate-50 truncate">
                              {m.title || 'Update from your agent'}
                            </h3>
                            {m.is_pinned && (
                              <span className="inline-flex items-center rounded-full border border-[#EBD27A] bg-black/60 px-2 py-0.5 text-[11px] text-[#EBD27A] whitespace-nowrap">
                                Important
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-100 whitespace-pre-wrap">
                            {m.body}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{m.author_name || 'Your agent'}</span>
                        <span>{formatDateTime(m.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
