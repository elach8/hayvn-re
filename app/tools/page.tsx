'use client';

import Link from 'next/link';

type ToolStatus = 'now' | 'soon' | 'future';

type Tool = {
  id: string;
  name: string;
  tag: string;
  status: ToolStatus;
  href?: string; // only for tools that actually exist
  short: string;
  bullets: string[];
};

const TOOLS: Tool[] = [
  {
    id: 'listing-readiness',
    name: 'Listing Readiness Score',
    tag: 'In progress',
    status: 'now',
    href: '/tools/listing-readiness',
    short: 'Score how ready a listing is across condition, presentation, and seller logistics.',
    bullets: [
      'Simple checklist-style inputs for you or your assistant',
      'Weighted score across condition, marketing assets, and timing',
      'Exportable summary to share with sellers'
    ],
  },
  {
    id: 'pricing-strategy',
    name: 'AI Comps & Pricing Strategy',
    tag: 'Coming soon',
    status: 'soon',
    short: 'AI-assisted comps and pricing narratives, tuned to your market.',
    bullets: [
      'Blend MLS data with micro-market trends',
      'Generate pricing ranges with confidence bands',
      'Auto-draft seller-friendly pricing explanations'
    ],
  },
  {
    id: 'neighborhood-analytics',
    name: 'Neighborhood Market Analytics',
    tag: 'Coming soon',
    status: 'soon',
    short: 'Neighborhood-level stats that feel like a story, not a spreadsheet.',
    bullets: [
      'Inventory, absorption, and days-on-market trends',
      'Side-by-side neighborhood comparisons for buyers',
      'Seller-ready market “snapshot” one-pagers'
    ],
  },
  {
    id: 'offer-assistant',
    name: 'Automated Offer-Writing Suggestions',
    tag: 'Future',
    status: 'future',
    short: 'Offer structure coaching based on listing history and market conditions.',
    bullets: [
      'Suggest price, terms, and contingencies',
      'Highlight leverage points on both sides',
      'Draft explanation you can tweak before sending'
    ],
  },
  {
    id: 'search-recommendations',
    name: 'Personal Property Search Recommendations',
    tag: 'Future',
    status: 'future',
    short: '“Spotify Discover” for homes, tuned to each client’s behavior and feedback.',
    bullets: [
      'Learn from saved homes, tours, and notes',
      'Surface “you might like” listings automatically',
      'Explain why a home is recommended in plain language'
    ],
  },
  {
    id: 'agent-copilot',
    name: 'In-App AI Agent Co-Pilot',
    tag: 'Future',
    status: 'future',
    short: 'Context-aware assistant inside Hayvn-RE that understands your pipeline.',
    bullets: [
      'Ask questions about your clients, tours, and offers',
      'Draft emails, texts, and talking points from your data',
      'Prioritize what to work on each day'
    ],
  },
  {
    id: 'seller-market-pulse',
    name: 'Seller Dashboard & Live “Market Pulse”',
    tag: 'Future',
    status: 'future',
    short: 'Let sellers see activity, feedback, and market signals without bugging you.',
    bullets: [
      'Showings, tours, and feedback in one view',
      'Market movement around their price band',
      'Simple, visual “pulse” indicator of momentum'
    ],
  },
  {
    id: 'agent-analytics',
    name: 'Agent Productivity Analytics',
    tag: 'Future',
    status: 'future',
    short: 'See which activities actually move deals forward in your own business.',
    bullets: [
      'Track conversion from lead → client → closing',
      'Spot bottlenecks in tours and offers',
      'Compare effort vs. results across channels'
    ],
  },
];

function statusStyles(status: ToolStatus) {
  switch (status) {
    case 'now':
      return 'border-[#EBD27A] bg-[#EBD27A]/10';
    case 'soon':
      return 'border-sky-400/70 bg-sky-400/10';
    case 'future':
    default:
      return 'border-slate-500/60 bg-slate-500/10';
  }
}

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-500">
            Hayvn-RE
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50">
            Tools & Insights
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl">
            This is your lab of unfair advantages: analytics, AI workflows, and
            coaching tools that sit on top of your MLS data and Hayvn-RE
            pipelines.
          </p>
          <p className="text-xs text-slate-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-[#EBD27A] mr-1" />
            <span className="font-medium text-slate-200">
              Listing Readiness Score
            </span>{' '}
            is the first feature we&apos;re bringing online here.
          </p>
        </header>

        {/* Info banner */}
        <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="max-w-xl">
            Most competitor products stop at &quot;nice portals&quot; and basic
            search. Hayvn-RE Tools are designed to sit on top of that — helping
            you make better decisions, communicate more clearly, and win more
            listings.
          </p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#EBD27A]/70 bg-[#EBD27A]/10 px-2 py-0.5 text-[#EBD27A]">
              ● Agent-first design
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/80 bg-slate-900/80 px-2 py-0.5 text-slate-300">
              ● MLS-aware AI (future)
            </span>
          </div>
        </section>

        {/* Tools grid */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>Explore what&apos;s live now and what&apos;s coming next.</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => {
              const card = (
                <div
                  key={tool.id}
                  className="h-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 flex flex-col justify-between hover:border-[#EBD27A]/60 hover:bg-black/60 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#EBD27A]" />
                        {tool.tag}
                      </div>
                      <span
                        className={
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ' +
                          statusStyles(tool.status)
                        }
                      >
                        {tool.status === 'now'
                          ? 'Prototype'
                          : tool.status === 'soon'
                          ? 'Planned'
                          : 'Concept'}
                      </span>
                    </div>

                    <h2 className="text-sm font-semibold text-slate-50">
                      {tool.name}
                    </h2>
                    <p className="text-xs text-slate-300">{tool.short}</p>

                    <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                      {tool.bullets.map((b, idx) => (
                        <li key={idx} className="flex gap-1.5">
                          <span className="mt-[3px] h-1 w-1 rounded-full bg-slate-500 shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
                    {tool.href ? (
                      <>
                        <span className="text-slate-400">
                          Open the current prototype.
                        </span>
                        <Link
                          href={tool.href}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#EBD27A] bg-[#EBD27A] px-3 py-1 text-[11px] font-medium text-black hover:bg-[#f3e497]"
                        >
                          Open tool
                          <span aria-hidden>↗</span>
                        </Link>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-500">
                          This module is on the roadmap.
                        </span>
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-black/40 px-3 py-1 text-[11px] text-slate-400 opacity-70 cursor-not-allowed"
                        >
                          Coming soon
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );

              return card;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
