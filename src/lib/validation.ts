import { z } from 'zod';

/**
 * Shared Zod schemas for API request bodies.
 *
 * Every mutating endpoint should validate its input against one of these
 * before touching the database. This is the R5+T12 fix — replaces the
 * ad-hoc `if (!body?.id || !body?.name || ...)` checks that only verified
 * field presence, not type/format/length.
 *
 * Sanitization: strings are trimmed and capped at a sensible max length
 * to prevent (a) accidental huge payloads, (b) obvious XSS payloads
 * (further sanitized client-side before render — defense in depth).
 *
 * The `color` regex enforces `#RRGGBB` hex format — used by iconSvg()
 * which interpolates the value directly into an SVG string, so anything
 * other than a hex value would be an injection vector.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ICON_ID = /^[a-z_]+$/;
const URL_MAX = 2048;

export const createMarkerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200).trim(),
  cat: z.string().min(1).max(60),
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
  note: z.string().max(2000).trim().nullish(),
  imageUrl: z.string().url().max(URL_MAX).nullish().or(z.literal('')),
});

export const updateMarkerSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  cat: z.string().min(1).max(60).optional(),
  xPct: z.number().min(0).max(100).optional(),
  yPct: z.number().min(0).max(100).optional(),
  note: z.string().max(2000).trim().nullish(),
  imageUrl: z.string().url().max(URL_MAX).nullish().or(z.literal('')),
});

export const createCategorySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100).trim(),
  color: z.string().regex(HEX_COLOR, 'color must be #RRGGBB hex'),
  icon: z.string().regex(ICON_ID, 'icon must be lowercase letters/underscore'),
});

export type CreateMarkerInput = z.infer<typeof createMarkerSchema>;
export type UpdateMarkerInput = z.infer<typeof updateMarkerSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Validate `body` against `schema`. Returns either `{ success: true, data }`
 * or `{ success: false, error }` with a human-readable message.
 *
 * Usage in route handler:
 *
 *   const parsed = validateBody(createMarkerSchema, body);
 *   if (!parsed.success) {
 *     return NextResponse.json({ error: parsed.error }, { status: 400 });
 *   }
 *   // parsed.data is typed as CreateMarkerInput
 */
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const first = result.error.issues[0];
  return {
    success: false,
    error: first ? `${first.path.join('.')}: ${first.message}` : 'validation failed',
  };
}
