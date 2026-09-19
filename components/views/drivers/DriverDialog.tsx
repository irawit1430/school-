import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function DriverDialog({ title, children, onClose, busy = false }: {
  title: string; children: React.ReactNode; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-busy={busy}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <h3 id={titleId} className="text-lg font-bold">{title}</h3>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"
          className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X size={20} /></button>
      </div>
      {children}
    </dialog>
  );
}
