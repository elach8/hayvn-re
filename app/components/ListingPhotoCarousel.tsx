// app/components/ListingPhotoCarousel.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

function safeStr(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : null;
  }
  return null;
}

/**
 * Canonical key to group “same photo different size” variants.
 * IMPORTANT: keep query stripping (many CDNs use w=/h= params).
 */
function canonicalPhotoKey(url: string) {
  const s = safeStr(url) ?? '';
  if (!s) return '';
  const noHash = s.split('#')[0];
  const noQuery = noHash.split('?')[0];
  return noQuery.trim();
}

function photoQualityPenalty(url: string) {
  const s = (safeStr(url) ?? '').toLowerCase();
  if (!s) return 999;

  // higher penalty = worse quality
  let penalty = 0;

  if (s.includes('thumbnail') || s.includes('/thumbnail') || s.includes('thumb')) penalty += 50;
  if (s.includes('small') || s.includes('tiny')) penalty += 20;

  // common resize params in query strings
  if (s.includes('width=') || s.includes('w=') || s.includes('height=') || s.includes('h=')) penalty += 15;
  if (s.includes('resize') || s.includes('resized') || s.includes('fit=')) penalty += 15;

  // sometimes CDNs label large explicitly
  if (s.includes('large') || s.includes('full')) penalty -= 10;

  return penalty;
}

function isLikelyThumb(url: string) {
  // Use the same signals as penalty, but boolean
  return photoQualityPenalty(url) >= 35;
}

function extractPhotoUrlsFromRawPayload(raw: any): string[] {
  const rp = raw ?? {};

  const buckets: any[] = [];

  if (Array.isArray(rp.PhotoUrls)) buckets.push(rp.PhotoUrls);
  if (Array.isArray(rp.photoUrls)) buckets.push(rp.photoUrls);
  if (Array.isArray(rp.Photos)) buckets.push(rp.Photos);
  if (Array.isArray(rp.photos)) buckets.push(rp.photos);
  if (Array.isArray(rp.Media)) buckets.push(rp.Media);
  if (Array.isArray(rp.media)) buckets.push(rp.media);

  const urls: string[] = [];

  for (const b of buckets) {
    for (const item of b) {
      if (typeof item === 'string') {
        urls.push(item);
        continue;
      }
      if (item && typeof item === 'object') {
        urls.push(
          item.Url,
          item.url,
          item.MediaURL,
          item.MediaUrl,
          item.mediaUrl,
          item.mediaURL,
          item.Uri,
          item.uri,
          item.LargeUrl,
          item.largeUrl,
          item.ThumbnailUrl,
          item.thumbnailUrl
        );
      }
    }
  }

  // Primary + thumb fallbacks (keep, but we will GROUP them correctly)
  urls.push(rp.PrimaryPhotoUrl, rp.primaryPhotoUrl, rp.ThumbnailUrl, rp.thumbnailUrl);

  return urls.map(safeStr).filter(Boolean) as string[];
}

/**
 * Build photo “slots” where each slot has a bestFull and bestThumb.
 * This prevents the carousel from ever swapping full<->thumb within the same slot.
 */
function buildPhotoSlots(urls: string[]) {
  const cleaned = (urls ?? []).map((u) => safeStr(u)).filter(Boolean) as string[];

  const byKey = new Map<string, string[]>();
  for (const u of cleaned) {
    const key = canonicalPhotoKey(u);
    if (!key) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(u);
    byKey.set(key, arr);
  }

  const slots: { key: string; bestFull: string; bestThumb: string }[] = [];

  for (const [key, variants] of byKey.entries()) {
    // Sort best quality first (lowest penalty)
    const sorted = [...variants].sort((a, b) => photoQualityPenalty(a) - photoQualityPenalty(b));

    const bestOverall = sorted[0]; // typically full
    const bestThumbCandidate = sorted.find((u) => isLikelyThumb(u)) ?? bestOverall;

    // Ensure bestFull prefers non-thumb if available
    const bestFullCandidate = sorted.find((u) => !isLikelyThumb(u)) ?? bestOverall;

    slots.push({
      key,
      bestFull: bestFullCandidate,
      bestThumb: bestThumbCandidate,
    });
  }

  // Keep a stable order: sort by key to avoid reorder flicker across renders
  // (Your previous code could reorder by penalty on each input change.)
  slots.sort((a, b) => a.key.localeCompare(b.key));

  return slots;
}

