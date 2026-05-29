import { headers } from 'next/headers';
import Link from 'next/link';
import { Camera, ExternalLink } from 'lucide-react';

export default async function PhotosPage() {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  // Derive the primary domain from the portal host (portal.platform.cbrains.de → fotos.platform.cbrains.de)
  const immichUrl = host.replace(/^portal\./, 'fotos.');

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center py-8 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-5">
            <Camera size={36} className="text-white" />
          </div>
          <h2 className="text-lg font-bold text-slate-100 mb-1">Immich Fotoarchief</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-[260px]">
            Beheer en bekijk je persoonlijke fotoarchief in Immich — veilig opgeslagen op jouw server.
          </p>
          <Link
            href={`https://${immichUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-2xl px-6 py-3 text-sm transition active:scale-95"
          >
            <ExternalLink size={16} />
            Open Immich
          </Link>
        </div>

        <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Info</h3>
          <div className="space-y-2 text-sm text-slate-400">
            <p>Immich is een zelfgehoste Google Photos-vervanging met gezichtsherkenning, automatische back-up en offline toegang.</p>
            <p>Download de Immich-app op je telefoon voor automatische back-up van foto&apos;s en video&apos;s.</p>
          </div>
          <div className="pt-1">
            <p className="text-xs text-slate-600">Server: <span className="font-mono text-slate-500">fotos.{host.replace(/^portal\./, '')}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
