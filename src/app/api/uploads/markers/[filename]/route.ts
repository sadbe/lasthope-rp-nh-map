import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// GET /api/uploads/markers/[filename] — serves uploaded marker images
// Next.js doesn't serve files dynamically added to /public during runtime,
// so we need this route to read the file from disk and return it with proper
// Content-Type headers.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Only allow safe filenames (no path traversal)
  if (!filename.match(/^marker_[a-f0-9]+\.(jpg|jpeg|png|webp|gif)$/i)) {
    return NextResponse.json({ error: 'invalid filename' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', 'markers', filename);

  try {
    const buffer = await readFile(filePath);

    // Determine Content-Type from extension
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const contentType = contentTypeMap[ext || ''] || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // cache for 1 day
      },
    });
  } catch {
    return NextResponse.json({ error: 'file not found' }, { status: 404 });
  }
}
