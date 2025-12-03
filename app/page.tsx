// /app/page.tsx (example)
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Hayvn-RE</h1>
      <p className="text-sm text-gray-600">
        Internal real estate CRM & analytics.
      </p>
      <div className="flex gap-3">
        <Link
          href="/sign-in"
          className="rounded-xl bg-indigo-600 text-white text-sm font-medium px-3 py-2.5"
        >
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl border border-gray-300 text-sm px-3 py-2.5"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
