// app/components/PropertyImage.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';

type PropertyImageProps = {
  src: string | null | undefined;
  alt?: string | null;
  /** 
   * agent = dark app
   * portal = light client-facing app
   */
  variant?: 'agent' | 'portal';
  /** Small pill in top-left, e.g. "New", "In escrow" */
  badge?: string | null;
  /** Optional little star in top-right */
  isFavorite?: boolean;
  /** Bottom-left overlay text */
  label?: string | null;
  /** Smaller text under label */
  subLabel?: string | null;
  className?: string;
};

export default function PropertyImage({
  src,
  alt,
  variant = 'agent',
  badge,
  isFavorite,
  label,
  subLabel,
  className = '',
}: PropertyImageProps) {
  const [errored, setErrored] = useState(false);

  const isDark = variant === 'agent';

  const containerBase =
    'relative group overflow-hidden rounded-xl aspect-[4/3] w-full';
  const borderClasses = isDark
    ? 'border border-white/10 bg-black/40'
    : 'border border-slate-200 bg-slate-50';

  const overlayGradient = isDark
    ? 'from-black/80 via-black/20 to-transparent'
    : 'from-black/75 via-black/15 to-transparent';

  const badgeClasses = isDark
    ? 'bg-white/10 text-slate-100 border border-white/25'
    : 'bg-white text-slate-800 border border-slate-200';

  const favoriteClasses = isDark
    ? 'bg-black/60 text-yellow-300 border border-yellow-400/60'
    : 'bg-white text-yellow-500 border border-yellow-400/70';

  const hasImage = !!src && !errored;

  return (
    <div
      className={[
        containerBase,
        borderClasses,
        'transition-transform duration-150 group-hover:scale-[1.01]',
        className,
      ].join(' ')}
    >
      {/* Image or fallback */}
      {hasImage ? (
        <Image
          src={src as string}
          alt={alt || 'Property photo'}
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 400px, 100vw"
          onError={() => setErrored(true)}
        />
      ) : (
        <div
          className={[
            'absolute inset-0 flex flex-col items-center justify-center',
            isDark
              ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'
              : 'bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200',
          ].join(' ')}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/30 shadow-sm">
            <span className="text-xl">🏠</span>
          </div>
          <p
            className={[
              'mt-2 text-[11px] tracking-wide uppercase',
              isDark ? 'text-slate-300' : 'text-slate-600',
            ].join(' ')}
          >
            Photo coming soon
          </p>
        </div>
      )}

      {/* Top controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-2 text-[11px]">
        <div className="flex gap-2">
          {badge && (
            <span
              className={[
                'inline-flex items-center rounded-full px-2 py-0.5 backdrop-blur-sm',
                badgeClasses,
              ].join(' ')}
            >
              {badge}
            </span>
          )}
        </div>
        {isFavorite && (
          <span
            className={[
              'inline-flex items-center rounded-full px-2 py-0.5 backdrop-blur-sm',
              favoriteClasses,
            ].join(' ')}
          >
            ★ Favorite
          </span>
        )}
      </div>

      {/* Bottom gradient + text */}
      {(label || subLabel) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <div
            className={[
              'bg-gradient-to-t',
              overlayGradient,
              'px-3 pb-2 pt-6',
            ].join(' ')}
          >
            {label && (
              <div className="text-sm font-semibold text-white line-clamp-1">
                {label}
              </div>
            )}
            {subLabel && (
              <div className="text-[11px] text-slate-100/80 line-clamp-1">
                {subLabel}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
