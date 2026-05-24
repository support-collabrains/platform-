export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-4 animate-pulse">
              <div className="h-7 w-10 bg-slate-700 rounded mb-2" />
              <div className="h-3 w-16 bg-slate-700/50 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4 animate-pulse">
                <div className="h-3 bg-slate-700 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-700/50 rounded w-1/2" />
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 animate-pulse h-40" />
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 animate-pulse h-48" />
          </div>
        </div>
      </div>
    </div>
  );
}
