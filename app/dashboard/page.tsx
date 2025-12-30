// app/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
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

type Property = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  list_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  status: string | null;
  pipeline_stage: string | null;
  mls_id: string | null;
  created_at: string;
  agent_id: string | null;
};

type Tour = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  agent_id: string | null;
  brokerage_id: string | null;

  // optional fields (rendered defensively)
  title?: string | null;
  tour_type?: string | null;
  type?: string | null;
  kind?: string | null;
  property_id?: string | null;
  address?: string | null;
  notes?: string | null;
};

type ViewMode = 'mine' | 'brokerage';

type Stage = { id: string; label: string };

const STAGES: Stage[] = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'active_listing', label: 'Active listing' },
  { id: 'offer_in', label: 'Offer in' },
  { id: 'under_contract', label: 'Under contract' },
  { id: 'closed', label: 'Closed' },
];

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
  properties: Property[];
  tours: Tour[];
  viewMode: ViewMode;
  reloading: boolean;
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

function startOfTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfNDaysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
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

// ---------- pipeline + tours loaders ----------

async function loadPipelineProperties(agent: Agent, mode: ViewMode) {
  if (mode === 'mine') {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Property[];
  }

  // brokerage mode (broker only), otherwise fall back to mine
  if (agent.role === 'broker' && agent.brokerage_id) {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('brokerage_id', agent.brokerage_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Property[];
  }

  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Property[];
}

async function loadToursTodayAndUpcoming(agent: Agent) {
  const todayStart = startOfToday();
  const end7d = endOfNDaysFromNow(7);

  // We keep this intentionally simple: My obligations only
  const { data, error } = await supabase
    .from('tours')
    .select('*')
    .eq('agent_id', agent.id)
    .gte('start_time', todayStart)
    .lte('start_time', end7d)
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data || []) as Tour[];
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
    properties: [],
    tours: [],
    viewMode: 'mine',
    reloading: false,
  });

  // drag state (pipeline)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const router = useRouter();

  const reloadAll = async (nextViewMode?: ViewMode) => {
    try {
      setState((prev) => ({ ...prev, reloading: true, error: null }));

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
          properties: [],
          tours: [],
          viewMode: 'mine',
          reloading: false,
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

      const viewMode = nextViewMode ?? state.viewMode;

      // Load everything in parallel
      const [
        clientMetrics,
        tourMetrics,
        offerMetrics,
        propertyMetrics,
        props,
        tours,
      ] = await Promise.all([
        loadClientMetrics(agent),
        loadTourMetrics(agent),
        loadOfferMetrics(agent),
        loadPropertyMetrics(agent),
        loadPipelineProperties(agent, viewMode),
        loadToursTodayAndUpcoming(agent),
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
        properties: props,
        tours: tours,
        viewMode,
        reloading: false,
      });
    } catch (err: any) {
      console.error('Dashboard error:', err);
      setState((prev) => ({
        ...prev,
        loading: false,
        reloading: false,
        error: err?.message ?? 'Failed to load dashboard',
      }));
    }
  };

  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { loading, error, agent, metrics, properties, tours, viewMode, reloading } =
    state;

  const isBroker = agent?.role === 'broker';

  // Group properties by pipeline_stage
  const grouped = useMemo(() => {
    return STAGES.map((stage) => ({
      ...stage,
      items: properties.filter(
        (p) => (p.pipeline_stage || 'prospect') === stage.id,
      ),
    }));
  }, [properties]);

  // Tours split: today vs upcoming (tomorrow+)
  const todayStart = useMemo(() => startOfToday(), []);
  const todayEnd = useMemo(() => endOfToday(), []);
  const tomorrowStart = useMemo(() => startOfTomorrow(), []);

  const toursToday = useMemo(() => {
    return tours.filter((t) => {
      if (!t.start_time) return false;
      return t.start_time >= todayStart && t.start_time <= todayEnd;
    });
  }, [tours, todayStart, todayEnd]);

  const toursUpcoming = useMemo(() => {
    return tours.filter((t) => {
      if (!t.start_time) return false;
      return t.start_time >= tomorrowStart;
    });
  }, [tours, tomorrowStart]);

  const handleChangePipelineView = async (mode: ViewMode) => {
    setState((prev) => ({ ...prev, viewMode: mode }));
    await reloadAll(mode);
  };

  const handleDropOnStage = async (stageId: string) => {
    if (!draggingId || !agent) return;

    const prevStage =
      properties.find((p) => p.id === draggingId)?.pipeline_stage || 'prospect';

    if (prevStage === stageId) {
      setDraggingId(null);
      setDragOverStage(null);
      return;
    }

    // Optimistic update
    setState((prev) => ({
      ...prev,
      properties: prev.properties.map((p) =>
        p.id === draggingId ? { ...p, pipeline_stage: stageId } : p,
      ),
    }));

    setDraggingId(null);
    setDragOverStage(null);

    try {
      const { error: updateError } = await supabase
        .from('properties')
        .update({ pipeline_stage: stageId })
        .eq('id', draggingId);

      if (updateError) {
        console.error('Failed to update pipeline_stage:', updateError);
        await reloadAll();
      }
    } catch (err) {
      console.error('Drop update error:', err);
      await reloadAll();
    }
  };

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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Dashboard
            </h1>
            <p className="text-sm text-slate-300 flex flex-wrap items-center gap-2">
              <span>{agent.full_name || agent.email}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300 border border-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {agent.role}
              </span>
              {reloading && (
                <span className="text-[11px] text-slate-400">Refreshing…</span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => reloadAll()}
            className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-slate-200 hover:border-white/20 hover:bg-white/5 transition-colors"
          >
            Refresh
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-300 mt-1">{error}</p>
        )}
      </header>

      {/* Listings summary (compact) */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
              My Listings
            </h2>
            <p className="text-[11px] text-slate-400">
              Active business snapshot (clients + offers)
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-slate-300">
            Sell-side pipeline lives below
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashCard label="Active clients" value={metrics.myActiveClients} />
          <DashCard label="Active buyers" value={metrics.myActiveBuyers} />
          <DashCard label="Active sellers" value={metrics.myActiveSellers} />
          <DashCard label="Pending offers" value={metrics.myPendingOffers} />
        </div>
      </Card>

      {/* Listings pipeline board (replaces /pipeline) */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
              Listings Pipeline
            </h2>
            <p className="text-[11px] text-slate-400">
              Sell-side deal flow • drag listings to update stages
            </p>
          </div>

          <div className="inline-flex rounded-full border border-white/10 bg-black/40 p-1 text-xs shadow-sm">
            <button
              type="button"
              onClick={() => handleChangePipelineView('mine')}
              className={
                'px-3 py-1 rounded-full transition-colors ' +
                (viewMode === 'mine'
                  ? 'bg-[#EBD27A] text-slate-900 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-white/5')
              }
            >
              My listings
            </button>
            {isBroker && agent.brokerage_id && (
              <button
                type="button"
                onClick={() => handleChangePipelineView('brokerage')}
                className={
                  'px-3 py-1 rounded-full transition-colors ' +
                  (viewMode === 'brokerage'
                    ? 'bg-[#EBD27A] text-slate-900 font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-white/5')
                }
              >
                Brokerage
              </button>
            )}
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {grouped.map((col) => {
            const isActiveDrop = dragOverStage === col.id;

            return (
              <div
                key={col.id}
                className={
                  'flex flex-col rounded-xl border bg-black/40 min-h-[220px] max-h-[520px] backdrop-blur-sm transition-colors ' +
                  (isActiveDrop
                    ? 'border-indigo-400 ring-1 ring-indigo-400/40'
                    : 'border-white/10')
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(col.id);
                }}
                onDragLeave={(e) => {
                  const current = e.currentTarget as HTMLElement;
                  const related = e.relatedTarget as Node | null;
                  if (related && current.contains(related)) return;
                  setDragOverStage((prev) => (prev === col.id ? null : prev));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnStage(col.id);
                }}
              >
                <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 bg-white/5">
                  <div className="text-[11px] font-semibold text-slate-100 uppercase tracking-wide">
                    {col.label}
                  </div>
                  <div className="text-[11px] text-slate-400">{col.items.length}</div>
                </div>

                {col.items.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center px-3 py-4">
                    <p className="text-xs text-slate-500 text-center">
                      {draggingId && dragOverStage === col.id
                        ? 'Release to move here'
                        : 'No listings in this stage.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                    {col.items.map((p) => (
                      <PipelineCard
                        key={p.id}
                        property={p}
                        dragging={draggingId === p.id}
                        onDragStart={() => {
                          setDraggingId(p.id);
                          setDragOverStage(col.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStage(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </Card>

      {/* Tours/Open Houses: Today + Upcoming (no past) */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
              Tours / Open Houses Today + Upcoming
            </h2>
            <p className="text-[11px] text-slate-400">Today and upcoming only</p>
          </div>
          <div className="text-[11px] text-slate-400">
            Today: {toursToday.length} • Upcoming: {toursUpcoming.length}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-black/25">
            <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <div className="text-[11px] font-semibold text-slate-100 uppercase tracking-wide">
                Today
              </div>
              <div className="text-[11px] text-slate-400">{toursToday.length}</div>
            </div>
            <div className="p-3 space-y-2">
              {toursToday.length === 0 ? (
                <p className="text-xs text-slate-500">No tours/open houses today.</p>
              ) : (
                toursToday.slice(0, 8).map((t) => <TourRow key={t.id} tour={t} />)
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25">
            <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <div className="text-[11px] font-semibold text-slate-100 uppercase tracking-wide">
                Upcoming
              </div>
              <div className="text-[11px] text-slate-400">{toursUpcoming.length}</div>
            </div>
            <div className="p-3 space-y-2">
              {toursUpcoming.length === 0 ? (
                <p className="text-xs text-slate-500">No upcoming tours/open houses.</p>
              ) : (
                toursUpcoming.slice(0, 8).map((t) => <TourRow key={t.id} tour={t} />)
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Broker-only section (kept) */}
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

type PipelineCardProps = {
  property: Property;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
};

function PipelineCard({
  property,
  dragging,
  onDragStart,
  onDragEnd,
}: PipelineCardProps) {
  const created = new Date(property.created_at);

  const formattedDate = Number.isNaN(created.getTime())
    ? ''
    : created.toLocaleDateString();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={
        'rounded-lg border bg-black/60 px-3 py-2 text-xs space-y-1 cursor-move transition-all ' +
        (dragging
          ? 'border-indigo-400 shadow-md opacity-80'
          : 'border-white/10 hover:border-white/30 hover:shadow-sm')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-slate-100 line-clamp-2">
          {property.address || 'Unnamed property'}
        </div>
        {formattedDate && (
          <div className="text-[10px] text-slate-500 whitespace-nowrap">
            {formattedDate}
          </div>
        )}
      </div>

      <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5">
        {property.city && property.state && (
          <span>
            {property.city}, {property.state}
          </span>
        )}
        {property.list_price !== null && (
          <span>${property.list_price.toLocaleString()}</span>
        )}
        {property.beds !== null && <span>{property.beds} bd</span>}
        {property.baths !== null && <span>{property.baths} ba</span>}
        {property.sqft !== null && <span>{property.sqft.toLocaleString()} sqft</span>}
      </div>

      <div className="flex items-center justify-between mt-1">
        {property.status && (
          <span className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-slate-200">
            {property.status.replace('_', ' ')}
          </span>
        )}
        {property.mls_id && (
          <span className="text-[10px] text-slate-500">MLS: {property.mls_id}</span>
        )}
      </div>
    </div>
  );
}

function TourRow({ tour }: { tour: Tour }) {
  const start = tour.start_time ? new Date(tour.start_time) : null;
  const end = tour.end_time ? new Date(tour.end_time) : null;

  const timeText = start
    ? start.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'TBD';

  const typeRaw = (tour.tour_type ?? tour.type ?? tour.kind ?? '').toString();
  const isOpenHouse =
    typeRaw.toLowerCase() === 'open_house' ||
    typeRaw.toLowerCase() === 'openhouse' ||
    typeRaw.toLowerCase() === 'open house';

  const label = isOpenHouse ? 'Open House' : 'Tour';

  const secondary =
    tour.title ||
    tour.address ||
    (tour.property_id ? `Property: ${tour.property_id}` : null);

  const duration =
    start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
      ? `${Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))}m`
      : null;

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-slate-200">
              {label}
            </span>
            {tour.status && (
              <span className="text-[10px] text-slate-500">
                {tour.status.replace('_', ' ')}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-200 mt-1">{secondary || 'Scheduled'}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {timeText}
            {duration ? ` • ${duration}` : ''}
          </div>
        </div>

        <div className="text-[10px] text-slate-500 whitespace-nowrap">
          {tour.id.slice(0, 6)}
        </div>
      </div>
    </div>
  );
}


