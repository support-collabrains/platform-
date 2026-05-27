// portal/app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* Greeting skeleton */}
      <div className="pt-1 space-y-2 animate-pulse">
        <div className="h-6 bg-slate-700 rounded-lg w-48" />
        <div className="h-3.5 bg-slate-700/50 rounded w-32" />
      </div>
      {/* Stats row skeleton */}
      <div className="grid grid-cols-3 gap-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-800 rounded-2xl p-4 space-y-2">
            <div className="h-7 bg-slate-700 rounded w-8 mx-auto" />
            <div className="h-2.5 bg-slate-700/50 rounded w-3/4 mx-auto" />
          </div>
        ))}
      </div>
      {/* Activity skeleton */}
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-slate-700/50 rounded w-28 mb-3" />
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-800 rounded-2xl p-4 flex gap-3">
            <div className="w-4 h-4 bg-slate-700 rounded-full mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-700 rounded w-3/4" />
              <div className="h-2.5 bg-slate-700/50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
