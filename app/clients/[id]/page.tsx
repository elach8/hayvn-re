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
          (row.offer_price as number | null) ?? (row.price as number | null) ??
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
    <div className="max-w-5xl space-y-6">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3">
        <Link href="/clients">
          <Button variant="ghost" className="text-xs sm:text-sm px-3 py-1.5">
            ← Back to Clients
          </Button>
        </Link>
        <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200">
          Client Detail
        </span>
      </header>

      {/* Loading / error states for client */}
      {loadingClient && (
        <Card>
          <p className="text-sm text-slate-300">Loading client…</p>
        </Card>
      )}

      {clientError && (
        <Card>
          <p className="text-sm text-red-300">
            Error loading client: {clientError}
          </p>
        </Card>
      )}

      {!loadingClient && !clientError && !client && (
        <Card>
          <p className="text-sm text-slate-300">Client not found.</p>
        </Card>
      )}

      {!loadingClient && !clientError && client && (
        <>
          {/* Client summary */}
          <Card className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                  {client.name}
                </h1>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mt-3">
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wide">
                      Type
                    </div>
                    <div className="font-medium text-slate-50">
                      {client.client_type || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wide">
                      Stage
                    </div>
                    <div className="font-medium text-slate-50">
                      {client.stage || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wide">
                      Budget
                    </div>
                    <div className="font-medium text-slate-50">
                      {formatBudget(client.budget_min, client.budget_max)}
                    </div>
                  </div>
                  {client.preferred_locations && (
                    <div className="sm:col-span-2">
                      <div className="text-slate-400 text-xs uppercase tracking-wide">
                        Preferred Locations
                      </div>
                      <div className="font-medium text-slate-50">
                        {client.preferred_locations}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-sm text-slate-200 space-y-1">
                {client.phone && <div>📞 {client.phone}</div>}
                {client.email && <div>✉️ {client.email}</div>}
                <div className="text-xs text-slate-400 pt-1">
                  Favorites attached: {favoriteCount}
                </div>
              </div>
            </div>

            {client.notes && (
              <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap border-t border-white/10 pt-3">
                {client.notes}
              </p>
            )}
          </Card>

          {/* Listing readiness tool hook */}
          <Card className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Listing readiness (beta)
                </h2>
                <p className="text-xs text-slate-300 max-w-xl">
                  Quickly score how ready this client&apos;s home is to go to
                  market across condition, repairs, staging, and marketing
                  assets. Use it as a structured talking point with the client.
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/tools/listing-readiness?client_id=${encodeURIComponent(
                    client.id
                  )}`}
                >
                  <Button className="text-xs px-3 py-1.5">
                    Open listing readiness tool
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-300">
              <p>
                This tool is tied to the client first. Inside the tool you can
                optionally link the score to a specific property once it&apos;s
                created in your pipeline.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Coming soon: a history of scores for this client will appear
                here once we finalize the scoring storage.
              </p>
            </div>
          </Card>

          {/* Client portal access */}
          <Card className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Client portal access
                </h2>
                <p className="text-xs text-slate-300 max-w-xl">
                  Link this CRM client to their Hayvn client portal account so
                  they can see tours, saved homes, offers, and messages in one
                  place.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleLinkPortal}
              className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
            >
              <div className="space-y-1 md:col-span-2">
                <label className="block text-xs font-medium text-slate-200">
                  Client&apos;s portal email
                </label>
                <input
                  type="email"
                  value={portalEmail}
                  onChange={(e) => setPortalEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  placeholder="client@example.com"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  They must sign in at <code>/portal</code> with this email
                  first. Once they do, you can link them here.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-200">
                  Role
                </label>
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

              {linkError && (
                <div className="md:col-span-3 text-xs text-red-300">
                  {linkError}
                </div>
              )}
            </form>

            <div className="border-t border-white/10 pt-3">
              <h3 className="text-xs font-semibold text-slate-200 mb-2">
                Linked portal users
              </h3>
              {portalLinks.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No portal users linked yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {portalLinks.map((link) => (
                    <div
                      key={link.id}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 flex items-center justify-between text-xs text-slate-100"
                    >
                      <div>
                        <div className="font-medium">
                          {link.portal_user.full_name ||
                            link.portal_user.email ||
                            'Portal user'}
                        </div>
                        <div className="text-slate-400">
                          {link.portal_user.email || 'No email'}
                        </div>
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
          </Card>

          {/* Potential matches */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Potential matches
              </h2>
              <span className="text-xs text-slate-400">
                {potentialMatches.length} match
                {potentialMatches.length === 1 ? '' : 'es'}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Uses budget and preferred locations to suggest properties in your
              system this client might like. MLS-backed matches will plug into
              this later.
            </p>

            {propsLoading && (
              <p className="text-sm text-slate-300">Loading properties…</p>
            )}

            {!propsLoading && potentialMatches.length === 0 && (
              <p className="text-sm text-slate-300">
                No obvious matches right now based on budget/locations and your
                current tracked properties.
              </p>
            )}

            {!propsLoading && potentialMatches.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
                <table className="min-w-full text-xs sm:text-sm">
                  <thead className="bg-white/5 text-slate-300">
                    <tr>
                      <th className="px-2 py-1 text-left border-b border-white/10">
                        Property
                      </th>
                      <th className="px-2 py-1 text-left border-b border-white/10">
                        Location
                      </th>
                      <th className="px-2 py-1 text-left border-b border-white/10">
                        Stage
                      </th>
                      <th className="px-2 py-1 text-left border-b border-white/10">
                        Type
                      </th>
                      <th className="px-2 py-1 text-right border-b border-white/10">
                        Price
                      </th>
                      <th className="px-2 py-1 text-center border-b border-white/10">
                        Attach
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {potentialMatches.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-white/5 text-slate-100"
                      >
                        <td className="border-b border-white/5 px-2 py-1">
                          <Link
                            href={`/properties/${p.id}`}
                            className="text-[#EBD27A] hover:underline"
                          >
                            {p.address}
                          </Link>
                        </td>
                        <td className="border-b border-white/5 px-2 py-1">
                          {p.city}, {p.state}
                        </td>
                        <td className="border-b border-white/5 px-2 py-1">
                          {p.pipeline_stage}
                        </td>
                        <td className="border-b border-white/5 px-2 py-1">
                          {p.property_type || '-'}
                        </td>
                        <td className="border-b border-white/5 px-2 py-1 text-right">
                          {formatPrice(p.list_price)}
                        </td>
                        <td className="border-b border-white/5 px-2 py-1 text-center text-[11px]">
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1 text-[11px]"
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
                            + Link
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Tours */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Tours with this client
              </h2>
              <Link href="/tours/new">
                <Button variant="secondary" className="text-xs px-3 py-1.5">
                  + New tour
                </Button>
              </Link>
            </div>

            {toursError && (
              <p className="text-sm text-red-300">
                Error loading tours: {toursError}
              </p>
            )}

            {toursLoading && (
              <p className="text-sm text-slate-300">Loading tours…</p>
            )}

            {!toursLoading && tours.length === 0 && (
              <p className="text-sm text-slate-300">
                No tours scheduled yet for this client.
              </p>
            )}

            {!toursLoading && tours.length > 0 && (
              <div className="space-y-3 text-sm">
                {upcomingTours.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-slate-400 mb-1">
                      Upcoming
                    </h3>
                    <ul className="space-y-1">
                      {upcomingTours.map((t) => (
                        <li
                          key={t.id}
                          className="border border-white/10 rounded-md p-2 bg-black/30 flex items-center justify-between gap-2"
                        >
                          <div>
                            <Link
                              href={`/tours/${t.id}`}
                              className="font-medium text-[#EBD27A] hover:underline"
                            >
                              {t.title || 'Untitled tour'}
                            </Link>
                            <div className="text-xs text-slate-400">
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
                    <h3 className="text-xs font-semibold uppercase text-slate-400 mt-2 mb-1">
                      Past
                    </h3>
                    <ul className="space-y-1">
                      {pastTours.map((t) => (
                        <li
                          key={t.id}
                          className="border border-white/10 rounded-md p-2 bg-black/30 flex items-center justify-between gap-2"
                        >
                          <div>
                            <Link
                              href={`/tours/${t.id}`}
                              className="font-medium text-[#EBD27A] hover:underline"
                            >
                              {t.title || 'Untitled tour'}
                            </Link>
                            <div className="text-xs text-slate-400">
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
          </Card>

          {/* Offers */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Offers with this client
              </h2>
            <Link href="/offers/new">
              <Button variant="secondary" className="text-xs px-3 py-1.5">
                + New offer
              </Button>
            </Link>
          </div>

          {offersError && (
            <p className="text-sm text-red-300">
              Error loading offers: {offersError}
            </p>
          )}

          {offersLoading && (
            <p className="text-sm text-slate-300">Loading offers…</p>
          )}

          {!offersLoading && offers.length === 0 && !offersError && (
            <p className="text-sm text-slate-300">
              No offers yet for this client. When you create an offer tied to
              this client, it will show up here.
            </p>
          )}

          {!offersLoading && offers.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Property
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Offer
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Status
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Client decision
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Client feedback
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Created / Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr
                      key={o.id}
                      className="hover:bg-white/5 text-slate-100 align-top"
                    >
                      <td className="border-b border-white/5 px-2 py-1">
                        {o.property ? (
                          <>
                            <Link
                              href={`/properties/${o.property.id}`}
                              className="text-[#EBD27A] hover:underline"
                            >
                              {o.property.address}
                            </Link>
                            <div className="text-[11px] text-slate-400">
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
                          <span className="text-slate-500">
                            (no property linked)
                          </span>
                        )}
                      </td>

                      <td className="border-b border-white/5 px-2 py-1 whitespace-nowrap">
                        <div className="font-semibold">
                          {formatPrice(o.offer_price)}
                        </div>
                      </td>

                      <td className="border-b border-white/5 px-2 py-1 whitespace-nowrap">
                        {o.status || '—'}
                      </td>

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
                          <span className="text-[11px] text-slate-500">
                            No decision yet
                          </span>
                        )}
                      </td>

                      <td className="border-b border-white/5 px-2 py-1 text-xs">
                        {o.client_feedback ? (
                          <div className="max-w-xs whitespace-pre-wrap text-slate-100">
                            {o.client_feedback}
                          </div>
                        ) : (
                          <span className="text-slate-500">
                            No feedback yet
                          </span>
                        )}
                      </td>

                      <td className="border-b border-white/5 px-2 py-1 text-[11px] text-slate-400 whitespace-nowrap">
                        <div>
                          {o.created_at && (
                            <div>
                              Created: {formatDateTime(o.created_at)}
                            </div>
                          )}
                          {o.updated_at && (
                            <div>
                              Updated: {formatDateTime(o.updated_at)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Attached properties */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Properties</h2>
            <Link href="/properties/new">
              <Button variant="secondary" className="text-xs px-3 py-1.5">
                + Add new property
              </Button>
            </Link>
          </div>

          {propsError && (
            <p className="text-sm text-red-300">
              Error loading properties: {propsError}
            </p>
          )}

          {/* Attach property form */}
          <form
            id="attach-property-form"
            onSubmit={handleAttachProperty}
            className="border border-white/10 rounded-md p-3 bg-black/40 text-sm space-y-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-200">
                  Property
                </label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/60 px-2 py-1.5 text-sm text-slate-100"
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
                <label className="block text-xs font-medium mb-1 text-slate-200">
                  Relationship
                </label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/60 px-2 py-1.5 text-sm text-slate-100"
                >
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-200">
                  Interest level
                </label>
                <select
                  value={interestLevel}
                  onChange={(e) => setInterestLevel(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/60 px-2 py-1.5 text-sm text-slate-100"
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
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={isFavorite}
                  onChange={(e) => setIsFavorite(e.target.checked)}
                  className="h-3 w-3 rounded border border-white/40 bg-black/60"
                />
                Mark as favorite
              </label>

              <Button
                type="submit"
                disabled={
                  addingProperty || propsLoading || allProperties.length === 0
                }
                className="text-xs px-3 py-1.5"
              >
                {addingProperty ? 'Attaching…' : 'Attach property'}
              </Button>
            </div>

            {addPropertyError && (
              <p className="text-xs text-red-300 mt-1">{addPropertyError}</p>
            )}
          </form>

          {propsLoading && (
            <p className="text-sm text-slate-300">
              Loading client properties…
            </p>
          )}

          {!propsLoading && clientProperties.length === 0 && (
            <p className="text-sm text-slate-300">
              No properties attached yet. Use the form above to attach one of
              your tracked deals.
            </p>
          )}

          {!propsLoading && clientProperties.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-white/5 text-slate-300">
                  <tr>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Property
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Relationship
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Interest
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Stage
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-left">
                      Client feedback
                    </th>
                    <th className="border-b border-white/10 px-2 py-1 text-right">
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clientProperties.map((cp) => (
                    <tr
                      key={cp.id}
                      className="hover:bg-white/5 text-slate-100"
                    >
                      <td className="border-b border-white/5 px-2 py-1">
                        {cp.property ? (
                          <Link
                            href={`/properties/${cp.property.id}`}
                            className="text-[#EBD27A] hover:underline"
                          >
                            {cp.property.address}
                          </Link>
                        ) : (
                          <span className="text-slate-500">
                            (missing property)
                          </span>
                        )}
                        {cp.property && (
                          <div className="text-[11px] text-slate-400">
                            {cp.property.city}, {cp.property.state}{' '}
                            {cp.is_favorite ? ' • ★ favorite' : ''}
                          </div>
                        )}
                      </td>
                      <td className="border-b border-white/5 px-2 py-1">
                        {cp.relationship || '-'}
                      </td>
                      <td className="border-b border-white/5 px-2 py-1">
                        {cp.interest_level || '-'}
                      </td>
                      <td className="border-b border-white/5 px-2 py-1">
                        {cp.property?.pipeline_stage || '-'}
                      </td>
                      <td className="border-b border-white/5 px-2 py-1 text-xs">
                        {cp.client_rating != null && (
                          <div className="font-medium">
                            Rating: {cp.client_rating}/5
                          </div>
                        )}
                        {cp.client_feedback && (
                          <div className="text-slate-100 whitespace-pre-wrap">
                            {cp.client_feedback}
                          </div>
                        )}
                        {cp.client_rating == null && !cp.client_feedback && (
                          <span className="text-slate-500">
                            No feedback yet
                          </span>
                        )}
                      </td>
                      <td className="border-b border-white/5 px-2 py-1 text-right">
                        {cp.property
                          ? formatPrice(cp.property.list_price)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Messages to client portal */}
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Messages to client portal
          </h2>

          <form onSubmit={handleAddPortalMessage} className="space-y-3 text-sm">
            {newMessageError && (
              <p className="text-sm text-red-300">{newMessageError}</p>
            )}

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-200">
                Title (optional)
              </label>
              <input
                type="text"
                value={newMessageTitle}
                onChange={(e) => setNewMessageTitle(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="e.g. This week’s plan, Offer update, etc."
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-200">
                Message body
              </label>
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

              <Button
                type="submit"
                disabled={savingMessage}
                className="text-xs px-3 py-1.5"
              >
                {savingMessage ? 'Posting…' : 'Post to portal'}
              </Button>
            </div>
          </form>

          {messagesError && (
            <p className="text-sm text-red-300">
              Error loading portal messages: {messagesError}
            </p>
          )}

          {messagesLoading && (
            <p className="text-sm text-slate-300">
              Loading portal messages…
            </p>
          )}

          {!messagesLoading && messages.length === 0 && !messagesError && (
            <p className="text-sm text-slate-300">
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
                      ? 'border-amber-300 bg-amber-500/10'
                      : 'border-white/15 bg-black/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-slate-50 truncate">
                          {m.title || 'Update for this journey'}
                        </h3>
                        {m.is_pinned && (
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-100 whitespace-nowrap">
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
                    <span>{m.author_name || 'You'}</span>
                    <span>{formatDateTime(m.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Internal notes */}
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Internal notes
          </h2>

          <form onSubmit={handleAddNote} className="space-y-2">
            {newNoteError && (
              <p className="text-sm text-red-300">{newNoteError}</p>
            )}
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              rows={3}
              placeholder="Call recap, private notes, details that are for your eyes only."
            />
            <Button
              type="submit"
              disabled={savingNote}
              className="text-sm px-4 py-2"
            >
              {savingNote ? 'Saving…' : 'Add internal note'}
            </Button>
          </form>

          {notesLoading && (
            <p className="text-sm text-slate-300">Loading notes…</p>
          )}

          {notesError && (
            <p className="text-sm text-red-300">
              Error loading notes: {notesError}
            </p>
          )}

          {!notesLoading && notes.length === 0 && (
            <p className="text-sm text-slate-300">
              No notes yet. Add your first note above.
            </p>
          )}

          {!notesLoading && notes.length > 0 && (
            <ul className="space-y-3 text-sm">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="border border-white/15 rounded-md p-3 bg-black/40 text-slate-100"
                >
                  <p className="whitespace-pre-wrap mb-1">{note.body}</p>
                  <div className="text-[11px] text-slate-400 flex justify-between">
                    <span>{note.author || 'Unknown'}</span>
                    <span>
                      {new Date(note.created_at).toLocaleString()}
                    </span>
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
