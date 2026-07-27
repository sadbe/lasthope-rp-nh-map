/**
 * Server-side text sanitization for content that will be rendered via
 * `dangerouslySetInnerHTML` on the client.
 *
 * The iconSvg() function interpolates a `color` and the SVG itself into an
 * HTML string that React renders via dangerouslySetInnerHTML. While the zod
 * validation in lib/validation.ts already enforces `#RRGGBB` format on
 * category colors, the marker `name` and `note` fields are still user-
 * supplied free text and need to be HTML-escaped before going into any
 * string that the client might inject as HTML.
 *
 * The current client UI actually renders `marker.name` and `marker.note`
 * via `{marker.name}` JSX (auto-escaped by React) — so for those fields
 * this is defense-in-depth. But for the `cat.color` value that goes
 * through `iconSvg()`, escaping alone isn't enough — that's why we have
 * BOTH the zod regex AND this function.
 *
 * Strategy: replace the 5 HTML-significant characters with their entity
 * equivalents. This is the OWASP-recommended minimum for text escaping.
 */
export function escapeHtml(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Strip control characters and zero-width unicode (BOM, ZWSP, ZWJ, etc.)
 * that can be used to obfuscate payloads or cause display issues.
 *
 * Applied to all user-supplied text before persistence.
 */
export function sanitizeText(input: string): string {
  return input
    // control chars except \n \t \r
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // zero-width and directional marks
    .replace(/[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, '')
    // BOM at start
    .replace(/^\ufeff/, '')
    .trim();
}

/**
 * Combined helper — sanitize + escape. Use this for any text that will
 * be displayed via dangerouslySetInnerHTML.
 */
export function sanitizeForHtml(input: string | null | undefined): string {
  return escapeHtml(sanitizeText(input ?? ''));
}
