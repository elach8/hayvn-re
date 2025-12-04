// /app/components/Card.tsx
import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = '' }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_45px_rgba(0,0,0,0.45)] backdrop-blur-md p-4 sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
