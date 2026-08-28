/**
 * An initials avatar, generated locally as a data URI.
 *
 * These used to come from ui-avatars.com — one request per student row plus one in the
 * header of every page, at roughly 300ms each, to draw two letters on a coloured
 * circle. That put a third party on the render path of every screen, and on a school's
 * filtered network it is one more host that can be blocked or slow.
 *
 * Deterministic: the same name always gets the same colour, so a face stays recognisable
 * between page loads.
 */

// Chosen to stay legible with white text and to read as distinct at 40px.
const PALETTE = [
  '#b45309', '#0f766e', '#4338ca', '#a21caf',
  '#b91c1c', '#166534', '#1d4ed8', '#7c2d12',
];

const initialsOf = (name: string): string => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const colourOf = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

export const avatarFor = (name: string): string => {
  const initials = initialsOf(name);
  const bg = colourOf(String(name || ''));
  // Escaped rather than base64: names carry non-ASCII characters and btoa throws on them.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">` +
    `<rect width="80" height="80" fill="${bg}"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="#fff" ` +
    `font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
