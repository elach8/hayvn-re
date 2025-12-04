// /app/page.tsx
import Link from 'next/link';
import { Card } from '@/app/components/Card';
import { Button } from '@/app/components/Button';

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Top Label / Tagline */}
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Hayvn-RE · Private Beta
      </div>

      {/* Hero Card */}
      <Card className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            A modern command center for your real estate business.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl">
            Track clients, tours, offers, messages, and everything else in one place.
            Built for agents who run their business on their phone, not inside a 2004 MLS interface.
          </p>
        </header>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Link href="/dashboard">
            <Button className="w-full sm:w-auto">
              Open Dashboard
            </Button>
          </Link>

          <Link href="/sign-in">
            <Button variant="secondary" className="w-full sm:w-auto">
              Agent Sign In
            </Button>
          </Link>

          <Link href="/portal/sign-in">
            <Button variant="ghost" className="w-full sm:w-auto justify-start sm:justify-center">
              Client Portal
            </Button>
          </Link>
        </div>

        {/* Footer Line */}
        <div className="pt-2 text-[11px] text-slate-400">
          Mobile-first · Built for agents · Future iOS + Android companion app
        </div>
      </Card>
    </div>
  );
}
