# Photos Module (Immich Gallery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Open Immich" redirect page at `/dashboard/photos` with a full photo gallery embedded in the portal, using the existing `/api/gateway/immich/*` proxy.

**Architecture:** The NestJS `ImmichProxyController` at `gateway/immich/*` already proxies all requests to `http://immich-server:2283/api/*` with the `x-api-key` header injected. The Next.js route at `portal/app/api/gateway/immich/[...path]/route.ts` already forwards portal requests to NestJS with `x-internal-secret`. New: two React components render a masonry grid (PhotosGallery) and a fullscreen overlay (PhotoLightbox), both fetching through this existing proxy chain.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, `fetch` (via existing `useApiRequest` hook from Sub-project 1), Lucide icons. No new dependencies.

**Prerequisite:** Sub-project 1 (error handling) must be done first — `useApiRequest` hook at `portal/hooks/use-api-request.ts` must exist.

**Manual step required before running tasks:** Create an API key in Immich admin and add it to `.env` (see Task 1).

---

## File Map

**Create:**
- `portal/app/dashboard/photos/PhotosGallery.tsx` — client component: grid, pagination, album filter, lightbox trigger
- `portal/app/dashboard/photos/PhotoLightbox.tsx` — client component: fullscreen overlay, keyboard nav

**Modify:**
- `portal/app/dashboard/photos/page.tsx` — replace redirect with `<PhotosGallery />`
- `.env` — add `IMMICH_API_KEY`
- `api/src/gateway/immich-proxy.controller.ts` — add `api/` prefix handling if needed (verify)

---

## Task 1: Create Immich API key (manual step)

**Files:** `.env`

This step cannot be automated — it requires logging into Immich UI.

- [ ] **Step 1: Open Immich admin**

Go to `https://fotos.platform.cbrains.de` → (top-right menu) → Administration → API Keys → New API Key. Name: `hub-portal`. Copy the generated key.

- [ ] **Step 2: Add to .env**

```bash
# Add to /srv/platform/.env:
echo "IMMICH_API_KEY=<paste-key-here>" >> /srv/platform/.env
```

Or edit `.env` manually and set:
```
IMMICH_API_KEY=<paste-key-here>
```

- [ ] **Step 3: Verify the proxy works with the new key**

```bash
cd /srv/platform && docker compose up -d api
sleep 3
# Test: should return JSON with asset list (may be empty array if no photos uploaded yet)
docker exec platform-api-1 wget -qO- \
  --header="x-internal-secret=$(grep INTERNAL_API_SECRET .env | cut -d= -f2)" \
  'http://localhost:3001/gateway/immich/assets?page=1&size=5' 2>&1 | head -100
```

Expected: JSON response (array or object), not `{"statusCode":401}`.

If 401: the API key is wrong or not saved yet. Fix before continuing.

- [ ] **Step 4: Commit**

```bash
cd /srv/platform
git add .env
git commit -m "feat: add IMMICH_API_KEY to .env"
```

---

## Task 2: PhotoLightbox component

**Files:**
- Create: `portal/app/dashboard/photos/PhotoLightbox.tsx`

Build this first so PhotosGallery can import it.

- [ ] **Step 1: Write `portal/app/dashboard/photos/PhotoLightbox.tsx`**

```tsx
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

  // Prevent body scroll while open
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
    /* Backdrop */
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
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/photos/PhotoLightbox.tsx
git commit -m "feat(portal): add PhotoLightbox component"
```

---

## Task 3: PhotosGallery component

**Files:**
- Create: `portal/app/dashboard/photos/PhotosGallery.tsx`

- [ ] **Step 1: Write `portal/app/dashboard/photos/PhotosGallery.tsx`**

```tsx
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

  // Load albums once on mount
  useEffect(() => {
    request<ImmichAlbum[]>('/api/gateway/immich/albums')
      .then(data => setAlbums(Array.isArray(data) ? data : []))
      .catch(() => {}); // albums are optional; fail silently
  }, [request]);

  const loadAssets = useCallback((albumId: string | null, pageNum: number, append: boolean) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setLoadError(false);

    const params = new URLSearchParams({ page: String(pageNum), size: String(PAGE_SIZE) });
    if (albumId) params.set('albumId', albumId);

    // Assets endpoint: depends on whether we have an albumId
    const endpoint = albumId
      ? `/api/gateway/immich/albums/${albumId}/assets?${params}`
      : `/api/gateway/immich/assets?${params}`;

    request<ImmichAsset[] | { assets?: ImmichAsset[]; nextPage?: string | null }>(endpoint)
      .then(raw => {
        const list: ImmichAsset[] = Array.isArray(raw) ? raw : (raw.assets ?? []);
        setAssets(prev => append ? [...prev, ...list] : list);
        // Immich returns a full page if there are more; if fewer than PAGE_SIZE, we're done
        setHasMore(list.length === PAGE_SIZE);
      })
      .catch(() => setLoadError(true))
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }, [request]);

  // Reload when album filter changes
  useEffect(() => {
    setPage(1);
    loadAssets(selectedAlbum, 1, false);
  }, [selectedAlbum, loadAssets]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    loadAssets(selectedAlbum, next, true);
  };

  // Cast assets to LightboxAsset shape for lightbox
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

        {/* Photo grid — CSS columns masonry */}
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
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {/* Video overlay */}
                  {asset.type === 'VIDEO' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[14px] border-l-white border-t-[9px] border-t-transparent border-b-[9px] border-b-transparent ml-1" />
                      </div>
                    </div>
                  )}
                  {/* Hover overlay with date */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity px-2 py-2">
                    <p className="text-[10px] text-white/80 truncate">
                      {new Date(asset.localDateTime).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-2 pb-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-sm transition disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Laden…
                    </>
                  ) : (
                    <>
                      <ImageIcon size={14} />
                      Meer laden
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
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
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/photos/PhotosGallery.tsx
git commit -m "feat(portal): add PhotosGallery component with masonry grid and lightbox"
```

