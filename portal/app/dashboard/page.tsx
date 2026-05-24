import { headers } from 'next/headers';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DocumentsList from './components/DocumentsList';
import NotificationLog from './components/NotificationLog';
import PreferencesPanel from './components/PreferencesPanel';

function SectionSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
      <div className="h-4 w-36 bg-slate-200 rounded mb-4" />
      <div className="space-y-2">
        <div className="h-3 bg-slate-100 rounded" />
        <div className="h-3 bg-slate-100 rounded w-4/5" />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const hdrs = await headers();
  const username = hdrs.get('x-authentik-username') ?? 'Gebruiker';
  const uid = hdrs.get('x-authentik-uid') ?? '';

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3 py-4">
          <Link href="/" className="text-slate-400 hover:text-slate-600 transition">
            <ArrowLeft size={18} />
          </Link>
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg select-none">
            {username[0].toUpperCase()}
          </div>
          <div>
            <h1 className="font-semibold text-slate-800">Welkom, {username}</h1>
            <p className="text-xs text-slate-400">Persoonlijk dashboard</p>
          </div>
        </div>

        <Suspense fallback={<SectionSkeleton />}>
          <DocumentsList uid={uid} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <NotificationLog uid={uid} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <PreferencesPanel uid={uid} />
        </Suspense>
      </div>
    </main>
  );
}
