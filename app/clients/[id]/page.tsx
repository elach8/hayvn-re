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

  // ✅ requirements fields (you said “yes” these exist)
  property_types: string[] | null;
  min_beds: number | null;
  min_baths: number | null;
  deal_style: string | null;
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

type MlsListing = {
  id: string; // mls_listings.id (uuid)
  mls_number: string | null;
  status: string | null;
  list_price: number | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;

  street_number: string | null;
  street_name: string | null;
  street_suffix: string | null;
  unit: string | null;

  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  property_type: string | null;

  raw_payload: any | null;
};

type RecommendationRow = {
  id: string;
  client_id: string;
  mls_listing_id: string;
  score: number | null;
  reasons: string[] | null;
  status: string | null; // "new" | "attached" | "dismissed" etc.
  created_at: string | null;
  updated_at: string | null;
  mls_listings: MlsListing | null;
};

const RELATIONSHIP_OPTIONS = ['favorite', 'toured', 'offered', 'under_contract', 'closed'];
const INTEREST_OPTIONS = ['hot', 'warm', 'cold'];

const STAGES = ['lead', 'active', 'under_contract', 'past', 'lost'];
const TYPES = ['buyer', 'seller', 'both'];

// these are your “checkbox” requirements
const PROPERTY_TYPE_OPTIONS = [
  'SingleFamilyResidence',
  'Condominium',
  'Townhouse',
  'MultiFamily',
  'Duplex',
  'Triplex',
  'Fourplex',
  'ResidentialIncome',
  'ManufacturedHome',
  'Land',
  'Other',
];

const DEAL_STYLE_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'turnkey', label: 'Turnkey' },
  { value: 'fixer', label: 'Fixer' },
  { value: 'value_add', label: 'Value add' },
  { value: 'investment', label: 'Investment' },
];

