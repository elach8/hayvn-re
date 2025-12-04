// /app/analytics/page.tsx (or wherever it lives)
export default function AnalyticsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          Analytics
        </h1>
        <p className="text-sm text-slate-300 max-w-xl">
          Higher-level analytics on listings, matches, and agent activity.
        </p>
      </header>

      {/* Placeholder copy for future build-out */}
      <section className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-sm text-slate-200">
          Future modules will help you understand:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300 list-disc list-inside">
          <li>Which searches generate the best matches.</li>
          <li>Which clients are under-served or going cold.</li>
          <li>Where deals are getting stuck in your pipeline.</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          As more data flows through Hayvn-RE, this page will surface
          simple, opinionated insights instead of overwhelming dashboards.
        </p>
      </section>
    </div>
  );
}

