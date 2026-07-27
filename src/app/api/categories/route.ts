import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createCategorySchema, validateBody } from "@/lib/validation";

/**
 * GET /api/categories — public. Custom layers players created (builtin ones
 * live in code, not the DB — only player-made layers need to be shared/persisted).
 */
export async function GET() {
  const cats = await db.mapCategory.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(cats);
}

/**
 * POST /api/categories — Admin-only.
 * Body validated by createCategorySchema (zod) — enforces #RRGGBB color format
 * and lowercase icon id, closing the XSS-via-color injection vector in iconSvg().
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

  const parsed = validateBody(createCategorySchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const data = parsed.data;

  const cat = await db.mapCategory.upsert({
    where: { id: data.id },
    update: { name: data.name, color: data.color, icon: data.icon },
    create: { id: data.id, name: data.name, color: data.color, icon: data.icon },
  });
  return NextResponse.json(cat, { status: 201 });
}
