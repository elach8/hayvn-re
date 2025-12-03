'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Contact = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, role, phone, email')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading contacts:', error);
        setError(error.message);
      } else {
        setContacts(data || []);
      }

      setLoading(false);
    };

    load();
  }, []);

  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-gray-600">
            Agents, owners, lenders, and other people tied to your deals.
          </p>
        </div>

        <Link
          href="/contacts/new"
          className="inline-flex items-center px-3 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800"
        >
          + Add Contact
        </Link>
      </header>

      {loading && <p>Loading contacts…</p>}

      {error && (
        <p className="text-red-600 mb-4">
          Error loading contacts: {error}
        </p>
      )}

      {!loading && !error && contacts.length === 0 && (
        <p>No contacts yet. Use “Add Contact” to create one.</p>
      )}

      {!loading && !error && contacts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Name</th>
                <th className="border px-2 py-1 text-left">Role</th>
                <th className="border px-2 py-1 text-left">Phone</th>
                <th className="border px-2 py-1 text-left">Email</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">{c.name}</td>
                  <td className="border px-2 py-1">
                    {c.role || '-'}
                  </td>
                  <td className="border px-2 py-1">
                    {c.phone || '-'}
                  </td>
                  <td className="border px-2 py-1">
                    {c.email || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
