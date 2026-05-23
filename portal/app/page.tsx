import { redirect } from 'next/navigation';
import { getBootstrapState } from '@/lib/api';

export default async function Home() {
  try {
    const { isReady } = await getBootstrapState();
    if (!isReady) {
      redirect('/setup');
    }
    // TODO: replace with dashboard once provisioned
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-800">Platform Active</h1>
          <p className="text-slate-500 mt-2">Dashboard coming soon.</p>
        </div>
      </main>
    );
  } catch {
    // API not reachable on first load — go to setup
    redirect('/setup');
  }
}
