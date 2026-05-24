export default function Loading() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="max-w-2xl mx-auto space-y-4 pt-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
            <div className="h-4 w-36 bg-slate-200 rounded mb-4" />
            <div className="space-y-2">
              <div className="h-3 bg-slate-100 rounded" />
              <div className="h-3 bg-slate-100 rounded w-4/5" />
              <div className="h-3 bg-slate-100 rounded w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
