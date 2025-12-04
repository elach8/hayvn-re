// app/properties/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

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

export default function PropertyDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [clientRelationship, setClientRelationship] =
    useState<string>('favorite');
  const [clientInterestLevel, setClientInterestLevel] =
    useState<string>('hot');
  const [clientIsFavorite, setClientIsFavorite] = useState<boolean>(true);
  const [attachingClient, setAttachingClient] = useState(false);
  const [attachClientError, setAttachClientError] = useState<string | null>(
    null
  );

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
      } else {
        setProperty(data as Property | null);
      }

      setLoading(false);
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
        .select(
          'id, relationship, contacts ( id, name, role, phone, email )'
        )
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
        .select(
          'id, name, client_type, stage, budget_min, budget_max'
        )
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
        author: 'Ed', // later: link to actual user
      },
    ]);

    if (error) {
      console.error('Error adding note:', error);
      setNoteError(error.message);
      setSavingNote(false);
      return;
    }

    // Reload notes
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

    // Reload property contacts
    const { data, error: reloadError } = await supabase
      .from('property_contacts')
      .select(
        'id, relationship, contacts ( id, name, role, phone, email )'
      )
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

    // Reload property clients
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

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value: number | null) => {
    if (value == null) return '-';
    return `${value.toLocaleString()}%`;
  };

  const formatCapRate = (value: number | null) => {
    if (value == null) return '-';
    // If they typed 6.5, show 6.5%; if 0.065, show 6.5%
    if (value > 0 && value < 1) {
      return `${(value * 100).toLocaleString()}%`;
    }
    return `${value.toLocaleString()}%`;
  };

  const formatBudget = (min: number | null, max: number | null) => {
    if (min == null && max == null) return '-';
    const toMoney = (v: number | null) =>
      v == null ? '' : `$${v.toLocaleString()}`;
    if (min != null && max != null) return `${toMoney(min)} – ${toMoney(max)}`;
    if (min != null) return `${toMoney(min)}+`;
    return `up to ${toMoney(max)}`;
  };

  const inputClass =
    'w-full rounded-md border border-white/15 bg-black/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500';
  const labelClass = 'block text-xs font-medium text-slate-300 mb-1';

  return (
    <main className="min-h-screen max-w-4xl mx-auto text-slate-100">
      <header className="flex items-center justify-between mb-5 gap-2 pt-6">
        <Link
          href="/properties"
          className="text-xs sm:text-sm text-slate-300 hover:text-slate-50 hover:underline"
        >
          ← Back to Properties
        </Link>

        <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 text-slate-200 border border-white/10">
          Property detail
        </span>
      </header>

      {loading && <p className="text-sm text-slate-200">Loading property…</p>}

      {error && (
        <p className="text-sm text-red-100 bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2 mb-4">
          Error loading property: {error}
        </p>
      )}

      {!loading && !error && !property && (
        <p className="text-sm text-slate-200">Property not found.</p>
      )}

      {!loading && !error && property && (
        <div className="pb-8 space-y-6">
          {/* Property summary */}
          <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">
                  {property.address}
                </h1>
                <p className="text-sm text-slate-300">
                  {property.city}, {property.state} {property.zip}
                </p>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
                {property.pipeline_stage}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mt-3">
              <div>
                <div className="text-slate-400">List price</div>
                <div className="font-semibold">
                  {formatCurrency(property.list_price)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Type</div>
                <div className="font-semibold">
                  {property.property_type || '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Pipeline stage</div>
                <div className="font-semibold capitalize">
                  {property.pipeline_stage.replace('_', ' ')}
                </div>
              </div>
              {property.mls_id && (
                <div>
                  <div className="text-slate-400">MLS ID</div>
                  <div className="font-semibold">{property.mls_id}</div>
                </div>
              )}
              {property.mls_url && (
                <div className="sm:col-span-2">
                  <div className="text-slate-400">MLS link</div>
                  <a
                    href={property.mls_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-300 hover:text-indigo-200 hover:underline break-all"
                  >
                    Open in MLS →
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* Investment metrics / commercial info */}
          {(property.apn ||
            property.zoning ||
            property.num_units != null ||
            property.occupancy_pct != null ||
            property.noi_annual != null ||
            property.cap_rate != null ||
            property.parking_spaces != null) && (
            <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  Investment metrics
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
                  Commercial / industrial
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {property.apn && (
                  <div>
                    <div className="text-slate-400">APN</div>
                    <div className="font-semibold">{property.apn}</div>
                  </div>
                )}
                {property.zoning && (
                  <div>
                    <div className="text-slate-400">Zoning</div>
                    <div className="font-semibold">{property.zoning}</div>
                  </div>
                )}
                {property.num_units != null && (
                  <div>
                    <div className="text-slate-400">Units</div>
                    <div className="font-semibold">
                      {property.num_units}
                    </div>
                  </div>
                )}
                {property.occupancy_pct != null && (
                  <div>
                    <div className="text-slate-400">Occupancy</div>
                    <div className="font-semibold">
                      {formatPercent(property.occupancy_pct)}
                    </div>
                  </div>
                )}
                {property.noi_annual != null && (
                  <div>
                    <div className="text-slate-400">NOI (annual)</div>
                    <div className="font-semibold">
                      {formatCurrency(property.noi_annual)}
                    </div>
                  </div>
                )}
                {property.cap_rate != null && (
                  <div>
                    <div className="text-slate-400">Cap rate</div>
                    <div className="font-semibold">
                      {formatCapRate(property.cap_rate)}
                    </div>
                  </div>
                )}
                {property.parking_spaces != null && (
                  <div>
                    <div className="text-slate-400">Parking spaces</div>
                    <div className="font-semibold">
                      {property.parking_spaces}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Contacts section */}
          <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100">
                Contacts
              </h2>
              <Link
                href="/contacts/new"
                className="text-xs text-indigo-300 hover:text-indigo-200 hover:underline"
              >
                + New contact
              </Link>
            </div>

            {contactsError && (
              <p className="text-sm text-red-300 mb-2">
                Error loading contacts: {contactsError}
              </p>
            )}

            {/* Attach existing contact */}
            <form
              onSubmit={handleAttachContact}
              className="flex flex-col sm:flex-row gap-3 mb-4 text-sm"
            >
              <div className="flex-1">
                <label className={labelClass}>Contact</label>
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select contact…</option>
                  {allContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.role ? ` (${c.role})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className={labelClass}>Relationship</label>
                <input
                  type="text"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className={inputClass}
                  placeholder="listing agent, owner, lender…"
                />
              </div>

              <div className="sm:self-end">
                <button
                  type="submit"
                  disabled={
                    addingContact ||
                    contactsLoading ||
                    allContacts.length === 0
                  }
                  className="w-full sm:w-auto inline-flex items-center rounded-lg bg-[#EBD27A] px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-[#f0dc96] disabled:opacity-60"
                >
                  {addingContact ? 'Adding…' : 'Attach'}
                </button>
              </div>
            </form>

            {addContactError && (
              <p className="text-sm text-red-300 mb-2">
                {addContactError}
              </p>
            )}

            {contactsLoading && (
              <p className="text-sm text-slate-300">
                Loading contacts…
              </p>
            )}

            {!contactsLoading && propertyContacts.length === 0 && (
              <p className="text-sm text-slate-300">
                No contacts attached yet. Create a contact or attach an
                existing one above.
              </p>
            )}

            {!contactsLoading && propertyContacts.length > 0 && (
              <ul className="space-y-2 text-sm">
                {propertyContacts.map((pc) => (
                  <li
                    key={pc.id}
                    className="rounded-lg border border-white/10 bg-black/40 p-3"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <div>
                        <div className="font-semibold">
                          {pc.contact?.name || 'Unknown contact'}
                        </div>
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Clients section */}
          <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100">
                Clients on this deal
              </h2>
              <Link
                href="/clients/new"
                className="text-xs text-indigo-300 hover:text-indigo-200 hover:underline"
              >
                + New client
              </Link>
            </div>

            {clientsError && (
              <p className="text-sm text-red-300 mb-2">
                Error loading clients: {clientsError}
              </p>
            )}

            {/* Attach client form */}
            <form
              onSubmit={handleAttachClient}
              className="border border-white/10 rounded-lg bg-black/40 p-3 mb-3 text-sm space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>Client</label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className={inputClass.replace('px-3 py-2', 'px-2 py-1')}
                  >
                    <option value="">Select client…</option>
                    {allClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.client_type ? ` (${c.client_type})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Relationship</label>
                  <select
                    value={clientRelationship}
                    onChange={(e) => setClientRelationship(e.target.value)}
                    className={inputClass.replace('px-3 py-2', 'px-2 py-1')}
                  >
                    <option value="favorite">favorite</option>
                    <option value="toured">toured</option>
                    <option value="offered">offered</option>
                    <option value="under_contract">under_contract</option>
                    <option value="closed">closed</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Interest level</label>
                  <select
                    value={clientInterestLevel}
                    onChange={(e) => setClientInterestLevel(e.target.value)}
                    className={inputClass.replace('px-3 py-2', 'px-2 py-1')}
                  >
                    <option value="hot">hot</option>
                    <option value="warm">warm</option>
                    <option value="cold">cold</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={clientIsFavorite}
                    onChange={(e) => setClientIsFavorite(e.target.checked)}
                    className="h-3 w-3 rounded border border-white/30 bg-black/60"
                  />
                  Mark as favorite for this client
                </label>

                <button
                  type="submit"
                  disabled={
                    attachingClient ||
                    clientsLoading ||
                    allClients.length === 0
                  }
                  className="inline-flex items-center rounded-lg bg-[#EBD27A] px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm hover:bg-[#f0dc96] disabled:opacity-60"
                >
                  {attachingClient ? 'Attaching…' : 'Attach client'}
                </button>
              </div>

              {attachClientError && (
                <p className="text-xs text-red-300 mt-1">
                  {attachClientError}
                </p>
              )}
            </form>

            {clientsLoading && (
              <p className="text-sm text-slate-300">
                Loading property clients…
              </p>
            )}

            {!clientsLoading && propertyClients.length === 0 && (
              <p className="text-sm text-slate-300">
                No clients attached yet. Use the form above to connect
                this property to a buyer or seller.
              </p>
            )}

            {!clientsLoading && propertyClients.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-white/10 text-xs sm:text-sm">
                  <thead className="bg-white/5 text-slate-300">
                    <tr>
                      <th className="border border-white/10 px-2 py-1 text-left">
                        Client
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-left">
                        Relationship
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-left">
                        Interest
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-left">
                        Stage
                      </th>
                      <th className="border border-white/10 px-2 py-1 text-left">
                        Budget
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {propertyClients.map((pc) => (
                      <tr key={pc.id} className="hover:bg-white/5">
                        <td className="border border-white/10 px-2 py-1">
                          {pc.client ? (
                            <Link
                              href={`/clients/${pc.client.id}`}
                              className="text-indigo-300 hover:text-indigo-200 hover:underline"
                            >
                              {pc.client.name}
                            </Link>
                          ) : (
                            <span className="text-slate-500">
                              (missing client)
                            </span>
                          )}
                          {pc.client && (
                            <div className="text-[11px] text-slate-400">
                              {pc.client.client_type || 'unknown type'}
                              {pc.is_favorite ? ' • ★ favorite' : ''}
                            </div>
                          )}
                        </td>
                        <td className="border border-white/10 px-2 py-1">
                          {pc.relationship || '-'}
                        </td>
                        <td className="border border-white/10 px-2 py-1">
                          {pc.interest_level || '-'}
                        </td>
                        <td className="border border-white/10 px-2 py-1">
                          {pc.client?.stage || '-'}
                        </td>
                        <td className="border border-white/10 px-2 py-1">
                          {pc.client
                            ? formatBudget(
                                pc.client.budget_min,
                                pc.client.budget_max
                              )
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Notes section */}
          <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-100 mb-3">
              Internal notes
            </h2>

            <form onSubmit={handleAddNote} className="space-y-2 mb-4">
              {noteError && (
                <p className="text-sm text-red-300">{noteError}</p>
              )}
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-black/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
                placeholder="Call recap, seller info, price guidance, issues, etc."
              />
              <button
                type="submit"
                disabled={savingNote}
                className="inline-flex items-center rounded-lg bg-[#EBD27A] px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-[#f0dc96] disabled:opacity-60"
              >
                {savingNote ? 'Saving…' : 'Add note'}
              </button>
            </form>

            {notesLoading && (
              <p className="text-sm text-slate-300">Loading notes…</p>
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
                    className="rounded-lg border border-white/10 bg-black/40 p-3"
                  >
                    <p className="whitespace-pre-wrap mb-1 text-slate-100">
                      {note.body}
                    </p>
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
          </section>
        </div>
      )}
    </main>
  );
}
