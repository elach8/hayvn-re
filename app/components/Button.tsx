// /app/components/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  variant = 'primary',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none';

  const variants = {
    primary:
      'bg-[#D4AF37] text-black hover:bg-[#b99730] disabled:opacity-50 disabled:cursor-not-allowed',
    secondary:
      'border border-white/20 text-white bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed',
    ghost:
      'text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed',
  };

  return (
    <button
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

