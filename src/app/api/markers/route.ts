import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createMarkerSchema, validateBody } from "@/lib/validation";

/**
 * GET /api/markers — public. Everyone who opens the site gets the same list.
 * This is the actual "shared for all players" storage (was localStorage before,
 * which only ever lived in one person's browser).
 *
 * No auth required — viewer mode needs to read markers.
 */
export async function GET() {
  const markers = await db.mapMarker.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(markers);
}

/**
 * DELETE /api/markers — wipes every marker. Admin-only.
 * Used by the "delete all" button in admin mode.
 */
export async function DELETE() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await db.mapMarker.deleteMany({});
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/markers — create one marker. Admin-only.
 * Body is validated by createMarkerSchema (zod) — checks types, ranges,
 * string lengths. Replaces the previous ad-hoc presence check.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = validateBody(createMarkerSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const data = parsed.data;

  // imageUrl: empty string → null
  const imageUrl = data.imageUrl && data.imageUrl.length > 0 ? data.imageUrl : null;

  const marker = await db.mapMarker.create({
    data: {
      id: data.id,
      name: data.name,
      cat: data.cat,
      xPct: data.xPct,
      yPct: data.yPct,
      note: data.note ?? null,
      imageUrl,
    },
  });
  return NextResponse.json(marker, { status: 201 });
}
