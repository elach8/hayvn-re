// app/properties/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ListingPhotoCarousel } from '../../components/ListingPhotoCarousel';
import { useRouter } from 'next/navigation';


type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  list_price: number | null;
  property_type: string | null;
  pipeline_stage: string;
  mls_id: string | null;
  mls_url: string | null;

  primary_photo_url?: string | null;

  // commercial / industrial fields
  apn: string | null;
  zoning: string | null;
  num_units: number | null;
  occupancy_pct: number | null;
  noi_annual: number | null;
  cap_rate: number | null;
  parking_spaces: number | null;
};

type Note = {
  id: string;
  body: string;
  author: string | null;
  created_at: string;
};

type Contact = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
};

type PropertyContact = {
  id: string;
  relationship: string | null;
  contact: Contact | null;
};

type ClientSummary = {
  id: string;
  name: string;
  client_type: string | null;
  stage: string | null;
  budget_min: number | null;
  budget_max: number | null;
};

type PropertyClient = {
  id: string;
  relationship: string | null;
  interest_level: string | null;
  is_favorite: boolean;
  client: ClientSummary | null;
};

type MlsListing = {
  id: string; // mls_listings.id
  mls_number: string;
  status: string | null;
  list_price: number | null;
  property_type: string | null;
  street_number: string | null;
  street_dir_prefix: string | null;
  street_name: string | null;
  street_suffix: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  raw_payload: any;
};

type PhotoRow = {
  id: string;
  listing_id: string;
  sort_order: number | null;
  url: string;
  caption: string | null;
  created_at: string;
};

