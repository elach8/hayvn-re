// app/portal/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type ClientProfile = {
  id: string;
  name: string | null;
  client_type: string | null;
  stage: string | null;
  preferred_locations: string | null;
  budget_min: number | null;
  budget_max: number | null;
};

type EditableClient = ClientProfile & {
  budgetMinInput: string;
  budgetMaxInput: string;
  locationsInput: string;
};

export default function PortalProfilePage() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clients, setClients] = useState<EditableClient[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const toNumberOrNull = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setAuthError(null);
      setLoadError(null);
      setSaveError(null);
      setSaveSuccess(null);

      // 1) Get current auth user
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Portal profile auth error:', sessionError);
        setAuthError('You need to be signed in to manage your profile.');
        setLoading(false);
        return;
      }

      if (!session) {
        setAuthError('You need to be signed in to manage your profile.');
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

      // 2) Load all clients tied to this email
      const {
        data: clientRows,
        error: clientError,
      } = await supabase
        .from('clients')
        .select(
          `
          id,
          name,
          client_type,
          stage,
          preferred_locations,
          budget_min,
          budget_max,
          email
        `
        )
        .eq('email', email)
        .order('created_at', { ascending: true });

      if (clientError) {
        console.error('Error loading clients for portal profile:', clientError);
        setLoadError('Could not load your profile information.');
        setLoading(false);
        return;
      }

      const editable: EditableClient[] = (clientRows || []).map((row: any) => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        client_type: (row.client_type as string | null) ?? null,
        stage: (row.stage as string | null) ?? null,
        preferred_locations:
          (row.preferred_locations as string | null) ?? null,
        budget_min: (row.budget_min as number | null) ?? null,
        budget_max: (row.budget_max as number | null) ?? null,
        budgetMinInput:
          typeof row.budget_min === 'number'
            ? String(row.budget_min)
            : '',
        budgetMaxInput:
          typeof row.budget_max === 'number'
            ? String(row.budget_max)
            : '',
        locationsInput:
          (row.preferred_locations as string | null) ?? '',
      }));

      setClients(editable);
      setLoading(false);
    };

    loadData();
  }, []);

  const handleChange = (
    clientId: string,
    field: 'budgetMinInput' | 'budgetMaxInput' | 'locationsInput',
    value: string
  ) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id === clientId
          ? {
              ...c,
              [field]: value,
            }
          : c
      )
    );
    setSaveError(null);
    setSaveSuccess(null);
  };

  const handleSave = async (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    setSavingId(clientId);
    setSaveError(null);
    setSaveSuccess(null);

    const budgetMin = toNumberOrNull(client.budgetMinInput);
    const budgetMax = toNumberOrNull(client.budgetMaxInput);
    const locations = client.locationsInput.trim() || null;

    const { error } = await supabase
      .from('clients')
      .update({
        budget_min: budgetMin,
        budget_max: budgetMax,
        preferred_locations: locations,
      })
      .eq('id', clientId);

    if (error) {
      console.error('Error saving portal profile:', error);
      setSaveError(error.message || 'Could not save your changes.');
      setSavingId(null);
      return;
    }

    // Sync back into state
    setClients((prev) =>
      prev.map((c) =>
        c.id === clientId
          ? {
              ...c,
              budget_min: budgetMin,
              budget_max: budgetMax,
              preferred_locations: locations,
            }
          : c
      )
    );

    setSavingId(null);
    setSaveSuccess('Your preferences were saved.');
  };

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Your profile & preferences</h1>
          <p className="text-sm text-gray-700">
            Update your search areas and budget so your agent has the most accurate picture of what you&apos;re looking for.
          </p>
        </div>
        <Link
          href="/portal"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to portal
        </Link>
      </header>

      {authError && (
        <p className="text-sm text-red-600 mb-3">
          {authError}
        </p>
      )}

      {!authError && loadError && (
        <p className="text-sm text-red-600 mb-3">
          {loadError}
        </p>
      )}

      {saveError && (
        <p className="text-sm text-red-600 mb-3">
          {saveError}
        </p>
      )}

      {saveSuccess && (
        <p className="text-sm text-green-600 mb-3">
          {saveSuccess}
        </p>
      )}

      {!authError && loading && (
        <p className="text-sm text-gray-600">Loading your profile…</p>
      )}

      {!loading && !authError && clients.length === 0 && !loadError && (
        <p className="text-sm text-gray-600">
          We couldn&apos;t find any journeys tied to your email yet. Ask your agent to create a client record in Hayvn-RE using this email address.
        </p>
      )}

      {!loading && !authError && clients.length > 0 && (
        <div className="space-y-4">
          {clients.map((c) => {
            const label =
              c.client_type === 'buyer'
                ? 'Buying journey'
                : c.client_type === 'seller'
                ? 'Selling journey'
                : 'Journey';

            return (
              <section
                key={c.id}
                className="border border-gray-200 rounded-lg p-4 text-sm"
              >
                <header className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">
                      {c.name || 'Journey'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {label}
                      {c.stage ? ` • ${c.stage}` : ''}
                    </p>
                  </div>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700">
                      Preferred areas
                    </label>
                    <input
                      type="text"
                      value={c.locationsInput}
                      onChange={(e) =>
                        handleChange(c.id, 'locationsInput', e.target.value)
                      }
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      placeholder="e.g., Irvine, Costa Mesa, Tustin"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      You can list multiple cities separated by commas.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-700">
                        Budget minimum
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={c.budgetMinInput}
                        onChange={(e) =>
                          handleChange(c.id, 'budgetMinInput', e.target.value)
                        }
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        placeholder="e.g., 800000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-700">
                        Budget maximum
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={c.budgetMaxInput}
                        onChange={(e) =>
                          handleChange(c.id, 'budgetMaxInput', e.target.value)
                        }
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        placeholder="e.g., 1500000"
                      />
                    </div>
                  </div>
                </div>

                <footer className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSave(c.id)}
                    disabled={savingId === c.id}
                    className="inline-flex items-center px-4 py-2 rounded-md bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-60"
                  >
                    {savingId === c.id ? 'Saving…' : 'Save preferences'}
                  </button>
                </footer>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
