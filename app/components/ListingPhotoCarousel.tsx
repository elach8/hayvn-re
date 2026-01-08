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

function isThumbnail(url: string) {
  const s = url.toLowerCase();
  return (
    s.includes('thumbnail') ||
    s.includes('/thumbnail') ||
    s.includes('thumb') ||
    s.includes('small') ||
    s.includes('tiny') ||
    s.includes('width=') ||
    s.includes('w=') ||
    s.includes('height=') ||
    s.includes('h=') ||
    s.includes('resize') ||
    s.includes('fit=')
  );
}

function extractPhotoUrlsFromRawPayload(raw: any) {
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
      } else if (item && typeof item === 'object') {
        urls.push(
          item.LargeUrl,
          item.largeUrl,
          item.Url,
          item.url,
          item.MediaURL,
          item.MediaUrl,
          item.mediaUrl,
          item.mediaURL,
          item.Uri,
          item.uri
        );
      }
    }
  }

  urls.push(rp.PrimaryPhotoUrl, rp.primaryPhotoUrl);

  return urls.map(safeStr).filter(Boolean) as string[];
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
  fallbackUrls?: string[];
  heightClass?: string;
  showThumbs?: boolean;
  maxThumbs?: number;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  const allUrls = useMemo(() => {
    const fromTable = (photoRows ?? []).map((p) => safeStr(p.url)).filter(Boolean) as string[];
    if (fromTable.length) return fromTable;

    const fromPayload = extractPhotoUrlsFromRawPayload(rawPayload);
    if (fromPayload.length) return fromPayload;

    return (fallbackUrls ?? []).map(safeStr).filter(Boolean) as string[];
  }, [photoRows, rawPayload, fallbackUrls]);

  // 🔒 HARD SPLIT
  const fullResPhotos = useMemo(
    () => allUrls.filter((u) => !isThumbnail(u)),
    [allUrls]
  );

  const thumbPhotos = useMemo(
    () => allUrls.filter((u) => isThumbnail(u)),
    [allUrls]
  );

  const photos = fullResPhotos.length ? fullResPhotos : allUrls;

  useEffect(() => {
    setActiveIdx(0);
  }, [photos.length]);

  const canPrev = activeIdx > 0;
  const canNext = activeIdx < photos.length - 1;

  const goPrev = () => canPrev && setActiveIdx((i) => i - 1);
  const goNext = () => canNext && setActiveIdx((i) => i + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPrev, canNext]);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(dx) < 40) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.75) return;

    dx > 0 ? goPrev() : goNext();
  };

  const primaryUrl = photos[activeIdx] ?? null;

  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {primaryUrl ? (
          <img
            key={primaryUrl} // ✅ forces clean swap
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

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={!canPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs backdrop-blur bg-black/40 border-white/20 text-slate-100 disabled:opacity-50"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs backdrop-blur bg-black/40 border-white/20 text-slate-100 disabled:opacity-50"
            >
              →
            </button>
          </>
        )}
      </div>

      {showThumbs && thumbPhotos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {thumbPhotos.slice(0, maxThumbs).map((url, idx) => (
            <button
              key={`${url}-${idx}`}
              type="button"
              onClick={() => setActiveIdx(idx)}
              className="shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black/40 hover:border-white/25"
            >
              <img src={url} className="h-16 w-24 object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}

      {photos.length > 1 && (
        <div className="text-[11px] text-slate-500">
          Tip: swipe or use ← → keys • {activeIdx + 1}/{photos.length}
        </div>
      )}
    </div>
  );
}
