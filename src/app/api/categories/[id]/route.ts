import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * DELETE /api/categories/:id — Admin-only.
 * Also clears markers that were using this layer, same behaviour the UI
 * already warns about before calling this.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await db.mapMarker.deleteMany({ where: { cat: id } });
  try {
    await db.mapCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "category not found" }, { status: 404 });
  }
}
