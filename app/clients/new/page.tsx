// /app/clients/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const STAGES = ['lead', 'active', 'under_contract', 'past', 'lost'];
const TYPES = ['buyer', 'seller', 'both'];

export default function NewClientPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [clientType, setClientType] = useState('buyer');
  const [stage, setStage] = useState('lead');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');
  const [notes, setNotes] = useState('');

  const [preparePortal, setPreparePortal] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toNumberOrNull = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const lowerEmail = trimmedEmail.toLowerCase();

    // 1) Insert the CRM client row
    const { data: insertedClient, error: clientError } = await supabase
      .from('clients')
      .insert([
        {
          name: trimmedName,
          email: trimmedEmail || null,
          phone: trimmedPhone || null,
          client_type: clientType,
          stage,
          budget_min: toNumberOrNull(budgetMin),
          budget_max: toNumberOrNull(budgetMax),
          preferred_locations: preferredLocations.trim() || null,
          notes: notes.trim() || null,
        },
      ])
      .select('id')
      .single();

    if (clientError || !insertedClient) {
      console.error('Error inserting client:', clientError);
      setError(clientError?.message || 'Failed to save client.');
      setSaving(false);
      return;
    }

    const newClientId = insertedClient.id as string;

    // 2) Optionally link to an EXISTING portal user (non-blocking)
    if (preparePortal && trimmedEmail) {
      // 2a) Look for existing portal user
      const { data: existingPortal, error: portalLookupError } = await supabase
        .from('client_portal_users')
        .select('id')
        .eq('email', lowerEmail)
        .maybeSingle();

      if (portalLookupError) {
        console.error('Error looking up portal user:', portalLookupError);
      }

      const portalUserId = existingPortal?.id as string | undefined;

      // 2b) If there is an existing portal user, link it to this client
      if (portalUserId) {
        const { error: linkError } = await supabase
          .from('client_portal_access')
          .upsert(
            {
              portal_user_id: portalUserId,
              client_id: newClientId,
              role: 'primary',
            },
            { onConflict: 'portal_user_id,client_id' }
          );

        if (linkError) {
          console.error('Error linking portal user to client:', linkError);
        }
      }
    }

    router.push('/clients');
  };

  return (
    <div className="max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Add Client
          </h1>
          <p className="text-sm text-slate-300">
            Create a buyer or seller profile with basic preferences.
          </p>
        </div>
        <Link href="/clients">
          <Button variant="ghost" className="text-xs sm:text-sm">
            ← Back to Clients
          </Button>
        </Link>
      </header>

      <Card className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-300">
              {error}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="Client name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Type
              </label>
              <select
                value={clientType}
                onChange={(e) => setClientType(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Stage
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="name@example.com"
            />
            <div className="mt-2 flex items-start gap-2 text-xs text-slate-300">
              <input
                id="prepare-portal"
                type="checkbox"
                checked={preparePortal}
                onChange={(e) => setPreparePortal(e.target.checked)}
                className="mt-0.5 h-3 w-3 rounded border border-white/30 bg-black/60"
              />
              <label htmlFor="prepare-portal" className="leading-snug">
                If a client portal account already exists for this email, link
                this client to it automatically. Otherwise, they&apos;ll be linked
                once they sign in at <code className="text-[10px]">/portal</code>.
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Budget Min
              </label>
              <input
                type="text"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="e.g., 800000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-100">
                Budget Max
              </label>
              <input
                type="text"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                placeholder="e.g., 1500000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">
              Preferred Locations
            </label>
            <input
              type="text"
              value={preferredLocations}
              onChange={(e) => setPreferredLocations(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              placeholder="Irvine, Costa Mesa, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-slate-100">
              Internal Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
              rows={3}
              placeholder="How you met, criteria, quirks, etc."
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? 'Saving…' : 'Save Client'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => router.push('/clients')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}