export type ListingPhotoRowLike = { url: string | null | undefined };

export function ListingPhotoCarousel({
  photoRows,
  rawPayload,
  fallbackUrls,
  heightClass = 'h-[280px] sm:h-[420px]',
  showThumbs = true,
  maxThumbs = 60,
}: {
  photoRows?: ListingPhotoRowLike[];
  rawPayload?: any;
  fallbackUrls?: string[]; // e.g. [property.primary_photo_url]
  heightClass?: string;
  showThumbs?: boolean;
  maxThumbs?: number;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  const rawFromPayload = useMemo(() => extractPhotoUrlsFromRawPayload(rawPayload), [rawPayload]);

  const allCandidateUrls = useMemo(() => {
    const fromTable = (photoRows ?? []).map((p) => safeStr(p.url)).filter(Boolean) as string[];
    if (fromTable.length > 0) return fromTable;

    if (rawFromPayload.length > 0) return rawFromPayload;

    const fb = (fallbackUrls ?? []).map((u) => safeStr(u)).filter(Boolean) as string[];
    return fb;
  }, [photoRows, rawFromPayload, fallbackUrls]);

  const slots = useMemo(() => buildPhotoSlots(allCandidateUrls), [allCandidateUrls]);

  const mainPhotos = useMemo(() => slots.map((s) => s.bestFull), [slots]);
  const thumbPhotos = useMemo(() => slots.map((s) => s.bestThumb), [slots]);

  // Reset index if the photo set changes
  useEffect(() => {
    setActiveIdx(0);
  }, [slots.length]);

  const hasPhotos = mainPhotos.length > 0;
  const canPrev = hasPhotos && activeIdx > 0;
  const canNext = hasPhotos && activeIdx < mainPhotos.length - 1;

  const goPrev = () => {
    if (!canPrev) return;
    setActiveIdx((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (!canNext) return;
    setActiveIdx((i) => Math.min(mainPhotos.length - 1, i + 1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPrev, canNext, mainPhotos.length]);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (startX == null || startY == null) return;

    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (Math.abs(dx) < 40) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.75) return;

    if (dx > 0) goPrev();
    else goNext();
  };

  const primaryUrl = hasPhotos ? mainPhotos[activeIdx] ?? null : null;

  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {primaryUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={primaryUrl} // ✅ prevents weird “same node different src” caching glitches
            src={primaryUrl}
            alt="Property photo"
            className={`w-full ${heightClass} object-cover select-none`}
            draggable={false}
          />
        ) : (
          <div className={`w-full ${heightClass} flex items-center justify-center text-sm text-slate-400`}>
            No photo available yet.
          </div>
        )}

        {mainPhotos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goPrev();
              }}
              disabled={!canPrev}
              className={[
                'absolute left-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs',
                'backdrop-blur bg-black/40',
                canPrev
                  ? 'border-white/20 text-slate-100 hover:bg-black/55'
                  : 'border-white/10 text-slate-500 opacity-60 cursor-not-allowed',
              ].join(' ')}
              aria-label="Previous photo"
              title="Previous (←)"
            >
              ←
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goNext();
              }}
              disabled={!canNext}
              className={[
                'absolute right-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs',
                'backdrop-blur bg-black/40',
                canNext
                  ? 'border-white/20 text-slate-100 hover:bg-black/55'
                  : 'border-white/10 text-slate-500 opacity-60 cursor-not-allowed',
              ].join(' ')}
              aria-label="Next photo"
              title="Next (→)"
            >
              →
            </button>
          </>
        )}
      </div>

      {showThumbs && thumbPhotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {thumbPhotos.slice(0, maxThumbs).map((url, idx) => {
            const active = idx === activeIdx;
            return (
              <button
                key={`${url}-${idx}`}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={[
                  'shrink-0 rounded-xl overflow-hidden border transition',
                  active ? 'border-[#EBD27A]/60 bg-[#EBD27A]/10' : 'border-white/10 bg-black/40 hover:border-white/25',
                ].join(' ')}
                aria-label={`View photo ${idx + 1}`}
                title={`Photo ${idx + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${idx + 1}`} className="h-16 w-24 object-cover" draggable={false} />
              </button>
            );
          })}
        </div>
      )}

      {mainPhotos.length > 1 ? (
        <div className="text-[11px] text-slate-500">
          Tip: swipe or use ← → keys • {activeIdx + 1}/{mainPhotos.length}
        </div>
      ) : null}
    </div>
  );
}

