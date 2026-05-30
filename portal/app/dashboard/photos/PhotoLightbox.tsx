// portal/app/dashboard/photos/PhotoLightbox.tsx
'use client';

import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

export interface LightboxAsset {
  id: string;
  originalFileName: string;
  localDateTime: string;
  type: 'IMAGE' | 'VIDEO';
  exifInfo?: {
    make?: string;
    model?: string;
    dateTimeOriginal?: string;
  };
}

interface Props {
  assets: LightboxAsset[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function PhotoLightbox({ assets, index, onClose, onNavigate }: Props) {
  const asset = assets[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && index < assets.length - 1) onNavigate(index + 1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [assets.length, index, onClose, onNavigate]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!asset) return null;

  const thumbnailUrl = `/api/gateway/immich/assets/${asset.id}/thumbnail?size=preview`;
  const downloadUrl  = `/api/gateway/immich/assets/${asset.id}/original`;
  const camera = [asset.exifInfo?.make, asset.exifInfo?.model].filter(Boolean).join(' ');
  const dateTaken = asset.exifInfo?.dateTimeOriginal ?? asset.localDateTime;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-black/40">
        <span className="text-xs text-slate-400 truncate max-w-[60vw]">{asset.originalFileName}</span>
        <div className="flex items-center gap-2">
          <a
            href={downloadUrl}
            download={asset.originalFileName}
            className="p-2 text-slate-400 hover:text-white transition rounded-lg hover:bg-white/10"
            title="Downloaden"
            onClick={e => e.stopPropagation()}
          >
            <Download size={16} />
          </a>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition rounded-lg hover:bg-white/10"
            aria-label="Sluiten"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Image / Video */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center px-12 py-4">
        {index > 0 && (
          <button
            onClick={() => onNavigate(index - 1)}
            className="absolute left-2 p-2 text-white/60 hover:text-white bg-black/30 hover:bg-black/60 rounded-full transition z-10"
            aria-label="Vorige"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {asset.type === 'VIDEO' ? (
          <video
            src={downloadUrl}
            controls
            className="max-w-full max-h-full rounded-lg"
            style={{ maxHeight: 'calc(100vh - 160px)' }}
          />
        ) : (
          <img
            src={thumbnailUrl}
            alt={asset.originalFileName}
            className="max-w-full max-h-full object-contain rounded-lg select-none"
            style={{ maxHeight: 'calc(100vh - 160px)' }}
            draggable={false}
          />
        )}

        {index < assets.length - 1 && (
          <button
            onClick={() => onNavigate(index + 1)}
            className="absolute right-2 p-2 text-white/60 hover:text-white bg-black/30 hover:bg-black/60 rounded-full transition z-10"
            aria-label="Volgende"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 px-4 py-2 bg-black/40 flex items-center justify-between">
        <div className="text-xs text-slate-500 space-x-3">
          {dateTaken && (
            <span>{new Date(dateTaken).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          )}
          {camera && <span>{camera}</span>}
        </div>
        <span className="text-xs text-slate-600">{index + 1} / {assets.length}</span>
      </div>
    </div>
  );
}
