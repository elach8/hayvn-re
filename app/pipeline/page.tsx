'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RequireAuth from '../components/RequireAuth';

type AgentRole = 'broker' | 'agent' | 'assistant' | 'admin';

type Agent = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AgentRole | null;
  brokerage_id: string | null;
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

type PageState = {
  loading: boolean;
  error: string | null;
  agent: Agent | null;
  properties: Property[];
};

type ViewMode = 'mine' | 'brokerage';

type Stage = { id: string; label: string };

const STAGES: Stage[] = [
  { id: 'prospect',        label: 'Prospect' },
  { id: 'active_listing',  label: 'Active listing' },
  { id: 'offer_in',        label: 'Offer in' },
  { id: 'under_contract',  label: 'Under contract' },
  { id: 'closed',          label: 'Closed' },
];

function PipelineInner() {
  const [state, setState] = useState<PageState>({
    loading: true,
    error: null,
    agent: null,
    properties: [],
  });
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [reloading, setReloading] = useState(false);

  // drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const loadData = async (mode: ViewMode, existingAgent?: Agent | null) => {
    try {
      setReloading(true);

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
          properties: [],
        });
        setReloading(false);
        return;
      }

      const user = session.user;

      // Load or reuse agent
      let agent = existingAgent ?? null;
      if (!agent) {
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
            properties: [],
          });
          setReloading(false);
          return;
        }
        agent = agentRow as Agent;
      }

      let props: Property[] = [];

      if (mode === 'mine') {
        const { data, error: propsError } = await supabase
          .from('properties')
          .select('*')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false });

        if (propsError) throw propsError;
        props = (data || []) as Property[];
      } else {
        if (agent.role === 'broker' && agent.brokerage_id) {
          const { data, error: propsError } = await supabase
            .from('properties')
            .select('*')
            .eq('brokerage_id', agent.brokerage_id)
            .order('created_at', { ascending: false });

          if (propsError) throw propsError;
          props = (data || []) as Property[];
        } else {
          const { data, error: propsError } = await supabase
            .from('properties')
            .select('*')
            .eq('agent_id', agent.id)
            .order('created_at', { ascending: false });

          if (propsError) throw propsError;
          props = (data || []) as Property[];
        }
      }

      setState({
        loading: false,
        error: null,
        agent,
        properties: props,
      });
      setReloading(false);
    } catch (err: any) {
      console.error('Pipeline load error:', err);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message ?? 'Failed to load pipeline',
      }));
      setReloading(false);
    }
  };

  useEffect(() => {
    // initial load
    loadData('mine');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { loading, error, agent, properties } = state;

  const handleChangeView = async (mode: ViewMode) => {
    setViewMode(mode);
    await loadData(mode, agent);
  };

  // Group properties by pipeline_stage
  const grouped = STAGES.map((stage) => ({
    ...stage,
    items: properties.filter(
      (p) => (p.pipeline_stage || 'prospect') === stage.id,
    ),
  }));

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
      const { error } = await supabase
        .from('properties')
        .update({ pipeline_stage: stageId })
        .eq('id', draggingId);

      if (error) {
        console.error('Failed to update pipeline_stage:', error);
        // If update fails, reload from server
        await loadData(viewMode, agent);
      }
    } catch (err) {
      console.error('Drop update error:', err);
      await loadData(viewMode, agent);
    }
  };

  if (loading && !agent) {
    return (
      <main className="p-6">
        <div className="text-sm text-gray-500">Loading pipeline…</div>
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

  const isBroker = agent.role === 'broker';

  return (
    <main className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-gray-500">
          {agent.full_name || agent.email} • {agent.role}
        </p>

        <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 text-xs">
          <button
            type="button"
            onClick={() => handleChangeView('mine')}
            className={
              'px-3 py-1 rounded-full ' +
              (viewMode === 'mine'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-50')
            }
          >
            My pipeline
          </button>
          {isBroker && agent.brokerage_id && (
            <button
              type="button"
              onClick={() => handleChangeView('brokerage')}
              className={
                'px-3 py-1 rounded-full ' +
                (viewMode === 'brokerage'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50')
              }
            >
              Brokerage
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 mt-1">
            {error}
          </p>
        )}
        {reloading && (
          <p className="text-xs text-gray-400 mt-1">Refreshing…</p>
        )}
      </header>

      {/* Kanban columns */}
      <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {grouped.map((col) => {
          const isActiveDrop = dragOverStage === col.id;

          return (
            <div
              key={col.id}
              className={
                'flex flex-col rounded-xl border bg-white min-h-[200px] max-h-[480px] transition-colors ' +
                (isActiveDrop
                  ? 'border-indigo-400 ring-1 ring-indigo-200'
                  : 'border-gray-200')
              }
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(col.id);
              }}
              onDragLeave={(e) => {
                // only clear if leaving the column container, not child
                if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                  return;
                }
                setDragOverStage((prev) => (prev === col.id ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnStage(col.id);
              }}
            >
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-gray-700">
                  {col.label}
                </div>
                <div className="text-[11px] text-gray-400">
                  {col.items.length}
                </div>
              </div>

              {col.items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center px-3 py-4">
                  <p className="text-xs text-gray-400 text-center">
                    {draggingId && dragOverStage === col.id
                      ? 'Release to move here'
                      : 'No properties in this stage.'}
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
    </main>
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

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={
        'rounded-lg border bg-gray-50 px-3 py-2 text-xs space-y-1 cursor-move transition-shadow ' +
        (dragging
          ? 'border-indigo-400 shadow-md opacity-80'
          : 'border-gray-200 hover:shadow-sm')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-gray-800 line-clamp-2">
          {property.address || 'Unnamed property'}
        </div>
        <div className="text-[10px] text-gray-400 whitespace-nowrap">
          {created.toLocaleDateString()}
        </div>
      </div>

      <div className="text-[11px] text-gray-500 flex flex-wrap gap-2">
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
        {property.sqft !== null && (
          <span>{property.sqft.toLocaleString()} sqft</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        {property.status && (
          <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600">
            {property.status.replace('_', ' ')}
          </span>
        )}
        {property.mls_id && (
          <span className="text-[10px] text-gray-400">
            MLS: {property.mls_id}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <RequireAuth>
      <PipelineInner />
    </RequireAuth>
  );
}


