/**
 * Escape a string for safe interpolation into HTML. Imported asset/user data
 * must never reach unescaped Eta output (`<%~ %>`).
 */
export function escapeHtml (value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
