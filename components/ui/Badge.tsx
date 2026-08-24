"use client";
import React from 'react';
import { clsx } from 'clsx';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

interface BadgeProps {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}

const toneStyles: Record<Tone, string> = {
  primary: 'text-primary bg-orange-50',
  success: 'text-emerald-700 bg-emerald-50',
  warning: 'text-amber-700 bg-amber-50',
  danger: 'text-rose-700 bg-rose-50',
  neutral: 'text-slate-600 bg-slate-100',
  info: 'text-sky-700 bg-sky-50',
};

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded',
        toneStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
