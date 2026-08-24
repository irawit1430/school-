"use client";
import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
}

/** Shimmer placeholder. Set width/height via className, e.g. <Skeleton className="h-6 w-24" />. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx('animate-pulse rounded-md bg-slate-200/70', className)}
      aria-hidden="true"
    />
  );
}
