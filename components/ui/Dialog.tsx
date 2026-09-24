import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * The app's one modal.
 *
 * Every other dialog in this codebase was a styled div: no role, no aria-modal, no focus
 * containment, no Escape. A keyboard user tabbed straight out of an open modal into the
 * page behind it, where focus is invisible under the overlay, and a screen reader was
 * never told a dialog had opened. Native `<dialog>` + showModal() gives all of that for
 * free, which is why this one was already right and the others were not.
 */
interface DialogProps {
  title: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: 'md' | 'lg';
  dismissible?: boolean;
  /**
   * True when the form holds input worth keeping. Escape and backdrop clicks then confirm
   * first — a part-written broadcast explaining that buses are delayed by flooding is
   * usually composed under time pressure, and losing it to a stray click meant typing it
   * twice before anyone noticed the pattern.
   */
  dirty?: boolean;
  discardPrompt?: string;
}

export function Dialog({
  title, children, onClose, busy = false, size = 'md', dismissible = true,
  dirty = false, discardPrompt = 'Discard your changes?',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const startedOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // showModal supplies the top layer, inert background, and native focus containment.
    dialog.showModal();
    headingRef.current?.focus();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  const requestClose = () => {
    if (busy || !dismissible) return;
    if (dirty && !window.confirm(discardPrompt)) return;
    onClose();
  };
  const isBackdrop = (event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      aria-busy={busy || undefined}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onPointerDown={event => { startedOnBackdrop.current = isBackdrop(event); }}
      onClick={event => {
        if (startedOnBackdrop.current && isBackdrop(event)) requestClose();
        startedOnBackdrop.current = false;
      }}
      className={`m-auto w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] ${size === 'lg' ? 'max-w-2xl' : 'max-w-md'} overflow-hidden rounded-xl border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:flex-col`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className="min-w-0 text-lg font-bold outline-none">{title}</h2>
        {dismissible && (
          <button type="button" onClick={requestClose} disabled={busy} aria-label="Close dialog" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-50">
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
    </dialog>
  );
}
