// app/clients/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  client_type: string | null;
  stage: string | null;

  // buyer budget
  budget_min: number | null;
  budget_max: number | null;

  // buyer location
  preferred_locations: string | null;

  // shared notes
  notes: string | null;

  // requirements fields
  property_types: string[] | null;
  min_beds: number | null;
  min_baths: number | null;
  deal_style: string | null;

  // seller fields
  seller_target: number | null;
  seller_property_address: string | null;
  seller_city: string | null;
  seller_state: string | null;
  seller_zip: string | null;
  seller_timeline: string | null;
  seller_listing_status: string | null;
};

type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string;
};

type ClientPropertyStatus = 'active' | 'archived' | string;

type ClientProperty = {
  id: string;
  relationship: string | null;
  interest_level: string | null;
  is_favorite: boolean;
  client_feedback?: string | null;
  client_rating?: number | null;

  status?: ClientPropertyStatus | null;
  archived_at?: string | null;

  property: Property | null;
};

type ClientNote = {
  id: string;
  body: string;
  author: string | null;
  created_at: string;
};

type ClientTour = {
  id: string;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
};

type PortalUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type PortalAccess = {
  id: string;
  role: string | null;
  portal_user: PortalUser;
};

type ClientOffer = {
  id: string;
  status: string | null;
  offer_price: number | null;
  created_at: string | null;
  updated_at: string | null;
  client_feedback: string | null;
  client_decision: string | null;
  property: {
    id: string;
    address: string;
    city: string | null;
    state: string | null;
    list_price: number | null;
    pipeline_stage: string | null;
  } | null;
};

type PortalMessage = {
  id: string;
  title: string | null;
  body: string;
  author_name: string | null;
  is_pinned: boolean;
  created_at: string | null;
};