---

## Task 4: Replace redirect page with gallery

**Files:**
- Modify: `portal/app/dashboard/photos/page.tsx`

- [ ] **Step 1: Replace `portal/app/dashboard/photos/page.tsx`**

```tsx
// portal/app/dashboard/photos/page.tsx
import PhotosGallery from './PhotosGallery';

export default function PhotosPage() {
  return <PhotosGallery />;
}
```

- [ ] **Step 2: Commit**

```bash
cd /srv/platform
git add portal/app/dashboard/photos/page.tsx
git commit -m "feat(portal): replace Immich redirect with embedded photo gallery"
```

---

## Task 5: Verify Immich album-assets endpoint (may need adjustment)

The Immich API for fetching assets within a specific album uses a different endpoint than general assets. Verify:

- [ ] **Step 1: Test the album assets endpoint from inside the API container**

```bash
# First get an album ID
docker exec platform-api-1 wget -qO- \
  --header="x-api-key=$(grep IMMICH_API_KEY /srv/platform/.env | cut -d= -f2)" \
  'http://immich-server:2283/api/albums' 2>&1 | python3 -c "
import sys, json
try:
    albums = json.loads(sys.stdin.read())
    if albums:
        print('Album ID example:', albums[0]['id'])
        print('Total albums:', len(albums))
    else:
        print('No albums found')
except:
    print('Could not parse')
"
```

- [ ] **Step 2: If album assets use different URL, update `PhotosGallery.tsx`**

Check which endpoint Immich uses for album assets. If the response shows album assets are at `GET /api/albums/{id}/assets`, the current code is correct.

If Immich returns assets differently (e.g., via search), update the `endpoint` construction in `PhotosGallery.tsx`:

```tsx
// Alternative: use search endpoint if album endpoint not available
const endpoint = albumId
  ? `/api/gateway/immich/albums/${albumId}/assets?${params}`
  : `/api/gateway/immich/assets?${params}`;
```

This is already in the code. If the album endpoint isn't in the allowlist of `ImmichProxyController`, add `'albums'` (it already is — included in `ALLOWED_PREFIXES`).

- [ ] **Step 3: Test in browser**

Open `https://portal.platform.cbrains.de/dashboard/photos`.

Expected:
- Masonry photo grid loads
- Clicking a photo opens fullscreen lightbox
- Left/right arrows navigate between photos
- ESC closes lightbox
- Album filter chips appear if albums exist
- Error state + retry shown if Immich is unreachable

---

## Task 6: Build, deploy, and smoke-test

- [ ] **Step 1: Rebuild portal**

```bash
cd /srv/platform && docker compose build portal 2>&1 | tail -10
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 2: Restart portal**

```bash
docker compose up -d portal
sleep 5
docker logs platform-portal-1 --tail 5 2>&1
```

Expected: server started on port 3000.

- [ ] **Step 3: Smoke test**

Open `https://portal.platform.cbrains.de/dashboard/photos` in a browser.

- If `IMMICH_API_KEY` is correct: photo grid loads
- If Immich has no photos yet: "Geen foto's gevonden" empty state
- If API key is wrong: toast "Service tijdelijk niet bereikbaar" + retry button

- [ ] **Step 4: Final commit**

```bash
cd /srv/platform
git add -A
git commit -m "feat(portal): complete photos module with Immich gallery integration" --allow-empty
```

---

## Self-review

**Spec coverage:**
- ✅ Replace redirect with embedded gallery
- ✅ Masonry grid with thumbnail loading
- ✅ Lightbox with keyboard navigation (←/→/Escape)
- ✅ Album filter chips
- ✅ "Meer laden" pagination button
- ✅ Empty state (no photos)
- ✅ Error state + retry
- ✅ Video assets: play button overlay
- ✅ Date hover overlay
- ✅ Download button in lightbox

**Spec note (non-goal confirmed):** People sidebar not implemented — album filter is sufficient per spec.

**Type consistency:** `LightboxAsset` type is exported from `PhotoLightbox.tsx` and imported in `PhotosGallery.tsx`.
