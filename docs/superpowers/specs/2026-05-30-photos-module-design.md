# Photos Module (Immich Gallery) — Design Spec

**Date:** 2026-05-30  
**Status:** Approved  
**Scope:** CollaBrains portal — /dashboard/photos

---

## Context

The current photos page is a single "Open Immich" button that redirects to the external Immich service. This breaks the "one coherent app" goal. The NestJS API already has a `/gateway/immich/*` proxy controller (`immich-proxy.controller.ts`) that forwards all requests to `http://immich-server:2283` and injects the `x-api-key` header.

**Goal:** Replace the redirect with a full photo gallery embedded in the portal, using the existing proxy as backend.

---

## Architecture

### Backend — no new endpoints needed

The existing `GET /gateway/immich/*path` proxy already handles:
- `GET /gateway/immich/api/assets` — paginated asset list
- `GET /gateway/immich/api/albums` — album list
- `GET /gateway/immich/api/people` — recognized people
- `GET /gateway/immich/api/assets/:id/thumbnail?size=preview` — thumbnail binary

The proxy is protected by `InternalSecretGuard` (requires `x-internal-secret` header). The portal's Next.js API routes already pass this header when proxying to NestJS.

**Only needed:** Verify the existing Immich proxy injects `x-api-key: ${IMMICH_API_KEY}` before forwarding. If `IMMICH_API_KEY` is empty (it is currently), add a fallback that uses Immich's admin API to fetch assets without a key, or provision an API key in Immich.

> **Note:** `IMMICH_API_KEY` is currently empty in .env. During implementation, an API key must be created in Immich admin and added to .env.

### Frontend — 3 new components

#### `portal/app/dashboard/photos/page.tsx` (replace existing)
Server component. Reads Authentik headers to get username. Renders `<PhotosGallery />`.

#### `portal/app/dashboard/photos/PhotosGallery.tsx`
Client component. Main gallery view.

```
State:
  assets: Asset[]        ← loaded assets
  page: number           ← current page (starts at 1)
  hasMore: boolean       ← whether more pages exist
  selectedAlbum: string  ← active album filter (null = all)
  lightboxIndex: number  ← which asset is open in lightbox (-1 = closed)
  loading: boolean
  error: string | null
```

Layout:
- Top: album filter chips (horizontal scroll on mobile)
- Main: CSS columns masonry grid (3 cols desktop, 2 cols tablet, 1 col mobile)
- Each photo: lazy-loaded `<img>` from thumbnail endpoint, click → opens lightbox
- Bottom: "Meer laden" button (not infinite scroll — simpler, avoids layout shifts)
- Empty state: camera icon + "Geen foto's gevonden"
- Error state: uses Sub-project 1 `useApiRequest()` error handling

Asset card:
- Thumbnail image with aspect-ratio preservation
- On hover: overlay with date, short filename
- Video assets: play-button overlay icon (click opens lightbox with `<video>`)

#### `portal/app/dashboard/photos/PhotoLightbox.tsx`
Full-screen overlay for viewing one photo at a time.

```
Props:
  assets: Asset[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
```

Layout:
- Dark overlay (bg-black/80)
- Centered image (max 90vw × 90vh, object-contain)
- Left/right arrow buttons (keyboard ←/→ also work)
- Escape key closes
- Top-right: ×-close, download button (links to original via proxy)
- Bottom: date taken, camera model (from EXIF data in asset object)

---

## Data Types

```ts
interface ImmichAsset {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  originalFileName: string;
  fileCreatedAt: string;       // ISO datetime
  localDateTime: string;
  exifInfo?: {
    make?: string;
    model?: string;
    dateTimeOriginal?: string;
    latitude?: number;
    longitude?: number;
  };
  // URLs constructed via proxy:
  // thumbnail: /api/gateway/immich/api/assets/{id}/thumbnail?size=preview
  // original:  /api/gateway/immich/api/assets/{id}/original
}

interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId?: string;
}
```

---

## Next.js API Route

`portal/app/api/gateway/immich/[...path]/route.ts` **already exists** (found during codebase exploration).

Verify it handles binary streaming correctly (thumbnails are binary, not JSON). The Next.js route:
1. Reads `x-authentik-*` headers from the incoming request
2. Forwards to `http://api:3001/gateway/immich/${path}` with `x-internal-secret` header
3. Streams the response (important for binary thumbnail images)

---

## Environment Variable Required

```env
IMMICH_API_KEY=<key-from-immich-admin>
```

**Setup step during implementation:**
1. Open `https://fotos.platform.cbrains.de`
2. Admin → API Keys → Create key "hub-portal"
3. Add to `.env`
4. Restart API container

---

## Non-goals

- Photo upload from the portal — view-only
- Face tagging / editing metadata — view-only  
- People filter sidebar — out of scope for this iteration (album filter sufficient)

---

## Testing

1. Photos page renders thumbnail grid with ≥1 photos from Immich
2. Clicking thumbnail opens lightbox
3. Lightbox keyboard navigation (←/→/Escape) works
4. "Meer laden" button loads next page
5. Album filter chips filter results correctly
6. Empty state shown when Immich returns 0 assets
7. Error state + retry shown when Immich is unreachable

---

## File Map

**Create:**
- `portal/app/dashboard/photos/PhotosGallery.tsx`
- `portal/app/dashboard/photos/PhotoLightbox.tsx`

**Modify:**
- `portal/app/dashboard/photos/page.tsx` (replace redirect with gallery)
- `portal/app/api/gateway/immich/[...path]/route.ts` (verify/create)
- `.env` (add IMMICH_API_KEY)
- `api/src/gateway/immich-proxy.controller.ts` (verify x-api-key injection)
