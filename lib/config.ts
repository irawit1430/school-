// Centralized config — ONE place for all URLs and settings.
// Override via .env or .env.local (Next.js NEXT_PUBLIC_ prefix for client-side).
// See voltavadocs/docs/frontend/config.example.js

export const CONFIG = {
  // ─── Backend URLs (the ONLY thing that changes at cut-over) ───
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.voltava.in',
  SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'wss://api.voltava.in',

  // ─── Auth storage keys ───
  TOKEN_STORAGE_KEY: 'voltava_token',
  USER_STORAGE_KEY: 'voltava_user',

  // ─── Map defaults (India center; override from GET /api/settings) ───
  MAP_CENTER: { lat: 28.7041, lng: 77.1025 },
  MAP_DEFAULT_ZOOM: 12,

  // ─── Polling fallbacks (when socket is down) ───
  LOCATION_POLL_MS: 15000,
};