function toNum(val: any): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();


  const [property, setProperty] = useState<Property | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // MLS photo support
  const [mlsListing, setMlsListing] = useState<MlsListing | null>(null);
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([]);

  // Contacts state
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [propertyContacts, setPropertyContacts] = useState<PropertyContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState<string | null>(null);

  // Clients state
  const [allClients, setAllClients] = useState<ClientSummary[]>([]);
  const [propertyClients, setPropertyClients] = useState<PropertyClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);

  // New note state
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Attach contact state
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [relationship, setRelationship] = useState<string>('listing agent');
  const [addingContact, setAddingContact] = useState(false);
  const [addContactError, setAddContactError] = useState<string | null>(null);

  // Attach client state
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientRelationship, setClientRelationship] = useState<string>('favorite');
  const [clientInterestLevel, setClientInterestLevel] = useState<string>('hot');
  const [clientIsFavorite, setClientIsFavorite] = useState<boolean>(true);
  const [attachingClient, setAttachingClient] = useState(false);
  const [attachClientError, setAttachClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const loadProperty = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('properties')
        .select(
          `
          id,
          address,
          city,
          state,
          zip,
          list_price,
          property_type,
          pipeline_stage,
          mls_id,
          mls_url,
          primary_photo_url,
          apn,
          zoning,
          num_units,
          occupancy_pct,
          noi_annual,
          cap_rate,
          parking_spaces
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error loading property:', error);
        setError(error.message);
        setProperty(null);
      } else {
        setProperty(data as Property | null);
      }

      setLoading(false);

      const p = data as Property | null;
      if (p?.mls_id) {
        // Look up listing by mls_number to pull raw payload + photos
        const { data: listingRow, error: lErr } = await supabase
          .from('mls_listings')
          .select(
            `
            id,
            mls_number,
            status,
            list_price,
            property_type,
            street_number,
            street_dir_prefix,
            street_name,
            street_suffix,
            unit,
            city,
            state,
            postal_code,
            beds,
            baths,
            sqft,
            year_built,
            raw_payload
          `
          )
          .eq('mls_number', p.mls_id)
          .maybeSingle();

        if (lErr) {
          console.warn('MLS listing lookup error:', lErr.message);
          setMlsListing(null);
          setPhotoRows([]);
          return;
        }

        const typed = (listingRow as any as MlsListing) ?? null;
        setMlsListing(typed);

        if (typed?.id) {
          const { data: rows, error: photoErr } = await supabase
            .from('mls_listing_photos')
            .select('id, listing_id, sort_order, url, caption, created_at')
            .eq('listing_id', typed.id)
            .order('sort_order', { ascending: true })
            .limit(200);

          if (photoErr) {
            console.warn('MLS listing photos error:', photoErr.message);
            setPhotoRows([]);
          } else {
            setPhotoRows((rows ?? []) as PhotoRow[]);
          }
        } else {
          setPhotoRows([]);
        }
      } else {
        setMlsListing(null);
        setPhotoRows([]);
      }
    };

    const loadNotes = async () => {
      setNotesLoading(true);
      const { data, error } = await supabase
        .from('property_notes')
        .select('id, body, author, created_at')
        .eq('property_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading notes:', error);
        setNoteError(error.message);
      } else {
        setNotes((data || []) as Note[]);
      }

      setNotesLoading(false);
    };

    const loadAllContacts = async () => {
      setContactsLoading(true);
      setContactsError(null);

      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, role, phone, email')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading contacts:', error);
        setContactsError(error.message);
        setAllContacts([]);
      } else {
        setAllContacts((data || []) as Contact[]);
      }

      setContactsLoading(false);
    };

    const loadPropertyContacts = async () => {
      setContactsLoading(true);
      setContactsError(null);

      const { data, error } = await supabase
        .from('property_contacts')
        .select('id, relationship, contacts ( id, name, role, phone, email )')
        .eq('property_id', id)
        .order('relationship', { ascending: true });

      if (error) {
        console.error('Error loading property contacts:', error);
        setContactsError(error.message);
        setPropertyContacts([]);
      } else {
        const mapped: PropertyContact[] = (data || []).map((row: any) => ({
          id: row.id,
          relationship: row.relationship,
          contact: row.contacts
            ? {
                id: row.contacts.id,
                name: row.contacts.name,
                role: row.contacts.role,
                phone: row.contacts.phone,
                email: row.contacts.email,
              }
            : null,
        }));
        setPropertyContacts(mapped);
      }

      setContactsLoading(false);
    };

    const loadAllClients = async () => {
      setClientsLoading(true);
      setClientsError(null);

      const { data, error } = await supabase
        .from('clients')
        .select('id, name, client_type, stage, budget_min, budget_max')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error loading clients:', error);
        setClientsError(error.message);
        setAllClients([]);
      } else {
        setAllClients((data || []) as ClientSummary[]);
      }

      setClientsLoading(false);
    };

    const loadPropertyClients = async () => {
      setClientsLoading(true);
      setClientsError(null);

      const { data, error } = await supabase
        .from('client_properties')
        .select(
          `
          id,
          relationship,
          interest_level,
          is_favorite,
          clients (
            id,
            name,
            client_type,
            stage,
            budget_min,
            budget_max
          )
        `
        )
        .eq('property_id', id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading property clients:', error);
        setClientsError(error.message);
        setPropertyClients([]);
      } else {
        const mapped: PropertyClient[] = (data || []).map((row: any) => ({
          id: row.id,
          relationship: row.relationship,
          interest_level: row.interest_level,
          is_favorite: row.is_favorite ?? false,
          client: row.clients
            ? {
                id: row.clients.id,
                name: row.clients.name,
                client_type: row.clients.client_type,
                stage: row.clients.stage,
                budget_min: row.clients.budget_min,
                budget_max: row.clients.budget_max,
              }
            : null,
        }));
        setPropertyClients(mapped);
      }

      setClientsLoading(false);
    };

    loadProperty();
    loadNotes();
    loadAllContacts();
    loadPropertyContacts();
    loadAllClients();
    loadPropertyClients();
  }, [id]);

  const derivedBeds = useMemo(() => {
    if (mlsListing?.beds != null) return mlsListing.beds;
    const rp = mlsListing?.raw_payload ?? null;
    return rp ? toNum(rp?.BedroomsTotal) ?? toNum(rp?.BedroomsTotalInteger) ?? toNum(rp?.BedsTotal) ?? null : null;
  }, [mlsListing]);

  const derivedBaths = useMemo(() => {
    if (mlsListing?.baths != null) return mlsListing.baths;
    const rp = mlsListing?.raw_payload ?? null;
    return rp
      ? toNum(rp?.BathroomsTotalInteger) ?? toNum(rp?.BathroomsTotal) ?? toNum(rp?.BathsTotal) ?? null
      : null;
  }, [mlsListing]);

  const derivedSqft = useMemo(() => {
    if (mlsListing?.sqft != null) return mlsListing.sqft;
    const rp = mlsListing?.raw_payload ?? null;
    return rp ? toNum(rp?.LivingArea) ?? toNum(rp?.BuildingAreaTotal) ?? toNum(rp?.LivingAreaSquareFeet) ?? null : null;
  }, [mlsListing]);

  const derivedYear = useMemo(() => {
    if (mlsListing?.year_built != null) return mlsListing.year_built;
    const rp = mlsListing?.raw_payload ?? null;
    return rp ? toNum(rp?.YearBuilt) ?? null : null;
  }, [mlsListing]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) {
      setNoteError('Note cannot be empty.');
      return;
    }
    if (!property) return;

    setSavingNote(true);
    setNoteError(null);

    const { error } = await supabase.from('property_notes').insert([
      {
        property_id: property.id,
        body: newNote.trim(),
        author: 'Ed',
      },
    ]);

    if (error) {
      console.error('Error adding note:', error);
      setNoteError(error.message);
      setSavingNote(false);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('property_notes')
      .select('id, body, author, created_at')
      .eq('property_id', property.id)
      .order('created_at', { ascending: false });

    if (reloadError) {
      console.error('Error reloading notes:', reloadError);
    } else {
      setNotes((data || []) as Note[]);
    }

    setNewNote('');
    setSavingNote(false);
  };

  const handleAttachContact = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!property) return;
    if (!selectedContactId) {
      setAddContactError('Select a contact first.');
      return;
    }

    setAddingContact(true);
    setAddContactError(null);

    const { error } = await supabase.from('property_contacts').insert([
      {
        property_id: property.id,
        contact_id: selectedContactId,
        relationship: relationship.trim() || null,
      },
    ]);

    if (error) {
      console.error('Error attaching contact:', error);
      setAddContactError(error.message);
      setAddingContact(false);
      return;
    }

    const { data, error: reloadError } = await supabase
      .from('property_contacts')
      .select('id, relationship, contacts ( id, name, role, phone, email )')
      .eq('property_id', property.id)
      .order('relationship', { ascending: true });

    if (reloadError) {
      console.error('Error reloading property contacts:', reloadError);
    } else {
      const mapped: PropertyContact[] = (data || []).map((row: any) => ({
        id: row.id,
        relationship: row.relationship,
        contact: row.contacts
          ? {
              id: row.contacts.id,
              name: row.contacts.name,
              role: row.contacts.role,
              phone: row.contacts.phone,
              email: row.contacts.email,
            }
          : null,
      }));
      setPropertyContacts(mapped);
    }

    setAddingContact(false);
  };

  const handleAttachClient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!property) return;
    if (!selectedClientId) {
      setAttachClientError('Select a client first.');
      return;
    }

    setAttachingClient(true);
    setAttachClientError(null);

    const { error } = await supabase.from('client_properties').insert([
      {
        client_id: selectedClientId,
        property_id: property.id,
        relationship: clientRelationship.trim() || null,
        interest_level: clientInterestLevel.trim() || null,
        is_favorite: clientIsFavorite,
      },
    ]);

    if (error) {
      console.error('Error attaching client:', error);
      setAttachClientError(error.message);
      setAttachingClient(false);
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
        clients (
          id,
          name,
          client_type,
          stage,
          budget_min,
          budget_max
        )
      `
      )
      .eq('property_id', property.id)
      .order('created_at', { ascending: false });

    if (reloadError) {
      console.error('Error reloading property clients:', reloadError);
    } else {
      const mapped: PropertyClient[] = (data || []).map((row: any) => ({
        id: row.id,
        relationship: row.relationship,
        interest_level: row.interest_level,
        is_favorite: row.is_favorite ?? false,
        client: row.clients
          ? {
              id: row.clients.id,
              name: row.clients.name,
              client_type: row.clients.client_type,
              stage: row.clients.stage,
              budget_min: row.clients.budget_min,
              budget_max: row.clients.budget_max,
            }
          : null,
      }));
      setPropertyClients(mapped);
    }

    setAttachingClient(false);
  };

  const formatCurrency = (value: number | null) => (value == null ? '—' : `$${value.toLocaleString()}`);

  const formatPercent = (value: number | null) => (value == null ? '—' : `${value.toLocaleString()}%`);

  const formatCapRate = (value: number | null) => {
    if (value == null) return '—';
    if (value > 0 && value < 1) return `${(value * 100).toLocaleString()}%`;
    return `${value.toLocaleString()}%`;
  };

  const formatBudget = (min: number | null, max: number | null) => {
    if (min == null && max == null) return '—';
    const toMoney = (v: number | null) => (v == null ? '' : `$${v.toLocaleString()}`);
    if (min != null && max != null) return `${toMoney(min)} – ${toMoney(max)}`;
    if (min != null) return `${toMoney(min)}+`;
    return `up to ${toMoney(max)}`;
  };

  const inputClass =
    'w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]';
  const labelClass = 'block text-xs font-medium text-slate-200 mb-1';

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs sm:text-sm text-slate-300 hover:text-slate-50 hover:underline"
          >
            ← Back
          </button>


          <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200">
            Property Detail
          </span>
        </header>

        {loading && (
          <Card>
            <p className="text-sm text-slate-300">Loading property…</p>
          </Card>
        )}

        {error && (
          <Card>
            <p className="text-sm text-red-300">Error loading property: {error}</p>
          </Card>
        )}

        {!loading && !error && !property && (
          <Card>
            <p className="text-sm text-slate-300">Property not found.</p>
          </Card>
        )}

        {!loading && !error && property && (
          <>
            {/* Hero + photos (matches-style) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <Card className="lg:col-span-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-white truncate">
                      <span className="text-[#EBD27A]">{property.address}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {property.city}, {property.state} {property.zip}
                      {property.mls_id ? (
                        <>
                          {' '}
                          • <span className="font-mono">MLS #{property.mls_id}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200 shrink-0">
                    {property.pipeline_stage}
                  </span>
                </div>

                <ListingPhotoCarousel
                  photoRows={photoRows}
                  rawPayload={mlsListing?.raw_payload ?? null}
                  fallbackUrls={[property.primary_photo_url ?? null].filter(Boolean) as string[]}
                />
              </Card>

              <Card className="lg:col-span-2 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {property.property_type ? (
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">
                      {property.property_type}
                    </span>
                  ) : null}
                  {property.mls_url ? (
                    <a
                      href={property.mls_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-[#EBD27A]/30 bg-[#EBD27A]/10 px-2 py-0.5 text-[11px] text-[#EBD27A]"
                    >
                      Open in MLS →
                    </a>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="List price" value={formatCurrency(property.list_price ?? mlsListing?.list_price ?? null)} />
                  <Info
                    label="Beds / Baths"
                    value={
                      derivedBeds != null || derivedBaths != null
                        ? `${derivedBeds ?? '—'} bd / ${derivedBaths ?? '—'} ba`
                        : '—'
                    }
                  />
                  <Info label="Sqft" value={derivedSqft != null ? Number(derivedSqft).toLocaleString() : '—'} />
                  <Info label="Year" value={derivedYear != null ? String(derivedYear) : '—'} />
                </div>
              </Card>
            </div>

            {/* Investment metrics / commercial info */}
            {(property.apn ||
              property.zoning ||
              property.num_units != null ||
              property.occupancy_pct != null ||
              property.noi_annual != null ||
              property.cap_rate != null ||
              property.parking_spaces != null) && (
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-100">Investment metrics</h2>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
                    Commercial / industrial
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {property.apn && <Info label="APN" value={property.apn} />}
                  {property.zoning && <Info label="Zoning" value={property.zoning} />}
                  {property.num_units != null && <Info label="Units" value={String(property.num_units)} />}
                  {property.occupancy_pct != null && <Info label="Occupancy" value={formatPercent(property.occupancy_pct)} />}
                  {property.noi_annual != null && <Info label="NOI (annual)" value={formatCurrency(property.noi_annual)} />}
                  {property.cap_rate != null && <Info label="Cap rate" value={formatCapRate(property.cap_rate)} />}
                  {property.parking_spaces != null && <Info label="Parking spaces" value={String(property.parking_spaces)} />}
                </div>
              </Card>
            )}

            {/* Contacts section */}
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Contacts</h2>
                <Link href="/contacts/new">
                  <Button variant="ghost" className="text-xs sm:text-sm">
                    + New contact
                  </Button>
                </Link>
              </div>

              {contactsError && <p className="text-sm text-red-300">{contactsError}</p>}

              <form onSubmit={handleAttachContact} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm items-end">
                <div className="sm:col-span-1">
                  <label className={labelClass}>Contact</label>
                  <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} className={inputClass}>
                    <option value="">Select contact…</option>
                    {allContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.role ? ` (${c.role})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className={labelClass}>Relationship</label>
                  <input type="text" value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClass} />
                </div>

                <div className="sm:col-span-1 flex justify-end">
                  <Button type="submit" disabled={addingContact || contactsLoading || allContacts.length === 0} className="text-xs px-3 py-2">
                    {addingContact ? 'Adding…' : 'Attach'}
                  </Button>
                </div>

                {addContactError && <div className="sm:col-span-3 text-xs text-red-300">{addContactError}</div>}
              </form>

              {contactsLoading && <p className="text-sm text-slate-300">Loading contacts…</p>}

              {!contactsLoading && propertyContacts.length === 0 && (
                <p className="text-sm text-slate-300">No contacts attached yet.</p>
              )}

              {!contactsLoading && propertyContacts.length > 0 && (
                <div className="space-y-2 text-sm">
                  {propertyContacts.map((pc) => (
                    <div key={pc.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
                      <div className="flex justify-between items-center gap-2">
                        <div>
                          <div className="font-semibold">{pc.contact?.name || 'Unknown contact'}</div>
                          <div className="text-xs text-slate-400">
                            {pc.relationship || 'Contact'}
                            {pc.contact?.role ? ` • ${pc.contact.role}` : ''}
                          </div>
                        </div>
                        <div className="text-xs text-right text-slate-400 space-y-0.5">
                          {pc.contact?.phone && <div>{pc.contact.phone}</div>}
                          {pc.contact?.email && <div>{pc.contact.email}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Clients section */}
            <Card className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-100">Clients on this deal</h2>
                <Link href="/clients/new">
                  <Button variant="ghost" className="text-xs sm:text-sm">
                    + New client
                  </Button>
                </Link>
              </div>

              {clientsError && <p className="text-sm text-red-300">{clientsError}</p>}

              <form onSubmit={handleAttachClient} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm items-end">
                <div className="sm:col-span-1">
                  <label className={labelClass}>Client</label>
                  <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className={inputClass}>
                    <option value="">Select client…</option>
                    {allClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.client_type ? ` (${c.client_type})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className={labelClass}>Relationship</label>
                  <select value={clientRelationship} onChange={(e) => setClientRelationship(e.target.value)} className={inputClass}>
                    <option value="favorite">favorite</option>
                    <option value="toured">toured</option>
                    <option value="offered">offered</option>
                    <option value="under_contract">under_contract</option>
                    <option value="closed">closed</option>
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <label className={labelClass}>Interest level</label>
                  <select value={clientInterestLevel} onChange={(e) => setClientInterestLevel(e.target.value)} className={inputClass}>
                    <option value="hot">hot</option>
                    <option value="warm">warm</option>
                    <option value="cold">cold</option>
                  </select>
                </div>

                <div className="sm:col-span-1 flex justify-end gap-3 items-center">
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input
                      type="checkbox"
                      checked={clientIsFavorite}
                      onChange={(e) => setClientIsFavorite(e.target.checked)}
                      className="h-3 w-3 rounded border border-white/40 bg-black/60"
                    />
                    ★ favorite
                  </label>

                  <Button type="submit" disabled={attachingClient || clientsLoading || allClients.length === 0} className="text-xs px-3 py-2">
                    {attachingClient ? 'Attaching…' : 'Attach'}
                  </Button>
                </div>

                {attachClientError && <div className="sm:col-span-4 text-xs text-red-300">{attachClientError}</div>}
              </form>

              {clientsLoading && <p className="text-sm text-slate-300">Loading property clients…</p>}

              {!clientsLoading && propertyClients.length === 0 && (
                <p className="text-sm text-slate-300">No clients attached yet.</p>
              )}

              {!clientsLoading && propertyClients.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/40">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-white/5 text-slate-300">
                      <tr>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Client</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Relationship</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Interest</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Stage</th>
                        <th className="border-b border-white/10 px-2 py-1 text-left">Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propertyClients.map((pc) => (
                        <tr key={pc.id} className="hover:bg-white/5">
                          <td className="border-b border-white/5 px-2 py-1">
                            {pc.client ? (
                              <Link href={`/clients/${pc.client.id}`} className="text-[#EBD27A] hover:underline">
                                {pc.client.name}
                              </Link>
                            ) : (
                              <span className="text-slate-500">(missing client)</span>
                            )}
                            {pc.client && (
                              <div className="text-[11px] text-slate-400">
                                {pc.client.client_type || 'unknown type'}
                                {pc.is_favorite ? ' • ★ favorite' : ''}
                              </div>
                            )}
                          </td>
                          <td className="border-b border-white/5 px-2 py-1">{pc.relationship || '—'}</td>
                          <td className="border-b border-white/5 px-2 py-1">{pc.interest_level || '—'}</td>
                          <td className="border-b border-white/5 px-2 py-1">{pc.client?.stage || '—'}</td>
                          <td className="border-b border-white/5 px-2 py-1">
                            {pc.client ? formatBudget(pc.client.budget_min, pc.client.budget_max) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Notes section */}
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-100">Internal notes</h2>

              <form onSubmit={handleAddNote} className="space-y-2">
                {noteError && <p className="text-sm text-red-300">{noteError}</p>}
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  rows={3}
                  placeholder="Call recap, seller info, price guidance, issues, etc."
                />
                <Button type="submit" disabled={savingNote} className="text-sm px-4 py-2">
                  {savingNote ? 'Saving…' : 'Add note'}
                </Button>
              </form>

              {notesLoading && <p className="text-sm text-slate-300">Loading notes…</p>}

              {!notesLoading && notes.length === 0 && <p className="text-sm text-slate-300">No notes yet.</p>}

              {!notesLoading && notes.length > 0 && (
                <ul className="space-y-3 text-sm">
                  {notes.map((note) => (
                    <li key={note.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
                      <p className="whitespace-pre-wrap mb-1 text-slate-100">{note.body}</p>
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
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

