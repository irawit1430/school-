import React from 'react';
import { clsx } from 'clsx';
import { Skeleton } from '@/components/ui/Skeleton';

export function MetricCard({ title, value, trend, icon: Icon, color, loading = false, subtitle }: any) {
  const colorStyles: Record<string, string> = {
    primary: "text-primary",
    warning: "text-warning",
    success: "text-success",
    slate: "text-slate-500"
  };

  const iconColor = colorStyles[color] || "text-slate-500";

  return (
    <div className="bg-white p-3 sm:p-4 lg:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[104px] sm:min-h-[116px] lg:min-h-[128px]">
      <div className="flex justify-between items-start mb-2 sm:mb-3 lg:mb-4 gap-2">
        <p className="text-[10px] sm:text-xs lg:text-sm font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <Icon className={clsx(iconColor, "w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6")} />
      </div>
      <div className="flex items-end justify-between gap-2">
        {loading ? (
          <Skeleton className="h-6 w-12 sm:h-7 sm:w-14 lg:h-9 lg:w-20" />
        ) : (
          <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-none">{value}</h3>
        )}
        {trend && (
          <span className={clsx(
            "text-[10px] sm:text-xs lg:text-sm font-medium px-1.5 py-0.5 sm:px-2 sm:py-1 rounded whitespace-nowrap",
            trend.startsWith('+') || trend.endsWith('%') ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50"
          )}>
            {trend}
          </span>
        )}
        {subtitle && (
          <span className="text-[10px] sm:text-xs lg:text-sm uppercase font-bold text-slate-400 whitespace-nowrap">{subtitle}</span>
        )}
      </div>
    </div>
  );
}