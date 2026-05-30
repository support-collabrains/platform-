// portal/app/dashboard/photos/PhotosGallery.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Camera, RefreshCw, AlertCircle, Image as ImageIcon } from 'lucide-react';
import PhotoLightbox, { type LightboxAsset } from './PhotoLightbox';
import { useApiRequest } from '@/hooks/use-api-request';

interface ImmichAsset {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  originalFileName: string;
  localDateTime: string;
  fileCreatedAt: string;
  isFavorite: boolean;
  exifInfo?: {
    make?: string;
    model?: string;
    dateTimeOriginal?: string;
  };
}

interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
}

const PAGE_SIZE = 48;

function thumbnailUrl(id: string) {
  return `/api/gateway/immich/assets/${id}/thumbnail?size=preview`;
}

export default function PhotosGallery() {
  const { request } = useApiRequest();
  const [assets, setAssets] = useState<ImmichAsset[]>([]);
  const [albums, setAlbums] = useState<ImmichAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  useEffect(() => {
    request<ImmichAlbum[]>('/api/gateway/immich/albums')
      .then(data => setAlbums(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [request]);

  const loadAssets = useCallback((albumId: string | null, pageNum: number, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setLoadError(false);

    const params = new URLSearchParams({ page: String(pageNum), size: String(PAGE_SIZE) });

    const endpoint = albumId
      ? `/api/gateway/immich/albums/${albumId}/assets?${params}`
      : `/api/gateway/immich/assets?${params}`;

    request<ImmichAsset[] | { assets?: ImmichAsset[] }>(endpoint)
      .then(raw => {
        const list: ImmichAsset[] = Array.isArray(raw) ? raw : ((raw as { assets?: ImmichAsset[] }).assets ?? []);
        setAssets(prev => append ? [...prev, ...list] : list);
        setHasMore(list.length === PAGE_SIZE);
      })
      .catch(() => setLoadError(true))
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }, [request]);

  useEffect(() => {
    setPage(1);
    loadAssets(selectedAlbum, 1, false);
  }, [selectedAlbum, loadAssets]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    loadAssets(selectedAlbum, next, true);
  };

  const lightboxAssets: LightboxAsset[] = assets.map(a => ({
    id: a.id,
    originalFileName: a.originalFileName,
    localDateTime: a.localDateTime,
    type: a.type,
    exifInfo: a.exifInfo,
  }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Album filter chips */}
        {albums.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedAlbum(null)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition ${
                selectedAlbum === null
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500'
              }`}
            >
              Alle foto&apos;s
            </button>
            {albums.map(album => (
              <button
                key={album.id}
                onClick={() => setSelectedAlbum(album.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  selectedAlbum === album.id
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500'
                }`}
              >
                {album.albumName}
                <span className="text-[10px] opacity-60">{album.assetCount}</span>
              </button>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="columns-2 sm:columns-3 gap-2 space-y-2">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-slate-800 rounded-xl break-inside-avoid"
                style={{ aspectRatio: i % 3 === 0 ? '1' : i % 3 === 1 ? '4/3' : '3/4' }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && loadError && (
          <div className="flex flex-col items-center py-16 gap-4 text-slate-600">
            <AlertCircle size={36} className="opacity-40" />
            <p className="text-sm">Foto&apos;s niet beschikbaar</p>
            <button
              onClick={() => loadAssets(selectedAlbum, 1, false)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm transition"
            >
              <RefreshCw size={14} />
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && assets.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-600 gap-3">
            <Camera size={40} className="opacity-30" />
            <p className="text-sm">Geen foto&apos;s gevonden</p>
            {selectedAlbum && (
              <button onClick={() => setSelectedAlbum(null)} className="text-xs text-purple-400 hover:text-purple-300 transition">
                Toon alle foto&apos;s
              </button>
            )}
          </div>
        )}

        {/* Photo grid */}
        {!loading && !loadError && assets.length > 0 && (
          <>
            <div className="columns-2 sm:columns-3 gap-2">
              {assets.map((asset, idx) => (
                <button
                  key={asset.id}
                  onClick={() => setLightboxIndex(idx)}
                  className="break-inside-avoid mb-2 w-full block relative group rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  <img
                    src={thumbnailUrl(asset.id)}
                    alt={asset.originalFileName}
                    loading="lazy"
                    className="w-full object-cover block transition-transform duration-200 group-hover:scale-[1.02]"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {asset.type === 'VIDEO' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[14px] border-l-white border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent ml-1" />
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity px-2 py-2">
                    <p className="text-[10px] text-white/80 truncate">
                      {new Date(asset.localDateTime).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2 pb-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-sm transition disabled:opacity-50"
                >
                  {loadingMore ? (
                    <><RefreshCw size={14} className="animate-spin" />Laden…</>
                  ) : (
                    <><ImageIcon size={14} />Meer laden</>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {lightboxIndex >= 0 && (
        <PhotoLightbox
          assets={lightboxAssets}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(-1)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
