import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/auth';

/**
 * POST /api/upload — приём фото для точки. Admin-only.
 *
 * ПОЧЕМУ НЕ ФАЙЛОВАЯ СИСТЕМА:
 * Раньше файл писался в public/uploads/markers/. На Vercel (и на любом
 * serverless-хостинге) файловая система эфемерная — после каждого деплоя
 * или перезапуска контейнера всё записанное исчезает. Загруженные фото
 * пропадали бы молча. Поэтому используем Vercel Blob — объектное
 * хранилище, которое отдаёт постоянные публичные URL.
 *
 * ПОБОЧНО ЧИНИТ БАГ: старый роут возвращал ОТНОСИТЕЛЬНЫЙ путь
 * (/api/uploads/markers/xxx.jpg), а validation.ts требует
 * z.string().url(), который относительные пути не принимает. То есть
 * сохранение точки с фото падало с 400. Blob отдаёт абсолютный URL,
 * и проверка проходит.
 *
 * Переменная окружения BLOB_READ_WRITE_TOKEN подставляется Vercel
 * автоматически, когда к проекту подключено Blob-хранилище.
 */

// Расширение берём из проверенного сервером MIME-типа, никогда из
// file.name — тот полностью контролируется отправителем.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_SIZE = 5 * 1024 * 1024; // 5 МБ

// Заявленный Content-Type — просто строка от клиента, подделывается
// тривиально. Сверяем реальные первые байты файла.
function hasValidMagicBytes(buffer: Buffer, mime: string): boolean {
  const b = buffer;
  switch (mime) {
    case 'image/jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/gif':
      return b.length >= 4 && b.subarray(0, 4).toString('ascii') === 'GIF8';
    case 'image/webp':
      return b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'хранилище не настроено: подключите Vercel Blob и добавьте BLOB_READ_WRITE_TOKEN' },
      { status: 500 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'файл не передан' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'допустимы только изображения (jpeg/png/webp/gif)' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'максимальный размер файла — 5 МБ' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasValidMagicBytes(buffer, file.type)) {
      return NextResponse.json({ error: 'содержимое файла не соответствует заявленному типу' }, { status: 400 });
    }

    // Имя генерируется целиком на сервере — ничего из клиентского ввода.
    const filename = `markers/marker_${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ imageUrl: blob.url }, { status: 201 });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'не удалось загрузить файл' }, { status: 500 });
  }
}
