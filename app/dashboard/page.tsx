'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';
import { Card } from '../components/Card';

type AgentRole = 'broker' | 'agent' | 'assistant' | 'admin';

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AgentRole;
  brokerage_id: string | null;
  onboarding_completed: boolean;
};

type DashboardState = {
  loading: boolean;
  error: string | null;
  agent: Agent | null;
  metrics: {
    myActiveClients: number;
    myActiveSellers: number;
    myActiveBuyers: number;
    myPendingOffers: number;
    myToursToday: number;
    brokerageActiveClients: number;
    brokerageToursThisWeek: number;
    brokeragePendingOffers: number;
    brokerageUnderContract: number;
  };
};

const EMPTY_METRICS = {
  myActiveClients: 0,
  myActiveSellers: 0,
  myActiveBuyers: 0,
  myPendingOffers: 0,
  myToursToday: 0,
  brokerageActiveClients: 0,
  brokerageToursThisWeek: 0,
  brokeragePendingOffers: 0,
  brokerageUnderContract: 0,
};

// ---------- date helpers ----------

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function startOfThisWeek() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---------- bootstrap agent (no brokerage decisions here) ----------

async function ensureAgentRecord(user: any): Promise<Agent> {
  const { data: existing, error: existingError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as Agent;

  const fullName =
    (user.user_metadata && user.user_metadata.full_name) ||
    user.email ||
    'Agent';

  const { data: newAgent, error: agentError } = await supabase
    .from('agents')
    .insert({
      id: user.id,
      full_name: fullName,
      email: user.email,
      role: 'agent',
      brokerage_id: null,
      onboarding_completed: false,
    })
    .select()
    .single();

  if (agentError) throw agentError;

  return newAgent as Agent;
}

// ---------- metrics loaders ----------

// Clients: per-agent + per-brokerage
async function loadClientMetrics(agent: Agent) {
  const metricsPart = {
    myActiveClients: 0,
    myActiveSellers: 0,
    myActiveBuyers: 0,
    brokerageActiveClients: 0,
  };

  // My active clients (stage = 'active')
  {
    const { count, error } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('stage', 'active'); // TODO: adjust to your stage values

    if (error) throw error;
    metricsPart.myActiveClients = count ?? 0;
  }

  // My active buyers
  {
    const { count, error } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('stage', 'active')
      .eq('client_type', 'buyer'); // TODO: adjust if your values differ

    if (error) throw error;
    metricsPart.myActiveBuyers = count ?? 0;
  }

  // My active sellers
  {
    const { count, error } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('stage', 'active')
      .eq('client_type', 'seller'); // TODO: adjust as needed

    if (error) throw error;
    metricsPart.myActiveSellers = count ?? 0;
  }

  // Brokerage active clients (broker view only)
  if (agent.role === 'broker' && agent.brokerage_id) {
    const { count, error } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('brokerage_id', agent.brokerage_id)
      .eq('stage', 'active');

    if (error) throw error;
    metricsPart.brokerageActiveClients = count ?? 0;
  }

  return metricsPart;
}

// Tours: my tours today + brokerage tours this week
async function loadTourMetrics(agent: Agent) {
  const metricsPart = {
    myToursToday: 0,
    brokerageToursThisWeek: 0,
  };

  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const weekStart = startOfThisWeek();

  // My tours today
  {
    const { count, error } = await supabase
      .from('tours')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .gte('start_time', todayStart)
      .lte('start_time', todayEnd)
      .neq('status', 'cancelled'); // TODO: adjust status logic

    if (error) throw error;
    metricsPart.myToursToday = count ?? 0;
  }

  // Brokerage tours this week
  if (agent.role === 'broker' && agent.brokerage_id) {
    const { count, error } = await supabase
      .from('tours')
      .select('id', { count: 'exact', head: true })
      .eq('brokerage_id', agent.brokerage_id)
      .gte('start_time', weekStart)
      .neq('status', 'cancelled'); // TODO: adjust as needed

    if (error) throw error;
    metricsPart.brokerageToursThisWeek = count ?? 0;
  }

  return metricsPart;
}

// Offers: my pending offers + brokerage pending offers
async function loadOfferMetrics(agent: Agent) {
  const metricsPart = {
    myPendingOffers: 0,
    brokeragePendingOffers: 0,
  };

  const pendingStatuses = ['submitted', 'counter', 'pending']; // keep in sync with Offers page

  // My pending offers (per-agent)
  {
    const { count, error } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .in('status', pendingStatuses);

    if (error) throw error;
    metricsPart.myPendingOffers = count ?? 0;
  }

  // Brokerage pending offers (for broker overview)
  if (agent.role === 'broker' && agent.brokerage_id) {
    const { count, error } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('brokerage_id', agent.brokerage_id)
      .in('status', pendingStatuses);

    if (error) throw error;
    metricsPart.brokeragePendingOffers = count ?? 0;
  }

  return metricsPart;
}

// Properties: brokerage under-contract inventory
async function loadPropertyMetrics(agent: Agent) {
  const metricsPart = {
    brokerageUnderContract: 0,
  };

  if (agent.role === 'broker' && agent.brokerage_id) {
    const { count, error } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('brokerage_id', agent.brokerage_id)
      .eq('status', 'under_contract'); // TODO: match your real status

    if (error) throw error;
    metricsPart.brokerageUnderContract = count ?? 0;
  }

  return metricsPart;
}

// ---------- default export: wrapped in RequireAuth ----------

export default function Page() {
  return (
    <RequireAuth>
      <DashboardPageInner />
    </RequireAuth>
  );
}

// ---------- inner dashboard component ----------

function DashboardPageInner() {
  const [state, setState] = useState<DashboardState>({
    loading: true,
    error: null,
    agent: null,
    metrics: { ...EMPTY_METRICS },
  });
  const router = useRouter();

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
            metrics: { ...EMPTY_METRICS },
          });
          return;
        }

        const user = session.user;

        // Ensure agent row exists
        const agent = await ensureAgentRecord(user);

        // If onboarding not completed, send to onboarding page
        if (!agent.onboarding_completed) {
          router.push('/onboarding');
          return;
        }

        // Load metrics in parallel
        const [clientMetrics, tourMetrics, offerMetrics, propertyMetrics] =
          await Promise.all([
            loadClientMetrics(agent),
            loadTourMetrics(agent),
            loadOfferMetrics(agent),
            loadPropertyMetrics(agent),
          ]);

        const combinedMetrics = {
          ...EMPTY_METRICS,
          ...clientMetrics,
          ...tourMetrics,
          ...offerMetrics,
          ...propertyMetrics,
        };

        setState({
          loading: false,
          error: null,
          agent: agent as Agent,
          metrics: combinedMetrics,
        });
      } catch (err: any) {
        console.error('Dashboard error:', err);
        setState({
          loading: false,
          error: err?.message ?? 'Failed to load dashboard',
          agent: null,
          metrics: { ...EMPTY_METRICS },
        });
      }
    };

    run();
  }, [router]);

  const { loading, error, agent, metrics } = state;

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="text-sm text-slate-300">Loading dashboard…</div>
        </Card>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="text-sm text-red-300">
            {error || 'Unable to load agent'}
          </div>
        </Card>
      </div>
    );
  }

  const isBroker = agent.role === 'broker';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          {isBroker ? 'Brokerage Dashboard' : 'My Dashboard'}
        </h1>
        <p className="text-sm text-slate-300 flex flex-wrap items-center gap-2">
          <span>{agent.full_name || agent.email}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300 border border-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {agent.role}
          </span>
        </p>
      </header>

      {/* Agent-level metrics */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
            My Pipeline
          </h2>
          <p className="text-[11px] text-slate-400">
            Snapshot of your active business
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashCard label="Active clients" value={metrics.myActiveClients} />
          <DashCard label="Active buyers" value={metrics.myActiveBuyers} />
          <DashCard label="Active sellers" value={metrics.myActiveSellers} />
          <DashCard label="Pending offers" value={metrics.myPendingOffers} />
        </div>
      </Card>

      {/* Today section */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
            Today
          </h2>
          <p className="text-[11px] text-slate-400">
            What matters for the next 24 hours
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DashCard label="Tours today" value={metrics.myToursToday} />
        </div>
      </Card>

      {/* Broker-only section */}
      {isBroker && agent.brokerage_id && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
              Brokerage Overview
            </h2>
            <p className="text-[11px] text-slate-400">
              High-level view across your team
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DashCard
              label="Active clients (brokerage)"
              value={metrics.brokerageActiveClients}
            />
            <DashCard
              label="Tours this week"
              value={metrics.brokerageToursThisWeek}
            />
            <DashCard
              label="Pending offers"
              value={metrics.brokeragePendingOffers}
            />
            <DashCard
              label="Under contract"
              value={metrics.brokerageUnderContract}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

// Simple stat card (styled to match Modern Luxury theme)
function DashCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-3 sm:px-4 sm:py-4 flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-2xl font-semibold text-white">{value}</span>
    </div>
  );
}




