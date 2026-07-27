import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { updateMarkerSchema, validateBody } from "@/lib/validation";

/**
 * PATCH /api/markers/:id — partial update (rename, move, re-tag, edit note).
 * Admin-only. Body validated by updateMarkerSchema (zod).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = validateBody(updateMarkerSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const updates = parsed.data;

  // Build the data object, only including fields that were provided.
  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.cat !== undefined) data.cat = updates.cat;
  if (updates.xPct !== undefined) data.xPct = updates.xPct;
  if (updates.yPct !== undefined) data.yPct = updates.yPct;
  if (updates.note !== undefined) data.note = updates.note;
  if (updates.imageUrl !== undefined) {
    data.imageUrl = updates.imageUrl && updates.imageUrl.length > 0 ? updates.imageUrl : null;
  }

  try {
    const marker = await db.mapMarker.update({ where: { id }, data });
    return NextResponse.json(marker);
  } catch {
    return NextResponse.json({ error: "marker not found" }, { status: 404 });
  }
}

/**
 * DELETE /api/markers/:id — Admin-only.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await db.mapMarker.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "marker not found" }, { status: 404 });
  }
}
