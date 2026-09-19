"use client";

// "Try again" on the same broken state was the only offer here. Retrying is still first,
// because a transient render error usually clears — but a reload and a route home are the
// two things that actually recover it.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        <main style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ea580c' }}>
            Voltava
          </p>
          <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Something went wrong</h1>
          <p style={{ margin: 0, maxWidth: 420, fontSize: 14, color: '#475569' }}>
            The dashboard hit an error it could not recover from on its own. Live tracking is
            unaffected — this is the page, not the fleet.
          </p>
          {error?.digest && (
            <code style={{ fontSize: 12, color: '#64748b' }}>Reference: {error.digest}</code>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{ background: '#ea580c', color: '#fff', border: 0, borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
            <a
              href="/overview"
              style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Back to Overview
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
