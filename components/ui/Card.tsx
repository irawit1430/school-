"use client";
import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

/** Standard surface: white, rounded-xl, subtle border + shadow. */
export function Card({ className, children }: CardProps) {
  return (
    <div className={clsx('bg-white rounded-xl border border-slate-200 shadow-sm', className)}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, icon, action, className }: CardHeaderProps) {
  return (
    <div className={clsx('p-4 border-b border-slate-100 flex items-center justify-between', className)}>
      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {action}
    </div>
  );
}
