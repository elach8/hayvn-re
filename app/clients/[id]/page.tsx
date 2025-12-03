// app/clients/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  client_type: string | null;
  stage: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_locations: string | null;
  notes: string | null;
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

type ClientProperty = {
  id: string;
  relationship: string | null;
  interest_level: string | null;
  is_favorite: boolean;
  client_feedback?: string | null;
  client_rating?: number | null;
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

const RELATIONSHIP_OPTIONS = [
  'favorite',
  'toured',
  'offered',
  'under_contract',
  'closed',
];

const INTEREST_OPTIONS = ['hot', 'warm', 'cold'];

export default function ClientDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);

  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [clientProperties, setClientProperties] = useState<ClientProperty[]>([]);
  const [propsLoading, setPropsLoading] = useState(true);
  const [propsError, setPropsError] = useState<string | null>(null);

  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [tours, setTours] = useState<ClientTour[]>([]);
  const [toursLoading, setToursLoading] = useState(true);
  const [toursError, setToursError] = useState<string | null>(null);

  // Offers
  const [offers, setOffers] = useState<ClientOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);

  // Messages to portal
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [newMessageTitle, setNewMessageTitle] = useState('');
  const [newMessageBody, setNewMessageBody] = useState('');
  const [newMessagePinned, setNewMessagePinned] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [newMessageError, setNewMessageError] = useState<string | null>(null);

  // Attach property form state
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [relationship, setRelationship] = useState('favorite');
  const [interestLevel, setInterestLevel] = useState('hot');
  const [isFavorite, setIsFavorite] = useState(true);
  const [addingProperty, setAddingProperty] = useState(false);
  const [addPropertyError, setAddPropertyError] = useState<string | null>(null);

  // New internal note state
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newNoteError, setNewNoteError] = useState<string | null>(null);

  // Portal link state
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
          notes
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error loading client:', error);
        setClientError(error.message);
        setClient(null);
      } else {
        const c = data as Client | null;
        setClient(c);
        if (c?.email) {
          setPortalEmail(c.email);
        }
      }

      setLoadingClient(false);
    };

    const loadAllProperties = async () => {
      setPropsLoading(true);
      setPropsError(null);

      const { data, error } = await supabase
        .from('properties')
        .select(
          'id, address, city, state, list_price, property_type, pipeline_stage, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error loading properties:', error);
        setPropsError(error.message);
        setAllProperties([]);
      } else {
        setAllProperties((data || []) as Property[]);
      }

      setPropsLoading(false);
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
          properties (
            id,
            address,
            city,
            state,
            list_price,
            property_type,
            pipeline_stage
          )
        `
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
          .select(
            'id, role, portal_user:client_portal_users (id, full_name, email)'
          )
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
        `
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
        status:
          (row.status as string | null) ??
          (row.offer_status as string | null) ??
          null,
        offer_price:
          (row.offer_price as number | null) ??
          (row.price as number | null) ??
          null,
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
              list_price:
                (row.properties.list_price as number | null) ?? null,
              pipeline_stage:
                (row.properties.pipeline_stage as string | null) ?? null,
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
        .select(
          `
          id,
          title,
          body,
          author_name,
          is_pinned,
          created_at
        `
        )
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
    loadAllProperties();
    loadClientProperties();
    loadClientNotes();
    loadClientTours();
    loadPortalLinks();
    loadClientOffers();
    loadClientMessages();
  }, [id]);

  const handleAttachProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (!selectedPropertyId) {
      setAddPropertyError('Select a property first.');
      return;
    }

    setAddingProperty(true);
    setAddPropertyError(null);

    const { error } = await supabase.from('client_properties').insert([
      {
        client_id: client.id,
        property_id: selectedPropertyId,
        relationship: relationship.trim() || null,
        interest_level: interestLevel.trim() || null,
        is_favorite: isFavorite,
      },
    ]);

    if (error) {
      console.error('Error attaching property:', error);
      setAddPropertyError(error.message);
      setAddingProperty(false);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('client_properties')
      .select(
        `
        id,
        relationship,
        interest_level,
        is_favorite,
        client_feedback,
        client_rating,
        properties (
          id,
          address,
          city,
          state,
          list_price,
          property_type,
          pipeline_stage
        )
      `
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    if (reloadError) {
      console.error('Error reloading client properties:', reloadError);
    } else {
      const mapped: ClientProperty[] = (data || []).map((row: any) => ({
        id: row.id,
        relationship: row.relationship,
        interest_level: row.interest_level,
        is_favorite: row.is_favorite ?? false,
        client_feedback: row.client_feedback ?? null,
        client_rating: row.client_rating ?? null,
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

    setAddingProperty(false);
  };

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
          'No client portal account found for this email. Ask your client to sign in at /portal with this email first.'
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
          { onConflict: 'portal_user_id,client_id' }
        )
        .select(
          'id, role, portal_user:client_portal_users (id, full_name, email)'
        )
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
        const existing = prev.find(
          (l) => l.portal_user.id === newAccess.portal_user.id
        );
        if (!existing) return [...prev, newAccess];
        return prev.map((l) =>
          l.portal_user.id === newAccess.portal_user.id ? newAccess : l
        );
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

  const formatBudget = (min: number | null, max: number | null) => {
    if (min == null && max == null) return '-';
    const toMoney = (v: number | null) =>
      v == null ? '' : `$${v.toLocaleString()}`;
    if (min != null && max != null) return `${toMoney(min)} – ${toMoney(max)}`;
    if (min != null) return `${toMoney(min)}+`;
    return `up to ${toMoney(max)}`;
  };

  const formatPrice = (v: number | null) =>
    v == null ? '-' : `$${v.toLocaleString()}`;

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const favoriteCount = useMemo(
    () => clientProperties.filter((cp) => cp.is_favorite).length,
    [clientProperties]
  );

  const attachedPropertyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cp of clientProperties) {
      if (cp.property?.id) ids.add(cp.property.id);
    }
    return ids;
  }, [clientProperties]);

  const matchCities = useMemo(() => {
    if (!client?.preferred_locations) return [] as string[];
    return client.preferred_locations
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
  }, [client?.preferred_locations]);

  const potentialMatches = useMemo(() => {
    if (!client) return [] as Property[];

    const min = client.budget_min;
    const max = client.budget_max;
    const cities = matchCities;

    return allProperties.filter((p) => {
      if (attachedPropertyIds.has(p.id)) return false;

      const price = p.list_price ?? null;
      if (min != null && (price == null || price < min)) return false;
      if (max != null && (price == null || price > max)) return false;

      if (cities.length > 0) {
        const cityLower = p.city?.toLowerCase() || '';
        if (!cities.includes(cityLower)) return false;
      }

      if (p.pipeline_stage === 'dead') return false;

      return true;
    });
  }, [client, allProperties, attachedPropertyIds, matchCities]);

  const now = useMemo(() => new Date(), []);
  const upcomingTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d >= now;
      }),
    [tours, now]
  );

  const pastTours = useMemo(
    () =>
      tours.filter((t) => {
        if (!t.start_time) return false;
        const d = new Date(t.start_time);
        if (Number.isNaN(d.getTime())) return false;
        return d < now;
      }),
    [tours, now]
  );

  return (
    <main className="min-h-screen max-w-4xl">
      <header className="flex items-center justify-between mb-4 gap-2">
        <Link
          href="/clients"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to Clients
        </Link>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          Client Detail
        </span>
      </header>

      {loadingClient && <p>Loading client…</p>}

      {clientError && (
        <p className="text-sm text-red-600 mb-4">
          Error loading client: {clientError}
        </p>
      )}

      {!loadingClient && !clientError && !client && <p>Client not found.</p>}

      {!loadingClient && !clientError && client && (
        <>
          {/* Client summary */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <h1 className="text-xl font-bold mb-1">{client.name}</h1>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
              <div>
                <div className="text-gray-500">Type</div>
                <div className="font-semibold">
                  {client.client_type || '-'}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Stage</div>
                <div className="font-semibold">
                  {client.stage || '-'}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Budget</div>
                <div className="font-semibold">
                  {formatBudget(client.budget_min, client.budget_max)}
                </div>
              </div>
              {client.preferred_locations && (
                <div className="sm:col-span-2">
                  <div className="text-gray-500">Preferred Locations</div>
                  <div className="font-semibold">
                    {client.preferred_locations}
                  </div>
                </div>
              )}
            </div>

            <div className="text-sm text-gray-700">
              {client.phone && <div>📞 {client.phone}</div>}
              {client.email && (
                <div className="text-gray-600">✉️ {client.email}</div>
              )}
            </div>

            {client.notes && (
              <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
                {client.notes}
              </p>
            )}

            <div className="mt-3 text-xs text-gray-500">
              Favorites attached: {favoriteCount}
            </div>
          </section>

          {/* Client portal access */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4 text-sm">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div>
                <h2 className="text-lg font-semibold">Client portal access</h2>
                <p className="text-xs text-gray-500">
                  Link this CRM client to their Hayvn client portal account so
                  they can see tours, saved homes, offers, and messages in one
                  place.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleLinkPortal}
              className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mb-3"
            >
              <div className="space-y-1 md:col-span-2">
                <label className="block text-xs font-medium text-gray-700">
                  Client&apos;s portal email
                </label>
                <input
                  type="email"
                  value={portalEmail}
                  onChange={(e) => setPortalEmail(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="client@example.com"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  They must sign in at <code>/portal</code> with this email
                  first. Once they do, you can link them here.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-700">
                  Role
                </label>
                <select
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="primary">Primary</option>
                  <option value="co_buyer">Co-buyer</option>
                </select>
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={linkSaving}
                  className="inline-flex items-center px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  {linkSaving ? 'Linking…' : 'Link to portal account'}
                </button>
              </div>

              {linkError && (
                <div className="md:col-span-3 text-xs text-red-600">
                  {linkError}
                </div>
              )}
            </form>

            <div className="border-t border-gray-100 pt-3">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">
                Linked portal users
              </h3>
              {portalLinks.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No portal users linked yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {portalLinks.map((link) => (
                    <div
                      key={link.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-medium text-gray-800">
                          {link.portal_user.full_name ||
                            link.portal_user.email ||
                            'Portal user'}
                        </div>
                        <div className="text-gray-500">
                          {link.portal_user.email || 'No email'}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600">
                          {link.role || 'primary'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Potential matches */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Potential Matches</h2>
              <span className="text-xs text-gray-500">
                {potentialMatches.length} match
                {potentialMatches.length === 1 ? '' : 'es'}
              </span>
            </div>

            <p className="text-xs text-gray-600 mb-3">
              Uses budget and preferred locations to suggest properties
              in your system this client might like. MLS-backed matches
              will plug into this later.
            </p>

            {propsLoading && (
              <p className="text-sm text-gray-600">Loading properties…</p>
            )}

            {!propsLoading && potentialMatches.length === 0 && (
              <p className="text-sm text-gray-600">
                No obvious matches right now based on budget/locations
                and your current tracked properties.
              </p>
            )}

            {!propsLoading && potentialMatches.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 text-xs sm:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1 text-left">Property</th>
                      <th className="border px-2 py-1 text-left">Location</th>
                      <th className="border px-2 py-1 text-left">Stage</th>
                      <th className="border px-2 py-1 text-left">Type</th>
                      <th className="border px-2 py-1 text-right">Price</th>
                      <th className="border px-2 py-1 text-center">Attach</th>
                    </tr>
                  </thead>

                  <tbody>
                    {potentialMatches.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="border px-2 py-1">
                          <Link
                            href={`/properties/${p.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {p.address}
                          </Link>
                        </td>
                        <td className="border px-2 py-1">
                          {p.city}, {p.state}
                        </td>
                        <td className="border px-2 py-1">
                          {p.pipeline_stage}
                        </td>
                        <td className="border px-2 py-1">
                          {p.property_type || '-'}
                        </td>
                        <td className="border px-2 py-1 text-right">
                          {formatPrice(p.list_price)}
                        </td>
                        <td className="border px-2 py-1 text-center text-[11px]">
                          <button
                            type="button"
                            className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                            onClick={() => {
                              setSelectedPropertyId(p.id);
                              setRelationship('favorite');
                              setInterestLevel('hot');
                              setIsFavorite(true);
                              const el = document.getElementById(
                                'attach-property-form'
                              );
                              el?.scrollIntoView({ behavior: 'smooth' });
                            }}
                          >
                            + link
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Tours with this client */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">
                Tours with this Client
              </h2>
              <Link
                href="/tours/new"
                className="text-xs text-blue-600 hover:underline"
              >
                + New tour
              </Link>
            </div>

            {toursError && (
              <p className="text-sm text-red-600 mb-2">
                Error loading tours: {toursError}
              </p>
            )}

            {toursLoading && (
              <p className="text-sm text-gray-600">
                Loading tours…
              </p>
            )}

            {!toursLoading && tours.length === 0 && (
              <p className="text-sm text-gray-600">
                No tours scheduled yet for this client.
              </p>
            )}

            {!toursLoading && tours.length > 0 && (
              <div className="space-y-3 text-sm">
                {upcomingTours.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">
                      Upcoming
                    </h3>
                    <ul className="space-y-1">
                      {upcomingTours.map((t) => (
                        <li
                          key={t.id}
                          className="border border-gray-200 rounded-md p-2 flex items-center justify-between gap-2"
                        >
                          <div>
                            <Link
                              href={`/tours/${t.id}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              {t.title || 'Untitled tour'}
                            </Link>
                            <div className="text-xs text-gray-500">
                              {formatDateTime(t.start_time)} •{' '}
                              {t.status || 'planned'}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pastTours.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-gray-500 mt-2 mb-1">
                      Past
                    </h3>
                    <ul className="space-y-1">
                      {pastTours.map((t) => (
                        <li
                          key={t.id}
                          className="border border-gray-200 rounded-md p-2 flex items-center justify-between gap-2"
                        >
                          <div>
                            <Link
                              href={`/tours/${t.id}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              {t.title || 'Untitled tour'}
                            </Link>
                            <div className="text-xs text-gray-500">
                              {formatDateTime(t.start_time)} •{' '}
                              {t.status || 'planned'}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Offers with this client */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Offers with this client</h2>
              <Link
                href="/offers/new"
                className="text-xs text-blue-600 hover:underline"
              >
                + New offer
              </Link>
            </div>

            {offersError && (
              <p className="text-sm text-red-600 mb-2">
                Error loading offers: {offersError}
              </p>
            )}

            {offersLoading && (
              <p className="text-sm text-gray-600">Loading offers…</p>
            )}

            {!offersLoading && offers.length === 0 && !offersError && (
              <p className="text-sm text-gray-600">
                No offers yet for this client. When you create an offer tied to
                this client, it will show up here.
              </p>
            )}

            {!offersLoading && offers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 text-xs sm:text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1 text-left">Property</th>
                      <th className="border px-2 py-1 text-left">Offer</th>
                      <th className="border px-2 py-1 text-left">Status</th>
                      <th className="border px-2 py-1 text-left">
                        Client decision
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Client feedback
                      </th>
                      <th className="border px-2 py-1 text-left">
                        Created / Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50 align-top">
                        <td className="border px-2 py-1">
                          {o.property ? (
                            <>
                              <Link
                                href={`/properties/${o.property.id}`}
                                className="text-blue-600 hover:underline"
                              >
                                {o.property.address}
                              </Link>
                              <div className="text-[11px] text-gray-500">
                                {o.property.city || ''}
                                {o.property.state
                                  ? `, ${o.property.state}`
                                  : ''}
                                {o.property.pipeline_stage
                                  ? ` • ${o.property.pipeline_stage}`
                                  : ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-gray-400">
                              (no property linked)
                            </span>
                          )}
                        </td>

                        <td className="border px-2 py-1 whitespace-nowrap">
                          <div className="font-semibold">
                            {formatPrice(o.offer_price)}
                          </div>
                        </td>

                        <td className="border px-2 py-1 whitespace-nowrap">
                          {o.status || '—'}
                        </td>

                        <td className="border px-2 py-1">
                          {o.client_decision ? (
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
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
                            <span className="text-[11px] text-gray-400">
                              No decision yet
                            </span>
                          )}
                        </td>

                        <td className="border px-2 py-1 text-xs">
                          {o.client_feedback ? (
                            <div className="max-w-xs whitespace-pre-wrap text-gray-700">
                              {o.client_feedback}
                            </div>
                          ) : (
                            <span className="text-gray-400">
                              No feedback yet
                            </span>
                          )}
                        </td>

                        <td className="border px-2 py-1 text-[11px] text-gray-500 whitespace-nowrap">
                          <div>
                            {o.created_at && (
                              <div>Created: {formatDateTime(o.created_at)}</div>
                            )}
                            {o.updated_at && (
                              <div>Updated: {formatDateTime(o.updated_at)}</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Attached properties */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Properties</h2>
              <Link
                href="/properties/new"
                className="text-xs text-blue-600 hover:underline"
              >
                + Add new property
              </Link>
            </div>

            {propsError && (
              <p className="text-sm text-red-600 mb-2">
                Error loading properties: {propsError}
              </p>
            )}

            {/* Attach property form */}
            <form
              id="attach-property-form"
              onSubmit={handleAttachProperty}
              className="border border-gray-200 rounded-md p-3 mb-3 text-sm space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Property
                  </label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="w-full border rounded-md px-2 py-1 text-sm"
                  >
                    <option value="">Select property…</option>
                    {allProperties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.address} – {p.city}, {p.state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Relationship
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full border rounded-md px-2 py-1 text-sm"
                  >
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Interest Level
                  </label>
                  <select
                    value={interestLevel}
                    onChange={(e) => setInterestLevel(e.target.value)}
                    className="w-full border rounded-md px-2 py-1 text-sm"
                  >
                    {INTEREST_OPTIONS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={isFavorite}
                    onChange={(e) => setIsFavorite(e.target.checked)}
                    className="h-3 w-3"
                  />
                  Mark as favorite
                </label>

                <button
                  type="submit"
                  disabled={
                    addingProperty ||
                    propsLoading ||
                    allProperties.length === 0
                  }
                  className="inline-flex items-center px-3 py-1.5 rounded-md bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-60"
                >
                  {addingProperty ? 'Attaching…' : 'Attach Property'}
                </button>
              </div>

              {addPropertyError && (
                <p className="text-xs text-red-600 mt-1">
                  {addPropertyError}
                </p>
              )}
            </form>

            {propsLoading && (
              <p className="text-sm text-gray-600">
                Loading client properties…
              </p>
            )}

            {!propsLoading && clientProperties.length === 0 && (
              <p className="text-sm text-gray-600">
                No properties attached yet. Use the form above to attach
                one of your tracked deals.
              </p>
            )}

            {!propsLoading && clientProperties.length > 0 && (
              <table className="min-w-full border border-gray-200 text-xs sm:text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-2 py-1 text-left">Property</th>
                    <th className="border px-2 py-1 text-left">Relationship</th>
                    <th className="border px-2 py-1 text-left">Interest</th>
                    <th className="border px-2 py-1 text-left">Stage</th>
                    <th className="border px-2 py-1 text-left">
                      Client feedback
                    </th>
                    <th className="border px-2 py-1 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {clientProperties.map((cp) => (
                    <tr key={cp.id} className="hover:bg-gray-50">
                      <td className="border px-2 py-1">
                        {cp.property ? (
                          <Link
                            href={`/properties/${cp.property.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {cp.property.address}
                          </Link>
                        ) : (
                          <span className="text-gray-400">(missing property)</span>
                        )}
                        {cp.property && (
                          <div className="text-[11px] text-gray-500">
                            {cp.property.city}, {cp.property.state}{' '}
                            {cp.is_favorite ? ' • ★ favorite' : ''}
                          </div>
                        )}
                      </td>
                      <td className="border px-2 py-1">
                        {cp.relationship || '-'}
                      </td>
                      <td className="border px-2 py-1">
                        {cp.interest_level || '-'}
                      </td>
                      <td className="border px-2 py-1">
                        {cp.property?.pipeline_stage || '-'}
                      </td>
                      <td className="border px-2 py-1 text-xs">
                        {cp.client_rating != null && (
                          <div className="font-medium">
                            Rating: {cp.client_rating}/5
                          </div>
                        )}
                        {cp.client_feedback && (
                          <div className="text-gray-600 whitespace-pre-wrap">
                            {cp.client_feedback}
                          </div>
                        )}
                        {cp.client_rating == null && !cp.client_feedback && (
                          <span className="text-gray-400">No feedback yet</span>
                        )}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {cp.property
                          ? formatPrice(cp.property.list_price)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Messages to client portal */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">
              Messages to client portal
            </h2>

            <form
              onSubmit={handleAddPortalMessage}
              className="space-y-2 mb-4 text-sm"
            >
              {newMessageError && (
                <p className="text-sm text-red-600">{newMessageError}</p>
              )}

              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={newMessageTitle}
                  onChange={(e) => setNewMessageTitle(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. This week’s plan, Offer update, etc."
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700">
                  Message body
                </label>
                <textarea
                  value={newMessageBody}
                  onChange={(e) => setNewMessageBody(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Write a brief update you want the client to see in their portal."
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={newMessagePinned}
                    onChange={(e) => setNewMessagePinned(e.target.checked)}
                    className="h-3 w-3"
                  />
                  Mark as important (pinned)
                </label>

                <button
                  type="submit"
                  disabled={savingMessage}
                  className="inline-flex items-center px-3 py-2 rounded-md bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-60"
                >
                  {savingMessage ? 'Posting…' : 'Post to portal'}
                </button>
              </div>
            </form>

            {messagesError && (
              <p className="text-sm text-red-600 mb-2">
                Error loading portal messages: {messagesError}
              </p>
            )}

            {messagesLoading && (
              <p className="text-sm text-gray-600">Loading portal messages…</p>
            )}

            {!messagesLoading && messages.length === 0 && !messagesError && (
              <p className="text-sm text-gray-600">
                No messages yet. Use the form above to send updates that show up
                in the client&apos;s portal Messages page.
              </p>
            )}

            {!messagesLoading && messages.length > 0 && (
              <ul className="space-y-3 text-sm">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`border rounded-md p-3 ${
                      m.is_pinned
                        ? 'border-amber-300 bg-amber-50/70'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {m.title || 'Update for this journey'}
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
                      <span>{m.author_name || 'You'}</span>
                      <span>{formatDateTime(m.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Internal Notes */}
          <section className="mb-6 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Internal notes</h2>

            <form onSubmit={handleAddNote} className="space-y-2 mb-4">
              {newNoteError && (
                <p className="text-sm text-red-600">{newNoteError}</p>
              )}
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                rows={3}
                placeholder="Call recap, private notes, details that are for your eyes only."
              />
              <button
                type="submit"
                disabled={savingNote}
                className="inline-flex items-center px-3 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
              >
                {savingNote ? 'Saving…' : 'Add internal note'}
              </button>
            </form>

            {notesLoading && (
              <p className="text-sm text-gray-600">
                Loading notes…
              </p>
            )}

            {notesError && (
              <p className="text-sm text-red-600 mb-2">
                Error loading notes: {notesError}
              </p>
            )}

            {!notesLoading && notes.length === 0 && (
              <p className="text-sm text-gray-600">
                No notes yet. Add your first note above.
              </p>
            )}

            {!notesLoading && notes.length > 0 && (
              <ul className="space-y-3 text-sm">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="border border-gray-200 rounded-md p-3"
                  >
                    <p className="whitespace-pre-wrap mb-1">
                      {note.body}
                    </p>
                    <div className="text-[11px] text-gray-500 flex justify-between">
                      <span>{note.author || 'Unknown'}</span>
                      <span>
                        {new Date(
                          note.created_at
                        ).toLocaleString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

