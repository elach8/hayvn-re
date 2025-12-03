'use client';

import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  brokerage_id: string | null;
};

type Offer = {
  id: string;
  side: string | null;            // 'buy' | 'sell' etc.
  offer_price: number | null;
  earnest_money: number | null;
  down_payment: number | null;
  financing_type: string | null;
  status: string | null;
  status_reason: string | null;
  expiration: string | null;      // timestamp
  close_date: string | null;      // date
  contingencies: string | null;
  notes: string | null;
  client_id: string | null;
  property_id: string | null;
  brokerage_id: string | null;
  agent_id: string | null;
  created_at: string;
};

type PageState = {
  loading: boolean;
  error: string | null;
  agent: Agent | null;
  offers: Offer[];
};

const PENDING_STATUSES = ['submitted', 'counter', 'pending'];

function OffersInner() {
  const [state, setState] = useState<PageState>({
    loading: true,
    error: null,
    agent: null,
    offers: [],
  });

  // form state
  const [side, setSide] = useState<'buy' | 'sell' | ''>('');
  const [offerPrice, setOfferPrice] = useState('');
  const [earnestMoney, setEarnestMoney] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [status, setStatus] = useState<string>('submitted');
  const [financingType, setFinancingType] = useState('');
  const [expiration, setExpiration] = useState(''); // datetime-local
  const [closeDate, setCloseDate] = useState('');   // date
  const [contingencies, setContingencies] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session) {
          setState({
            loading: false,
            error: 'Not signed in',
            agent: null,
            offers: [],
          });
          return;
        }

        const user = session.user;

        // Load agent
        const { data: agentRow, error: agentError } = await supabase
          .from('agents')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (agentError) throw agentError;
        if (!agentRow) {
          setState({
            loading: false,
            error: 'No agent record found for this user.',
            agent: null,
            offers: [],
          });
          return;
        }

        const agent = agentRow as Agent;

        // Load this agent's offers
        const { data: offers, error: offersError } = await supabase
          .from('offers')
          .select('*')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false });

        if (offersError) throw offersError;

        setState({
          loading: false,
          error: null,
          agent,
          offers: (offers || []) as Offer[],
        });
      } catch (err: any) {
        console.error('Offers page error:', err);
        setState({
          loading: false,
          error: err?.message ?? 'Failed to load offers',
          agent: null,
          offers: [],
        });
      }
    };

    run();
  }, []);

  const { loading, error, agent, offers } = state;

  const handleCreateOffer = async (e: FormEvent) => {
    e.preventDefault();
    if (!agent) return;

    setFormError(null);

    if (!side) {
      setFormError('Select buy or sell side.');
      return;
    }
    if (!offerPrice) {
      setFormError('Offer price is required.');
      return;
    }

    setSaving(true);

    try {
      const offerPriceNum = Number(offerPrice.replace(/,/g, ''));
      const earnestNum = earnestMoney
        ? Number(earnestMoney.replace(/,/g, ''))
        : null;
      const downPaymentNum = downPayment
        ? Number(downPayment.replace(/,/g, ''))
        : null;

      if (Number.isNaN(offerPriceNum)) {
        throw new Error('Offer price must be a number.');
      }

      let expirationIso: string | null = null;
      if (expiration) {
        const expDate = new Date(expiration);
        if (isNaN(expDate.getTime())) {
          throw new Error('Invalid expiration datetime.');
        }
        expirationIso = expDate.toISOString();
      }

      let closeDateVal: string | null = null;
      if (closeDate) {
        // date string is fine for a date column in Postgres
        closeDateVal = closeDate;
      }

      const { data, error: insertError } = await supabase
        .from('offers')
        .insert({
          side,
          offer_price: offerPriceNum,
          earnest_money: earnestNum,
          down_payment: downPaymentNum,
          financing_type: financingType.trim() || null,
          status: status || 'submitted',
          status_reason: null,
          expiration: expirationIso,
          close_date: closeDateVal,
          contingencies: contingencies.trim() || null,
          notes: notes.trim() || null,
          agent_id: agent.id,              // 🔑 per-agent ownership
          brokerage_id: agent.brokerage_id // 🔑 per-brokerage ownership
          // client_id / property_id can be wired later when we add selectors
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setState((prev) => ({
        ...prev,
        offers: [data as Offer, ...prev.offers],
      }));

      // reset form
      setSide('');
      setOfferPrice('');
      setEarnestMoney('');
      setDownPayment('');
      setStatus('submitted');
      setFinancingType('');
      setExpiration('');
      setCloseDate('');
      setContingencies('');
      setNotes('');
      setFormError(null);
    } catch (err: any) {
      console.error('Create offer error:', err);
      setFormError(err?.message ?? 'Failed to create offer');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="p-6">
        <div className="text-sm text-gray-500">Loading offers…</div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="p-6">
        <div className="text-sm text-red-600">
          {error || 'Unable to load agent.'}
        </div>
      </main>
    );
  }

  const pendingCount = offers.filter((o) =>
    o.status ? PENDING_STATUSES.includes(o.status) : false,
  ).length;

  return (
    <main className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Offers</h1>
        <p className="text-sm text-gray-500">
          {agent.full_name || agent.email} • {agent.role}
        </p>
        <p className="text-xs text-gray-500">
          Pending offers (submitted / counter / pending):{' '}
          <span className="font-semibold">{pendingCount}</span>
        </p>
      </header>

      {/* Create offer form */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-medium text-gray-800">
          Create a new offer
        </h2>

        <form
          onSubmit={handleCreateOffer}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
        >
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Side *
            </label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select side</option>
              <option value="buy">Buy side</option>
              <option value="sell">List side</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Offer price *
            </label>
            <input
              type="number"
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g. 750000"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Earnest money
            </label>
            <input
              type="number"
              value={earnestMoney}
              onChange={(e) => setEarnestMoney(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g. 20000"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Down payment
            </label>
            <input
              type="number"
              value={downPayment}
              onChange={(e) => setDownPayment(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g. 150000"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Financing type
            </label>
            <select
              value={financingType}
              onChange={(e) => setFinancingType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select type</option>
              <option value="cash">Cash</option>
              <option value="conventional">Conventional</option>
              <option value="fha">FHA</option>
              <option value="va">VA</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="counter">Counter</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Expiration
            </label>
            <input
              type="datetime-local"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Close date
            </label>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Contingencies
            </label>
            <textarea
              value={contingencies}
              onChange={(e) => setContingencies(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              placeholder="Inspection, loan, appraisal, etc."
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
              placeholder="Additional details about this offer…"
            />
          </div>

          {formError && (
            <div className="md:col-span-2 text-xs text-red-600">
              {formError}
            </div>
          )}

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Create offer'}
            </button>
          </div>
        </form>
      </section>

      {/* Offers list */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-medium text-gray-800">My offers</h2>

        {offers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No offers yet. Add one using the form above.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {offers.map((o) => {
              const created = new Date(o.created_at);
              const exp = o.expiration ? new Date(o.expiration) : null;

              return (
                <div key={o.id} className="py-3 flex flex-col gap-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">
                      {o.side ? (o.side === 'buy' ? 'Buy side' : 'List side') : 'Offer'}
                      {o.status && (
                        <span className="ml-2 text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 capitalize">
                          {o.status}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {created.toLocaleDateString()}
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 flex flex-wrap gap-3">
                    {o.offer_price !== null && (
                      <span>
                        Offer:{' '}
                        <span className="font-semibold">
                          ${o.offer_price.toLocaleString()}
                        </span>
                      </span>
                    )}
                    {o.earnest_money !== null && (
                      <span>Earnest: ${o.earnest_money.toLocaleString()}</span>
                    )}
                    {o.down_payment !== null && (
                      <span>Down: ${o.down_payment.toLocaleString()}</span>
                    )}
                    {o.financing_type && (
                      <span>Financing: {o.financing_type}</span>
                    )}
                    {o.close_date && <span>Close: {o.close_date}</span>}
                    {exp && (
                      <span>
                        Expires:{' '}
                        {exp.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  {o.contingencies && (
                    <div className="text-xs text-gray-500 line-clamp-2">
                      Contingencies: {o.contingencies}
                    </div>
                  )}
                  {o.notes && (
                    <div className="text-xs text-gray-500 line-clamp-2">
                      Notes: {o.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default function OffersPage() {
  return (
    <RequireAuth>
      <OffersInner />
    </RequireAuth>
  );
}

