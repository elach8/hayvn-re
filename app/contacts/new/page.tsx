'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function NewContactPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [role, setRole] = useState('agent');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from('contacts').insert([
      {
        name: name.trim(),
        role: role.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      },
    ]);

    if (error) {
      console.error('Error inserting contact:', error);
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push('/contacts');
  };

  return (
    <main className="min-h-screen p-6 max-w-xl mx-auto">
      <header className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold">Add Contact</h1>
          <p className="text-sm text-gray-600">
            Save an agent, owner, lender, or other contact.
          </p>
        </div>

        <Link
          href="/contacts"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to Contacts
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
          <label className="block text-sm font-medium mb-1">
            Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Jane Smith"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="agent">Agent</option>
            <option value="owner">Owner</option>
            <option value="lender">Lender</option>
            <option value="broker">Broker</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Internal Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            rows={3}
            placeholder="How you know them, specialties, etc."
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Contact'}
        </button>
      </form>
    </main>
  );
}