function normalizeToken(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function buildPrettyAddress(l: MlsListing) {
  const parts: string[] = [];
  const sn = (l.street_number ?? '').toString().trim();
  const name = (l.street_name ?? '').toString().trim();
  const suffix = (l.street_suffix ?? '').toString().trim();
  const unit = (l.unit ?? '').toString().trim();

  if (sn) parts.push(sn);
  if (name) parts.push(name);
  if (suffix) parts.push(suffix);

  let addr = parts.join(' ');
  if (unit) addr = `${addr} #${unit}`;
  return addr || (l.mls_number ? `MLS ${l.mls_number}` : 'MLS Listing');
}

function pickThumbUrl(raw: any): string | null {
  if (!raw) return null;
  return (
    raw?.ThumbnailUrl ??
    raw?.thumbnail_url ??
    raw?.Media?.[0]?.Url ??
    raw?.Photos?.[0]?.Url ??
    null
  );
}

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

  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [relationship, setRelationship] = useState('favorite');
  const [interestLevel, setInterestLevel] = useState('hot');
  const [isFavorite, setIsFavorite] = useState(true);
  const [addingProperty, setAddingProperty] = useState(false);
  const [addPropertyError, setAddPropertyError] = useState<string | null>(null);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [newNoteError, setNewNoteError] = useState<string | null>(null);

  const [portalLinks, setPortalLinks] = useState<PortalAccess[]>([]);
  const [portalEmail, setPortalEmail] = useState('');
  const [linkRole, setLinkRole] = useState('primary');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);

  // ✅ requirements editor state
  const [editingReqs, setEditingReqs] = useState(false);
  const [reqBudgetMin, setReqBudgetMin] = useState('');
  const [reqBudgetMax, setReqBudgetMax] = useState('');
  const [reqPreferredLocations, setReqPreferredLocations] = useState('');
  const [reqMinBeds, setReqMinBeds] = useState('');
  const [reqMinBaths, setReqMinBaths] = useState('');
  const [reqDealStyle, setReqDealStyle] = useState('any');
  const [reqPropertyTypes, setReqPropertyTypes] = useState<string[]>([]);
  const [savingReqs, setSavingReqs] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);

  // ✅ recommendations state
  const [recs, setRecs] = useState<RecommendationRow[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [runningRecs, setRunningRecs] = useState(false);

  const [attachingFromRecId, setAttachingFromRecId] = useState<string | null>(null);
  const [recActionError, setRecActionError] = useState<string | null>(null);

  const toNumberOrNull = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  };

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
          deal_style
        `
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

      // hydrate requirements editor
      setReqBudgetMin(c?.budget_min != null ? String(c.budget_min) : '');
      setReqBudgetMax(c?.budget_max != null ? String(c.budget_max) : '');
      setReqPreferredLocations(c?.preferred_locations ?? '');
      setReqMinBeds(c?.min_beds != null ? String(c.min_beds) : '');
      setReqMinBaths(c?.min_baths != null ? String(c.min_baths) : '');
      setReqDealStyle((c?.deal_style ?? 'any') || 'any');
      setReqPropertyTypes(Array.isArray(c?.property_types) ? c!.property_types! : []);

      setLoadingClient(false);
    };

    const loadAllProperties = async () => {
      setPropsLoading(true);
      setPropsError(null);

      const { data, error } = await supabase
        .from('properties')
        .select('id, address, city, state, list_price, property_type, pipeline_stage, created_at')
        .order('created_at', { ascending: false })
        .limit(300);

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

    const loadRecommendations = async () => {
      setRecsLoading(true);
      setRecsError(null);

      const { data, error } = await supabase
        .from('property_recommendations')
        .select(
          `
          id,
          client_id,
          mls_listing_id,
          score,
          reasons,
          status,
          created_at,
          updated_at,
          mls_listings (
            id,
            mls_number,
            status,
            list_price,
            city,
            state,
            postal_code,
            street_number,
            street_name,
            street_suffix,
            unit,
            beds,
            baths,
            sqft,
            lot_sqft,
            year_built,
            property_type,
            raw_payload
          )
        `
        )
        .eq('client_id', id)
        .order('score', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading recommendations:', error);
        setRecsError(error.message);
        setRecs([]);
        setRecsLoading(false);
        return;
      }

      setRecs((data || []) as any);
      setRecsLoading(false);
    };

    loadClient();
    loadAllProperties();
    loadClientProperties();
    loadClientNotes();
    loadClientTours();
    loadPortalLinks();
    loadClientOffers();
    loadClientMessages();
    loadRecommendations();
  }, [id]);

  const reloadClientProps = async (clientId: string) => {
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
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error reloading client properties:', error);
      return;
    }

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
  };

  const reloadRecommendations = async () => {
    const { data, error } = await supabase
      .from('property_recommendations')
      .select(
        `
        id,
        client_id,
        mls_listing_id,
        score,
        reasons,
        status,
        created_at,
        updated_at,
        mls_listings (
          id,
          mls_number,
          status,
          list_price,
          city,
          state,
          postal_code,
          street_number,
          street_name,
          street_suffix,
          unit,
          beds,
          baths,
          sqft,
          lot_sqft,
          year_built,
          property_type,
          raw_payload
        )
      `
      )
      .eq('client_id', id)
      .order('score', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error reloading recs:', error);
      setRecsError(error.message);
      return;
    }
    setRecs((data || []) as any);
  };

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

    await reloadClientProps(client.id);
    setAddingProperty(false);
  };

  const handleSaveRequirements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    setSavingReqs(true);
    setReqError(null);

    const patch: Partial<Client> = {
      budget_min: toNumberOrNull(reqBudgetMin),
      budget_max: toNumberOrNull(reqBudgetMax),
      preferred_locations: reqPreferredLocations.trim() || null,
      min_beds: toNumberOrNull(reqMinBeds),
      min_baths: toNumberOrNull(reqMinBaths),
      deal_style: reqDealStyle === 'any' ? null : reqDealStyle,
      property_types: reqPropertyTypes.length ? reqPropertyTypes : null,
    };

    const { data, error } = await supabase
      .from('clients')
      .update(patch)
      .eq('id', client.id)
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
        deal_style
      `
      )
      .single();

    if (error) {
      console.error('Error saving requirements:', error);
      setReqError(error.message);
      setSavingReqs(false);
      return;
    }

    setClient(data as any);
    setEditingReqs(false);
    setSavingReqs(false);
  };

  const handleRunRecommendations = async () => {
    if (!client) return;

    setRunningRecs(true);
    setRecsError(null);

    const { data, error } = await supabase.functions.invoke('recommend-matches', {
      body: { client_id: client.id, limit: 50 },
    });

    if (error) {
      console.error('Error running recommend-matches:', error);
      setRecsError(error.message);
      setRunningRecs(false);
      return;
    }

    // optional: you can inspect returned "top" etc.
    console.log('recommend-matches result:', data);

    await reloadRecommendations();
    setRunningRecs(false);
  };

  const setRecStatus = async (rec: RecommendationRow, status: string) => {
    setRecActionError(null);
    const { error } = await supabase
      .from('property_recommendations')
      .update({ status })
      .eq('id', rec.id);

    if (error) {
      console.error('Error updating rec status:', error);
      setRecActionError(error.message);
      return;
    }

    setRecs((prev) =>
      prev.map((r) => (r.id === rec.id ? { ...r, status } : r))
    );
  };

  const attachRecommendationToClient = async (rec: RecommendationRow) => {
    if (!client) return;
    if (!rec.mls_listings) {
      setRecActionError('Recommendation is missing listing data.');
      return;
    }

    setAttachingFromRecId(rec.id);
    setRecActionError(null);

    try {
      const l = rec.mls_listings;

      // 1) Create (or upsert) a row in `properties` mapped from mls_listings
      // Assumption: `properties.mls_id` can store MLS number and is unique-ish for your brokerage
      const address = buildPrettyAddress(l);
      const thumb = pickThumbUrl(l.raw_payload);

      // Try find existing property by mls_id first
      const { data: existingProp, error: findErr } = await supabase
        .from('properties')
        .select('id')
        .eq('mls_id', l.mls_number ?? '')
        .maybeSingle();

      if (findErr) {
        console.error('Error searching existing property:', findErr);
      }

      let propertyId = existingProp?.id as string | undefined;

      if (!propertyId) {
        const { data: created, error: createErr } = await supabase
          .from('properties')
          .insert([
            {
              mls_id: l.mls_number ?? null,
              address,
              city: l.city ?? '',
              state: l.state ?? '',
              zip: l.postal_code ?? '',
              list_price: l.list_price ?? null,
              beds: l.beds ?? null,
              baths: l.baths ?? null,
              sqft: l.sqft ?? null,
              lot_sqft: l.lot_sqft ?? null,
              year_built: l.year_built ?? null,
              property_type: l.property_type ?? null,
              status: l.status ?? null,
              pipeline_stage: 'new',
              primary_photo_url: thumb,
            },
          ])
          .select('id')
          .single();

        if (createErr || !created) {
          console.error('Error creating property from MLS listing:', createErr);
          setRecActionError(createErr?.message || 'Failed to create property from MLS listing.');
          setAttachingFromRecId(null);
          return;
        }

        propertyId = created.id as string;
      }

      // 2) Link property to client in client_properties
      const { error: linkErr } = await supabase.from('client_properties').insert([
        {
          client_id: client.id,
          property_id: propertyId,
          relationship: 'favorite',
          interest_level: 'hot',
          is_favorite: true,
        },
      ]);

      if (linkErr) {
        console.error('Error linking property to client:', linkErr);
        setRecActionError(linkErr.message);
        setAttachingFromRecId(null);
        return;
      }

      // 3) mark rec as attached so the edge fn won't overwrite it
      await setRecStatus(rec, 'attached');

      // 4) refresh client properties list
      await reloadClientProps(client.id);

      // 5) ensure property shows in dropdown list too
      const { data: propRow } = await supabase
        .from('properties')
        .select('id, address, city, state, list_price, property_type, pipeline_stage, created_at')
        .order('created_at', { ascending: false })
        .limit(300);

      setAllProperties((propRow || []) as any);
    } finally {
      setAttachingFromRecId(null);
    }
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

  const attachedPropertyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cp of clientProperties) {
      if (cp.property?.id) ids.add(cp.property.id);
    }
    return ids;
  }, [clientProperties]);

  const recsNew = useMemo(() => recs.filter((r) => (r.status ?? 'new') === 'new'), [recs]);
  const recsAttached = useMemo(() => recs.filter((r) => (r.status ?? '') === 'attached'), [recs]);
  const recsDismissed = useMemo(() => recs.filter((r) => (r.status ?? '') === 'dismissed'), [recs]);

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
      Edit requirements
    </Button>
  </Link>

  <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200">
    Client Detail
  </span>
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
          {/* Client summary */}
          <Card className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                  {client.name}
                </h1>

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
                    <div className="text-slate-400 text-xs uppercase tracking-wide">Budget</div>
                    <div className="font-medium text-slate-50">{formatBudget(client.budget_min, client.budget_max)}</div>
                  </div>

                  {client.preferred_locations && (
                    <div className="sm:col-span-2">
                      <div className="text-slate-400 text-xs uppercase tracking-wide">Preferred Locations</div>
                      <div className="font-medium text-slate-50">{client.preferred_locations}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-sm text-slate-200 space-y-1">
                {client.phone && <div>📞 {client.phone}</div>}
                {client.email && <div>✉️ {client.email}</div>}
                <div className="text-xs text-slate-400 pt-1">Favorites attached: {favoriteCount}</div>
              </div>
            </div>

            {client.notes && (
              <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap border-t border-white/10 pt-3">
                {client.notes}
              </p>
            )}
          </Card>

          {/* ✅ Requirements (edit + checkboxes) */}
          <Card className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-white">Matching requirements</h2>
                <p className="text-xs text-slate-300">
                  These fields power MLS recommendations. Keep them loose enough to get results, then refine.
                </p>
              </div>

              <div className="flex gap-2">
                {!editingReqs ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    onClick={() => setEditingReqs(true)}
                  >
                    Edit requirements
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs px-3 py-1.5"
                      onClick={() => {
                        setEditingReqs(false);
                        setReqError(null);
                        setReqBudgetMin(client.budget_min != null ? String(client.budget_min) : '');
                        setReqBudgetMax(client.budget_max != null ? String(client.budget_max) : '');
                        setReqPreferredLocations(client.preferred_locations ?? '');
                        setReqMinBeds(client.min_beds != null ? String(client.min_beds) : '');
                        setReqMinBaths(client.min_baths != null ? String(client.min_baths) : '');
                        setReqDealStyle((client.deal_style ?? 'any') || 'any');
                        setReqPropertyTypes(Array.isArray(client.property_types) ? client.property_types : []);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="text-xs px-3 py-1.5"
                      disabled={savingReqs}
                      onClick={() => {
                        const form = document.getElementById('req-form') as HTMLFormElement | null;
                        form?.requestSubmit();
                      }}
                    >
                      {savingReqs ? 'Saving…' : 'Save requirements'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {!editingReqs ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide">Budget</div>
                  <div className="text-slate-100 font-medium">
                    {formatBudget(client.budget_min, client.budget_max)}
                  </div>
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
            ) : (
              <form id="req-form" onSubmit={handleSaveRequirements} className="space-y-3">
                {reqError && <p className="text-xs text-red-300">{reqError}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-200">Budget Min</label>
                    <input
                      type="text"
                      value={reqBudgetMin}
                      onChange={(e) => setReqBudgetMin(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 800000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-200">Budget Max</label>
                    <input
                      type="text"
                      value={reqBudgetMax}
                      onChange={(e) => setReqBudgetMax(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 3000000"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1 text-slate-200">Preferred Locations</label>
                    <input
                      type="text"
                      value={reqPreferredLocations}
                      onChange={(e) => setReqPreferredLocations(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="Irvine, Newport Beach, Costa Mesa"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Tip: commas are fine. The matching function is forgiving, but keep city names readable.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-200">Min Beds</label>
                    <input
                      type="text"
                      value={reqMinBeds}
                      onChange={(e) => setReqMinBeds(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 3"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-200">Min Baths</label>
                    <input
                      type="text"
                      value={reqMinBaths}
                      onChange={(e) => setReqMinBaths(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      placeholder="e.g., 2"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1 text-slate-200">Deal Style</label>
                    <select
                      value={reqDealStyle}
                      onChange={(e) => setReqDealStyle(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    >
                      {DEAL_STYLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-2 text-slate-200">Property Types</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-white/10 bg-black/40 p-3">
                      {PROPERTY_TYPE_OPTIONS.map((t) => {
                        const checked = reqPropertyTypes.includes(t);
                        return (
                          <label key={t} className="flex items-center gap-2 text-xs text-slate-200">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...reqPropertyTypes, t]
                                  : reqPropertyTypes.filter((x) => x !== t);
                                setReqPropertyTypes(next);
                              }}
                              className="h-3 w-3 rounded border border-white/40 bg-black/60"
                            />
                            <span className="truncate">{t}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Leave all unchecked = “any”.
                    </p>
                  </div>
                </div>
              </form>
            )}
          </Card>

          {/* ✅ MLS Recommendations (edge function + attach/dismiss) */}
          <Card className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-white">MLS recommendations</h2>
                <p className="text-xs text-slate-300">
                  Click “Generate” to refresh recs from the MLS feed. Then attach the ones you want the client to see.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  className="text-xs px-3 py-1.5"
                  disabled={runningRecs}
                  onClick={handleRunRecommendations}
                >
                  {runningRecs ? 'Generating…' : 'Generate recommendations'}
                </Button>
              </div>
            </div>

            {recsError && <p className="text-xs text-red-300">{recsError}</p>}
            {recActionError && <p className="text-xs text-red-300">{recActionError}</p>}

            {recsLoading ? (
              <p className="text-sm text-slate-300">Loading recommendations…</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
                    New: {recsNew.length}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
                    Attached: {recsAttached.length}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
                    Dismissed: {recsDismissed.length}
                  </span>
                </div>

                {recsNew.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-slate-300">
                    No “new” recommendations yet. Try loosening the requirements (locations/budget) and generate again.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
                    <table className="min-w-full text-xs sm:text-sm">
                      <thead className="bg-white/5 text-slate-300">
                        <tr>
                          <th className="px-2 py-1 text-left border-b border-white/10">Listing</th>
                          <th className="px-2 py-1 text-left border-b border-white/10">Location</th>
                          <th className="px-2 py-1 text-right border-b border-white/10">Price</th>
                          <th className="px-2 py-1 text-right border-b border-white/10">Score</th>
                          <th className="px-2 py-1 text-left border-b border-white/10">Reasons</th>
                          <th className="px-2 py-1 text-center border-b border-white/10">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recsNew.map((r) => {
                          const l = r.mls_listings;
                          const addr = l ? buildPrettyAddress(l) : '(missing listing)';
                          const loc = l ? `${l.city ?? ''}${l.state ? `, ${l.state}` : ''}` : '—';
                          return (
                            <tr key={r.id} className="hover:bg-white/5 text-slate-100 align-top">
                              <td className="border-b border-white/5 px-2 py-1">
                                <div className="font-medium">{addr}</div>
                                <div className="text-[11px] text-slate-400">
                                  {l?.mls_number ? `MLS ${l.mls_number}` : '—'} • {l?.property_type || '—'} • {l?.status || '—'}
                                </div>
                              </td>
                              <td className="border-b border-white/5 px-2 py-1">{loc || '—'}</td>
                              <td className="border-b border-white/5 px-2 py-1 text-right">
                                {formatPrice(l?.list_price ?? null)}
                              </td>
                              <td className="border-b border-white/5 px-2 py-1 text-right">
                                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-slate-100">
                                  {r.score ?? '—'}
                                </span>
                              </td>
                              <td className="border-b border-white/5 px-2 py-1 text-[11px] text-slate-200">
                                {r.reasons?.length ? (
                                  <ul className="list-disc pl-4 space-y-0.5">
                                    {r.reasons.slice(0, 4).map((x, idx) => (
                                      <li key={idx} className="text-slate-200">
                                        {x}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="border-b border-white/5 px-2 py-1 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    type="button"
                                    className="text-[11px] px-2 py-1"
                                    disabled={attachingFromRecId === r.id}
                                    onClick={() => attachRecommendationToClient(r)}
                                  >
                                    {attachingFromRecId === r.id ? 'Attaching…' : 'Attach to client'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="text-[11px] px-2 py-1"
                                    onClick={() => setRecStatus(r, 'dismissed')}
                                  >
                                    Dismiss
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Client portal access */}
          <Card className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Client portal access</h2>
                <p className="text-xs text-slate-300 max-w-xl">
                  Link this CRM client to their Hayvn client portal account so they can see tours, saved homes, offers, and messages.
                </p>
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

            <div className="border-t border-white/10 pt-3">
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
                        <div className="font-medium">
                          {link.portal_user.full_name || link.portal_user.email || 'Portal user'}
                        </div>
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
          </Card>

          {/* Tours */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Tours with this client</h2>
              <Link href="/tours/new">
                <Button variant="secondary" className="text-xs px-3 py-1.5">
                  + New tour
                </Button>
              </Link>
            </div>

            {toursError && <p className="text-sm text-red-300">Error loading tours: {toursError}</p>}
            {toursLoading && <p className="text-sm text-slate-300">Loading tours…</p>}

            {!toursLoading && tours.length === 0 && (
              <p className="text-sm text-slate-300">No tours scheduled yet for this client.</p>
            )}

            {!toursLoading && tours.length > 0 && (
              <div className="space-y-3 text-sm">
                {upcomingTours.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-slate-400 mb-1">Upcoming</h3>
                    <ul className="space-y-1">
                      {upcomingTours.map((t) => (
                        <li
                          key={t.id}
                          className="border border-white/10 rounded-md p-2 bg-black/30 flex items-center justify-between gap-2"
                        >
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
                        <li
                          key={t.id}
                          className="border border-white/10 rounded-md p-2 bg-black/30 flex items-center justify-between gap-2"
                        >
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

          {/* Offers */}
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
              <p className="text-sm text-slate-300">
                No offers yet for this client. When you create an offer tied to this client, it will show up here.
              </p>
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

            {propsError && <p className="text-sm text-red-300">Error loading properties: {propsError}</p>}

            {/* Attach property form */}
            <form
              id="attach-property-form"
              onSubmit={handleAttachProperty}
              className="border border-white/10 rounded-md p-3 bg-black/40 text-sm space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-200">Property</label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-black/60 px-2 py-1.5 text-sm text-slate-100"
                  >
                    <option value="">Select property…</option>
                    {allProperties.map((p) => (
                      <option key={p.id} value={p.id} disabled={attachedPropertyIds.has(p.id)}>
                        {p.address} – {p.city}, {p.state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-200">Relationship</label>
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
                  <label className="block text-xs font-medium mb-1 text-slate-200">Interest level</label>
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

                <Button type="submit" disabled={addingProperty || propsLoading || allProperties.length === 0} className="text-xs px-3 py-1.5">
                  {addingProperty ? 'Attaching…' : 'Attach property'}
                </Button>
              </div>

              {addPropertyError && <p className="text-xs text-red-300 mt-1">{addPropertyError}</p>}
            </form>

            {propsLoading && <p className="text-sm text-slate-300">Loading client properties…</p>}

            {!propsLoading && clientProperties.length === 0 && (
              <p className="text-sm text-slate-300">
                No properties attached yet. Use the MLS recommendations above (Attach) or the form here.
              </p>
            )}

            {!propsLoading && clientProperties.length > 0 && (
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
                    </tr>
                  </thead>
                  <tbody>
                    {clientProperties.map((cp) => (
                      <tr key={cp.id} className="hover:bg-white/5 text-slate-100">
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
                            </div>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Messages to client portal */}
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
                  placeholder="e.g. This week’s plan, Offer update, etc."
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
              <p className="text-sm text-slate-300">
                No messages yet. Use the form above to send updates that show up in the client&apos;s portal.
              </p>
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
                          <h3 className="text-sm font-semibold text-slate-50 truncate">
                            {m.title || 'Update for this journey'}
                          </h3>
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

          {/* Internal notes */}
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

            {!notesLoading && notes.length === 0 && (
              <p className="text-sm text-slate-300">No notes yet. Add your first note above.</p>
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