export default function ClientDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);

  // Attached properties (READ-ONLY here)
  const [clientProperties, setClientProperties] = useState<ClientProperty[]>([]);
  const [propsLoading, setPropsLoading] = useState(true);
  const [propsError, setPropsError] = useState<string | null>(null);

  // archive controls
  const [showArchivedProps, setShowArchivedProps] = useState(false);
  const [archivingCpId, setArchivingCpId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [tours, setTours] = useState<ClientTour[]>([]);
  const [toursLoading, setToursLoading] = useState(true);
  const [toursError, setToursError] = useState<string | null>(null);

  const [offers, setOffers] = useState<ClientOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);

  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [newMessageTitle, setNewMessageTitle] = useState('');
  const [newMessageBody, setNewMessageBody] = useState('');
  const [newMessagePinned, setNewMessagePinned] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [newMessageError, setNewMessageError] = useState<string | null>(null);

  // Internal notes
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newNoteError, setNewNoteError] = useState<string | null>(null);

  // Portal access (inside the client summary card)
  const [portalLinks, setPortalLinks] = useState<PortalAccess[]>([]);
  const [portalEmail, setPortalEmail] = useState('');
  const [linkRole, setLinkRole] = useState('primary');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadClient = async () => {
      setLoadingClient(true);
      setClientError(null);

      const { data, error } = await supabase
        .from('clients')
        .select(
          `
          id,
          name,
          email,
          phone,
          client_type,
          stage,
          budget_min,
          budget_max,
          preferred_locations,
          notes,
          property_types,
          min_beds,
          min_baths,
          deal_style,
          seller_target,
          seller_property_address,
          seller_city,
          seller_state,
          seller_zip,
          seller_timeline,
          seller_listing_status
        `,
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error loading client:', error);
        setClientError(error.message);
        setClient(null);
        setLoadingClient(false);
        return;
      }

      const c = data as Client | null;
      setClient(c);

      if (c?.email) setPortalEmail(c.email);

      setLoadingClient(false);
    };

    const loadClientProperties = async () => {
      setPropsLoading(true);
      setPropsError(null);

      const { data, error } = await supabase
        .from('client_properties')
        .select(
          `
          id,
          relationship,
          interest_level,
          is_favorite,
          client_feedback,
          client_rating,
          status,
          archived_at,
          properties (
            id,
            address,
            city,
            state,
            list_price,
            property_type,
            pipeline_stage
          )
        `,
        )
        .eq('client_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading client properties:', error);
        setPropsError(error.message);
        setClientProperties([]);
      } else {
        const mapped: ClientProperty[] = (data || []).map((row: any) => ({
          id: row.id,
          relationship: row.relationship,
          interest_level: row.interest_level,
          is_favorite: row.is_favorite ?? false,
          client_feedback: row.client_feedback ?? null,
          client_rating: row.client_rating ?? null,
          status: (row.status as string | null) ?? 'active',
          archived_at: (row.archived_at as string | null) ?? null,
          property: row.properties
            ? {
                id: row.properties.id,
                address: row.properties.address,
                city: row.properties.city,
                state: row.properties.state,
                list_price: row.properties.list_price,
                property_type: row.properties.property_type,
                pipeline_stage: row.properties.pipeline_stage,
              }
            : null,
        }));

        setClientProperties(mapped);
      }

      setPropsLoading(false);
    };

    const loadClientNotes = async () => {
      setNotesLoading(true);
      setNotesError(null);

      const { data, error } = await supabase
        .from('client_notes')
        .select('id, body, author, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading client notes:', error);
        setNotesError(error.message);
        setNotes([]);
      } else {
        setNotes((data || []) as ClientNote[]);
      }

      setNotesLoading(false);
    };

    const loadClientTours = async () => {
      setToursLoading(true);
      setToursError(null);

      const { data, error } = await supabase
        .from('tours')
        .select('id, title, status, start_time, end_time')
        .eq('client_id', id)
        .order('start_time', { ascending: false });

      if (error) {
        console.error('Error loading client tours:', error);
        setToursError(error.message);
        setTours([]);
      } else {
        setTours((data || []) as ClientTour[]);
      }

      setToursLoading(false);
    };

    const loadPortalLinks = async () => {
      try {
        const { data, error } = await supabase
          .from('client_portal_access')
          .select('id, role, portal_user:client_portal_users (id, full_name, email)')
          .eq('client_id', id);

        if (error) {
          console.error('Error loading portal links:', error);
          return;
        }

        const mapped: PortalAccess[] = (data || []).map((row: any) => ({
          id: row.id as string,
          role: row.role as string | null,
          portal_user: {
            id: row.portal_user.id as string,
            full_name: row.portal_user.full_name as string | null,
            email: row.portal_user.email as string | null,
          },
        }));

        setPortalLinks(mapped);
      } catch (err) {
        console.error('Error loading portal links:', err);
      }
    };

    const loadClientOffers = async () => {
      setOffersLoading(true);
      setOffersError(null);

      const { data, error } = await supabase
        .from('offers')
        .select(
          `
          id,
          status,
          offer_price,
          created_at,
          updated_at,
          client_feedback,
          client_decision,
          properties (
            id,
            address,
            city,
            state,
            list_price,
            pipeline_stage
          )
        `,
        )
        .eq('client_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading client offers:', error);
        setOffersError(error.message);
        setOffers([]);
        setOffersLoading(false);
        return;
      }

      const mapped: ClientOffer[] = (data || []).map((row: any) => ({
        id: row.id as string,
        status: (row.status as string | null) ?? (row.offer_status as string | null) ?? null,
        offer_price: (row.offer_price as number | null) ?? (row.price as number | null) ?? null,
        created_at: (row.created_at as string | null) ?? null,
        updated_at: (row.updated_at as string | null) ?? null,
        client_feedback: (row.client_feedback as string | null) ?? null,
        client_decision: (row.client_decision as string | null) ?? null,
        property: row.properties
          ? {
              id: row.properties.id as string,
              address: row.properties.address as string,
              city: (row.properties.city as string | null) ?? null,
              state: (row.properties.state as string | null) ?? null,
              list_price: (row.properties.list_price as number | null) ?? null,
              pipeline_stage: (row.properties.pipeline_stage as string | null) ?? null,
            }
          : null,
      }));

      setOffers(mapped);
      setOffersLoading(false);
    };

    const loadClientMessages = async () => {
      setMessagesLoading(true);
      setMessagesError(null);

      const { data, error } = await supabase
        .from('client_portal_messages')
        .select(`id, title, body, author_name, is_pinned, created_at`)
        .eq('client_id', id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading client portal messages:', error);
        setMessagesError(error.message);
        setMessages([]);
        setMessagesLoading(false);
        return;
      }

      const mapped: PortalMessage[] = (data || []).map((row: any) => ({
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        body: row.body as string,
        author_name: (row.author_name as string | null) ?? null,
        is_pinned: !!row.is_pinned,
        created_at: (row.created_at as string | null) ?? null,
      }));

      setMessages(mapped);
      setMessagesLoading(false);
    };

    loadClient();
    loadClientProperties();
    loadClientNotes();
    loadClientTours();
    loadPortalLinks();
    loadClientOffers();
    loadClientMessages();
  }, [id]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (!newNote.trim()) {
      setNewNoteError('Note cannot be empty.');
      return;
    }

    setSavingNote(true);
    setNewNoteError(null);

    const { error } = await supabase.from('client_notes').insert([
      {
        client_id: client.id,
        body: newNote.trim(),
        author: 'Ed', // TODO: tie to authed user
      },
    ]);

    if (error) {
      console.error('Error adding client note:', error);
      setNewNoteError(error.message);
      setSavingNote(false);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('client_notes')
      .select('id, body, author, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    if (reloadError) {
      console.error('Error reloading client notes:', reloadError);
    } else {
      setNotes((data || []) as ClientNote[]);
    }

    setNewNote('');
    setSavingNote(false);
  };

  const handleLinkPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    const email = portalEmail.trim().toLowerCase();
    if (!email) {
      setLinkError('Enter an email address.');
      return;
    }

    setLinkSaving(true);
    setLinkError(null);

    try {
      const { data: portalRow, error: portalError } = await supabase
        .from('client_portal_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (portalError) {
        console.error('Error looking up portal user:', portalError);
        setLinkError(portalError.message);
        setLinkSaving(false);
        return;
      }

      if (!portalRow) {
        setLinkError(
          'No client portal account found for this email. Ask your client to sign in at /portal with this email first.',
        );
        setLinkSaving(false);
        return;
      }

      const portalUserId = portalRow.id as string;

      const { data: access, error: accessError } = await supabase
        .from('client_portal_access')
        .upsert(
          {
            portal_user_id: portalUserId,
            client_id: client.id,
            role: linkRole,
          },
          { onConflict: 'portal_user_id,client_id' },
        )
        .select('id, role, portal_user:client_portal_users (id, full_name, email)')
        .single();

      if (accessError) {
        console.error('Error linking portal user:', accessError);
        setLinkError(accessError.message);
        setLinkSaving(false);
        return;
      }

      const raw = access as any;

      const newAccess: PortalAccess = {
        id: raw.id as string,
        role: (raw.role as string | null) ?? null,
        portal_user: {
          id: raw.portal_user?.id as string,
          full_name: (raw.portal_user?.full_name as string | null) ?? null,
          email: (raw.portal_user?.email as string | null) ?? null,
        },
      };

      setPortalLinks((prev) => {
        const existing = prev.find((l) => l.portal_user.id === newAccess.portal_user.id);
        if (!existing) return [...prev, newAccess];
        return prev.map((l) => (l.portal_user.id === newAccess.portal_user.id ? newAccess : l));
      });

      setLinkError(null);
    } catch (err: any) {
      console.error('Unexpected error linking portal user:', err);
      setLinkError(err?.message ?? 'Failed to link to portal account');
    } finally {
      setLinkSaving(false);
    }
  };

  const handleAddPortalMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (!newMessageBody.trim()) {
      setNewMessageError('Message body cannot be empty.');
      return;
    }

    setSavingMessage(true);
    setNewMessageError(null);

    const { error } = await supabase.from('client_portal_messages').insert([
      {
        client_id: client.id,
        title: newMessageTitle.trim() || null,
        body: newMessageBody.trim(),
        author_name: 'Ed', // TODO: tie to authed user
        is_pinned: newMessagePinned,
      },
    ]);

    if (error) {
      console.error('Error adding portal message:', error);
      setNewMessageError(error.message);
      setSavingMessage(false);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('client_portal_messages')
      .select('id, title, body, author_name, is_pinned, created_at')
      .eq('client_id', client.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (reloadError) {
      console.error('Error reloading portal messages:', reloadError);
    } else {
      const mapped: PortalMessage[] = (data || []).map((row: any) => ({
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        body: row.body as string,
        author_name: (row.author_name as string | null) ?? null,
        is_pinned: !!row.is_pinned,
        created_at: (row.created_at as string | null) ?? null,
      }));
      setMessages(mapped);
    }

    setNewMessageTitle('');
    setNewMessageBody('');
    setNewMessagePinned(false);
    setSavingMessage(false);
  };

  const handleArchiveToggle = async (cp: ClientProperty, action: 'archive' | 'restore') => {
    if (!cp?.id) return;

    const verb = action === 'archive' ? 'Archive' : 'Restore';
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`${verb} this property for this client? Feedback will be kept.`)
    ) {
      return;
    }

    setArchiveError(null);
    setArchivingCpId(cp.id);

    const nextStatus = action === 'archive' ? 'archived' : 'active';

    const { error } = await supabase
      .from('client_properties')
      .update({
        status: nextStatus,
        archived_at: action === 'archive' ? new Date().toISOString() : null,
      })
      .eq('id', cp.id);

    if (error) {
      console.error('Archive toggle error:', error);
      setArchiveError(error.message || 'Failed to update property status.');
      setArchivingCpId(null);
      return;
    }

    setClientProperties((prev) =>
      prev.map((row) =>
        row.id === cp.id
          ? {
              ...row,
              status: nextStatus,
              archived_at: action === 'archive' ? new Date().toISOString() : null,
            }
          : row,
      ),
    );

    setArchivingCpId(null);
  };

  const formatBudget = (min: number | null, max: number | null) => {
    if (min == null && max == null) return '-';
    const toMoney = (v: number | null) => (v == null ? '' : `$${v.toLocaleString()}`);
    if (min != null && max != null) return `${toMoney(min)} – ${toMoney(max)}`;
    if (min != null) return `${toMoney(min)}+`;
    return `up to ${toMoney(max)}`;
  };

  const formatPrice = (v: number | null) => (v == null ? '-' : `$${v.toLocaleString()}`);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const ct = (client?.client_type || '').toLowerCase();
  const isBuyer = ct === 'buyer' || ct === 'both' || ct === '';
  const isSeller = ct === 'seller' || ct === 'both';

  const favoriteCount = useMemo(() => clientProperties.filter((cp) => cp.is_favorite).length, [clientProperties]);

  const now = useMemo(() => new Date(), []);
  const upcomingTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d >= now;
      }),
    [tours, now],
  );

  const pastTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d < now;
      }),
    [tours, now],
  );

  const visibleClientProperties = useMemo(() => {
    const isActiveRow = (cp: ClientProperty) => (cp.status ?? 'active') !== 'archived';
    return showArchivedProps ? clientProperties : clientProperties.filter(isActiveRow);
  }, [clientProperties, showArchivedProps]);

  const archivedCount = useMemo(
    () => clientProperties.filter((cp) => (cp.status ?? 'active') === 'archived').length,
    [clientProperties],
  );

  const sellerSummaryLine = useMemo(() => {
    if (!client) return '';
    const parts: string[] = [];

    const addr = (client.seller_property_address || '').trim();
    const city = (client.seller_city || '').trim();
    const state = (client.seller_state || '').trim();
    const zip = (client.seller_zip || '').trim();

    const addrLine = [addr, city, state].filter(Boolean).join(', ');
    const withZip = [addrLine, zip].filter(Boolean).join(' ');
    if (withZip) parts.push(withZip);

    if (client.seller_target != null) parts.push(`Target: ${formatPrice(client.seller_target)}`);
    if (client.seller_listing_status) parts.push(`Status: ${client.seller_listing_status}`);
    if (client.seller_timeline) parts.push(`Timeline: ${client.seller_timeline}`);

    return parts.join(' • ');
  }, [client]);

  return (
    <div className="max-w-5xl space-y-6">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3">
        <Link href="/clients">
          <Button variant="ghost" className="text-xs sm:text-sm px-3 py-1.5">
            ← Back to Clients
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          <Link href={`/clients/${id}/edit`}>
            <Button variant="secondary" className="text-xs sm:text-sm px-3 py-1.5">
              Edit Client
            </Button>
          </Link>
        </div>
      </header>

      {loadingClient && (
        <Card>
          <p className="text-sm text-slate-300">Loading client…</p>
        </Card>
      )}

      {clientError && (
        <Card>
          <p className="text-sm text-red-300">Error loading client: {clientError}</p>
        </Card>
      )}

      {!loadingClient && !clientError && !client && (
        <Card>
          <p className="text-sm text-slate-300">Client not found.</p>
        </Card>
      )}

      {!loadingClient && !clientError && client && (
        <>
          {/* 1) Client summary + portal access */}
          <Card className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{client.name}</h1>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mt-3">
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wide">Type</div>
                    <div className="font-medium text-slate-50">{client.client_type || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wide">Stage</div>
                    <div className="font-medium text-slate-50">{client.stage || '-'}</div>
                  </div>

                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wide">{isBuyer ? 'Budget' : 'Target price'}</div>
                    <div className="font-medium text-slate-50">
                      {isBuyer ? formatBudget(client.budget_min, client.budget_max) : formatPrice(client.seller_target)}
                    </div>
                  </div>

                  {isBuyer && client.preferred_locations && (
                    <div className="sm:col-span-2">
                      <div className="text-slate-400 text-xs uppercase tracking-wide">Preferred Locations</div>
                      <div className="font-medium text-slate-50">{client.preferred_locations}</div>
                    </div>
                  )}

                  {isSeller && sellerSummaryLine && (
                    <div className="sm:col-span-3">
                      <div className="text-slate-400 text-xs uppercase tracking-wide">Seller summary</div>
                      <div className="font-medium text-slate-50">{sellerSummaryLine}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-sm text-slate-200 space-y-1">
                {client.phone && <div>📞 {client.phone}</div>}
                {client.email && <div>✉️ {client.email}</div>}
                {isBuyer && <div className="text-xs text-slate-400 pt-1">Favorites attached: {favoriteCount}</div>}
              </div>
            </div>

            {/* Notes (shared) */}
            {client.notes && (
              <p className="mt-1 text-sm text-slate-200 whitespace-pre-wrap border-t border-white/10 pt-3">{client.notes}</p>
            )}

            {/* Portal access */}
            <div className="border-t border-white/10 pt-3 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">Client portal access</h2>
                  <p className="text-xs text-slate-300 max-w-2xl">
                    Link this client to their portal account so they can see tours/saved homes (buyers) or listing tasks/updates (sellers).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                      portalLinks.length
                        ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/15 bg-white/5 text-slate-200'
                    }`}
                  >
                    {portalLinks.length ? 'Linked' : 'Not linked'}
                  </span>
                </div>
              </div>

              <form onSubmit={handleLinkPortal} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-medium text-slate-200">Client&apos;s portal email</label>
                  <input
                    type="email"
                    value={portalEmail}
                    onChange={(e) => setPortalEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    placeholder="client@example.com"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    They must sign in at <code>/portal</code> first. Once they do, link them here.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-200">Role</label>
                  <select
                    value={linkRole}
                    onChange={(e) => setLinkRole(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  >
                    <option value="primary">Primary</option>
                    <option value="co_buyer">Co-buyer</option>
                  </select>
                </div>

                <div className="md:col-span-3 flex justify-end">
                  <Button type="submit" disabled={linkSaving}>
                    {linkSaving ? 'Linking…' : 'Link to portal account'}
                  </Button>
                </div>

                {linkError && <div className="md:col-span-3 text-xs text-red-300">{linkError}</div>}
              </form>

              <div className="pt-2">
                <h3 className="text-xs font-semibold text-slate-200 mb-2">Linked portal users</h3>
                {portalLinks.length === 0 ? (
                  <p className="text-xs text-slate-400">No portal users linked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {portalLinks.map((link) => (
                      <div
                        key={link.id}
                        className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 flex items-center justify-between text-xs text-slate-100"
                      >
                        <div>
                          <div className="font-medium">{link.portal_user.full_name || link.portal_user.email || 'Portal user'}</div>
                          <div className="text-slate-400">{link.portal_user.email || 'No email'}</div>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center rounded-full bg-black/40 border border-white/20 px-2 py-0.5 text-[11px] text-slate-100">
                            {link.role || 'primary'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* 2) Buyer requirements (buyer/both only) */}
          {isBuyer && (
            <Card className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Matching requirements</h2>
                  <p className="text-xs text-slate-300">Requirements are edited on the Edit Client page.</p>
                </div>

                <Link href={`/clients/${id}/edit`}>
                  <Button variant="ghost" className="text-xs px-3 py-1.5">
                    Edit Client →
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Budget</div>
                  <div className="text-slate-100 font-medium">{formatBudget(client.budget_min, client.budget_max)}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Locations</div>
                  <div className="text-slate-100 font-medium">
                    {client.preferred_locations || <span className="text-slate-500">—</span>}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Min beds / baths</div>
                  <div className="text-slate-100 font-medium">
                    {(client.min_beds ?? '—')} beds • {(client.min_baths ?? '—')} baths
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Deal style</div>
                  <div className="text-slate-100 font-medium">{client.deal_style || 'any'}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3 sm:col-span-2">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Property types</div>
                  <div className="text-slate-100 font-medium">
                    {client.property_types?.length ? client.property_types.join(', ') : 'any'}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 3) Buyer attached properties (buyer/both only) */}
          {isBuyer && (
            <Card className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Attached properties</h2>
                  <p className="text-[11px] text-slate-400">Archive removes a property from the client&apos;s view (feedback is kept).</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowArchivedProps((v) => !v)}
                    className={[
                      'inline-flex items-center rounded-full border px-3 py-1 text-xs transition whitespace-nowrap',
                      showArchivedProps
                        ? 'border-amber-300/30 bg-amber-500/10 text-amber-200'
                        : 'border-white/15 bg-black/30 text-slate-200 hover:bg-white/10',
                    ].join(' ')}
                  >
                    {showArchivedProps ? 'Showing archived' : `Hide archived (${archivedCount})`}
                  </button>

                  <Link href="/properties/new">
                    <Button variant="secondary" className="text-xs px-3 py-1.5">
                      + Add new property
                    </Button>
                  </Link>
                </div>
              </div>

              {propsError && <p className="text-sm text-red-300">Error loading properties: {propsError}</p>}
              {archiveError && <p className="text-sm text-red-300">Archive error: {archiveError}</p>}

              {propsLoading && <p className="text-sm text-slate-300">Loading client properties…</p>}

              {!propsLoading && visibleClientProperties.length === 0 && (
                <p className="text-sm text-slate-300">
                  {showArchivedProps ? 'No attached properties yet.' : 'No active properties attached yet.'}
                </p>
              )}

              {!propsLoading && visibleClientProperties.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-white/5 text-slate-300">
                      <tr>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Property</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Relationship</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Interest</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Stage</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Client feedback</th>
                        <th className="border-b border-white/10 px-2 py-1 text-right">Price</th>
                        <th className="border-b border-white/10 px-2 py-1 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleClientProperties.map((cp) => {
                        const status = (cp.status ?? 'active') as ClientPropertyStatus;
                        const isArchived = status === 'archived';

                        return (
                          <tr
                            key={cp.id}
                            className={['hover:bg-white/5 text-slate-100 align-top', isArchived ? 'opacity-75' : ''].join(' ')}
                          >
                            <td className="border-b border-white/5 px-2 py-1">
                              {cp.property ? (
                                <Link href={`/properties/${cp.property.id}`} className="text-[#EBD27A] hover:underline">
                                  {cp.property.address}
                                </Link>
                              ) : (
                                <span className="text-slate-500">(missing property)</span>
                              )}

                              {cp.property && (
                                <div className="text-[11px] text-slate-400">
                                  {cp.property.city}, {cp.property.state}
                                  {cp.is_favorite ? ' • ★ favorite' : ''}
                                  {isArchived ? (
                                    <span className="ml-2 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">
                                      archived
                                    </span>
                                  ) : null}
                                </div>
                              )}

                              {isArchived && cp.archived_at && (
                                <div className="text-[11px] text-slate-500 mt-0.5">Archived: {formatDateTime(cp.archived_at)}</div>
                              )}
                            </td>

                            <td className="border-b border-white/5 px-2 py-1">{cp.relationship || '-'}</td>
                            <td className="border-b border-white/5 px-2 py-1">{cp.interest_level || '-'}</td>
                            <td className="border-b border-white/5 px-2 py-1">{cp.property?.pipeline_stage || '-'}</td>

                            <td className="border-b border-white/5 px-2 py-1 text-xs">
                              {cp.client_rating != null && <div className="font-medium">Rating: {cp.client_rating}/5</div>}
                              {cp.client_feedback && <div className="text-slate-100 whitespace-pre-wrap">{cp.client_feedback}</div>}
                              {cp.client_rating == null && !cp.client_feedback && <span className="text-slate-500">No feedback yet</span>}
                            </td>

                            <td className="border-b border-white/5 px-2 py-1 text-right">
                              {cp.property ? formatPrice(cp.property.list_price) : '-'}
                            </td>

                            <td className="border-b border-white/5 px-2 py-1 text-right">
                              <div className="flex justify-end gap-2">
                                {isArchived ? (
                                  <button
                                    type="button"
                                    onClick={() => handleArchiveToggle(cp, 'restore')}
                                    disabled={archivingCpId === cp.id}
                                    className="text-xs text-emerald-200 hover:text-emerald-100 hover:underline disabled:opacity-60"
                                  >
                                    {archivingCpId === cp.id ? 'Restoring…' : 'Restore'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleArchiveToggle(cp, 'archive')}
                                    disabled={archivingCpId === cp.id}
                                    className="text-xs text-red-300 hover:text-red-200 hover:underline disabled:opacity-60"
                                  >
                                    {archivingCpId === cp.id ? 'Archiving…' : 'Archive'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* 4) Tours (buyer/both only) */}
          {isBuyer && (
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Tours with this client</h2>
                <Link href={`/tours/new?clientId=${client.id}`}>
                  <Button variant="secondary" className="text-xs px-3 py-1.5">
                    + New tour
                  </Button>
                </Link>
              </div>

              {toursError && <p className="text-sm text-red-300">Error loading tours: {toursError}</p>}
              {toursLoading && <p className="text-sm text-slate-300">Loading tours…</p>}

              {!toursLoading && tours.length === 0 && <p className="text-sm text-slate-300">No tours scheduled yet for this client.</p>}

              {!toursLoading && tours.length > 0 && (
                <div className="space-y-3 text-sm">
                  {upcomingTours.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-400 mb-1">Upcoming</h3>
                      <ul className="space-y-1">
                        {upcomingTours.map((t) => (
                          <li key={t.id} className="border border-white/10 rounded-md p-2 bg-black/30 flex items-center justify-between gap-2">
                            <div>
                              <Link href={`/tours/${t.id}`} className="font-medium text-[#EBD27A] hover:underline">
                                {t.title || 'Untitled tour'}
                              </Link>
                              <div className="text-xs text-slate-400">
                                {formatDateTime(t.start_time)} • {t.status || 'planned'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pastTours.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase text-slate-400 mt-2 mb-1">Past</h3>
                      <ul className="space-y-1">
                        {pastTours.map((t) => (
                          <li key={t.id} className="border border-white/10 rounded-md p-2 bg-black/30 flex items-center justify-between gap-2">
                            <div>
                              <Link href={`/tours/${t.id}`} className="font-medium text-[#EBD27A] hover:underline">
                                {t.title || 'Untitled tour'}
                              </Link>
                              <div className="text-xs text-slate-400">
                                {formatDateTime(t.start_time)} • {t.status || 'planned'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* 5) Offers (buyer/both only) */}
          {isBuyer && (
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Offers with this client</h2>
                <Link href="/offers/new">
                  <Button variant="secondary" className="text-xs px-3 py-1.5">
                    + New offer
                  </Button>
                </Link>
              </div>

              {offersError && <p className="text-sm text-red-300">Error loading offers: {offersError}</p>}
              {offersLoading && <p className="text-sm text-slate-300">Loading offers…</p>}

              {!offersLoading && offers.length === 0 && !offersError && (
                <p className="text-sm text-slate-300">No offers yet for this client. When you create an offer tied to this client, it will show up here.</p>
              )}

              {!offersLoading && offers.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-white/5 text-slate-300">
                      <tr>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Property</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Offer</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Status</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Client decision</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Client feedback</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Created / Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o) => (
                        <tr key={o.id} className="hover:bg-white/5 text-slate-100 align-top">
                          <td className="border-b border-white/5 px-2 py-1">
                            {o.property ? (
                              <>
                                <Link href={`/properties/${o.property.id}`} className="text-[#EBD27A] hover:underline">
                                  {o.property.address}
                                </Link>
                                <div className="text-[11px] text-slate-400">
                                  {o.property.city || ''}
                                  {o.property.state ? `, ${o.property.state}` : ''}
                                  {o.property.pipeline_stage ? ` • ${o.property.pipeline_stage}` : ''}
                                </div>
                              </>
                            ) : (
                              <span className="text-slate-500">(no property linked)</span>
                            )}
                          </td>

                          <td className="border-b border-white/5 px-2 py-1 whitespace-nowrap">
                            <div className="font-semibold">{formatPrice(o.offer_price)}</div>
                          </td>

                          <td className="border-b border-white/5 px-2 py-1 whitespace-nowrap">{o.status || '—'}</td>

                          <td className="border-b border-white/5 px-2 py-1">
                            {o.client_decision ? (
                              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-slate-100">
                                {o.client_decision === 'accept'
                                  ? 'Client wants to accept'
                                  : o.client_decision === 'counter'
                                  ? 'Client wants to counter'
                                  : o.client_decision === 'decline'
                                  ? 'Client would decline'
                                  : o.client_decision === 'reviewing'
                                  ? 'Client still reviewing'
                                  : o.client_decision}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">No decision yet</span>
                            )}
                          </td>

                          <td className="border-b border-white/5 px-2 py-1 text-xs">
                            {o.client_feedback ? (
                              <div className="max-w-xs whitespace-pre-wrap text-slate-100">{o.client_feedback}</div>
                            ) : (
                              <span className="text-slate-500">No feedback yet</span>
                            )}
                          </td>

                          <td className="border-b border-white/5 px-2 py-1 text-[11px] text-slate-400 whitespace-nowrap">
                            <div>
                              {o.created_at && <div>Created: {formatDateTime(o.created_at)}</div>}
                              {o.updated_at && <div>Updated: {formatDateTime(o.updated_at)}</div>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* 6) Messages (both buyer & seller) */}
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Messages to client portal</h2>

            <form onSubmit={handleAddPortalMessage} className="space-y-3 text-sm">
              {newMessageError && <p className="text-sm text-red-300">{newMessageError}</p>}

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-200">Title (optional)</label>
                <input
                  type="text"
                  value={newMessageTitle}
                  onChange={(e) => setNewMessageTitle(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="e.g. Listing prep plan, Offer update, etc."
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-200">Message body</label>
                <textarea
                  value={newMessageBody}
                  onChange={(e) => setNewMessageBody(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  rows={3}
                  placeholder="Write a brief update you want the client to see in their portal."
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={newMessagePinned}
                    onChange={(e) => setNewMessagePinned(e.target.checked)}
                    className="h-3 w-3 rounded border border-white/40 bg-black/60"
                  />
                  Mark as important (pinned)
                </label>

                <Button type="submit" disabled={savingMessage} className="text-xs px-3 py-1.5">
                  {savingMessage ? 'Posting…' : 'Post to portal'}
                </Button>
              </div>
            </form>

            {messagesError && <p className="text-sm text-red-300">Error loading portal messages: {messagesError}</p>}
            {messagesLoading && <p className="text-sm text-slate-300">Loading portal messages…</p>}

            {!messagesLoading && messages.length === 0 && !messagesError && (
              <p className="text-sm text-slate-300">No messages yet. Use the form above to send updates that show up in the client&apos;s portal.</p>
            )}

            {!messagesLoading && messages.length > 0 && (
              <ul className="space-y-3 text-sm">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`border rounded-md p-3 ${
                      m.is_pinned ? 'border-amber-300 bg-amber-500/10' : 'border-white/15 bg-black/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-slate-50 truncate">{m.title || 'Update'}</h3>
                          {m.is_pinned && (
                            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-100 whitespace-nowrap">
                              Important
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-100 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{m.author_name || 'You'}</span>
                      <span>{formatDateTime(m.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 7) Internal notes (both buyer & seller) */}
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Internal notes</h2>

            <form onSubmit={handleAddNote} className="space-y-2">
              {newNoteError && <p className="text-sm text-red-300">{newNoteError}</p>}
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                rows={3}
                placeholder="Call recap, private notes, details that are for your eyes only."
              />
              <Button type="submit" disabled={savingNote} className="text-sm px-4 py-2">
                {savingNote ? 'Saving…' : 'Add internal note'}
              </Button>
            </form>

            {notesLoading && <p className="text-sm text-slate-300">Loading notes…</p>}
            {notesError && <p className="text-sm text-red-300">Error loading notes: {notesError}</p>}

            {!notesLoading && notes.length === 0 && <p className="text-sm text-slate-300">No notes yet. Add your first note above.</p>}

            {!notesLoading && notes.length > 0 && (
              <ul className="space-y-3 text-sm">
                {notes.map((note) => (
                  <li key={note.id} className="border border-white/15 rounded-md p-3 bg-black/40 text-slate-100">
                    <p className="whitespace-pre-wrap mb-1">{note.body}</p>
                    <div className="text-[11px] text-slate-400 flex justify-between">
                      <span>{note.author || 'Unknown'}</span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

