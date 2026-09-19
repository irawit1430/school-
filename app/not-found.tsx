import Link from 'next/link';

// Hosting rewrites unmatched paths, so a stale bookmark lands here. It used to be an
// unstyled heading with no navigation and no way out but the address bar.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Voltava</p>
      <h1 className="text-2xl font-bold text-slate-900">That page doesn&apos;t exist</h1>
      <p className="max-w-sm text-sm text-slate-600">
        The link may be out of date, or the page may have been renamed.
      </p>
      <Link
        href="/overview"
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
      >
        Back to Overview
      </Link>
    </main>
  );
}
