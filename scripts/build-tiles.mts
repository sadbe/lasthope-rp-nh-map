/**
 * Нарезка снимка карты в пирамиду тайлов.
 *
 *   node scripts/build-tiles.mts
 *   node scripts/build-tiles.mts --src map-full.jpg --version v2 --quality 80
 *
 * Node 24 исполняет TypeScript напрямую (стирание типов), bun и tsx не нужны.
 *
 * ЗАЧЕМ. Снимок 8000×8000 весит 9,2 МБ в webp и грузится целиком одной
 * картинкой — на телефоне это секунд двадцать белого экрана до первого
 * пикселя. Пирамида отдаёт только то, что реально видно: при вписанной в
 * экран карте это один тайл на 10 КБ.
 *
 * ОСИ. Имя тайла — {z}/{x}_{y}.webp, где x это КОЛОНКА (запад→восток),
 * а y это СТРОКА (север→юг). Записано и здесь, и в манифесте, потому что
 * на ровно этой неоднозначности (`S_012_034` — строка или колонка?) уже
 * ломалась склейка тайлов мода: перепутаешь — карта выйдет
 * транспонированной, и понятно это станет не сразу.
 *
 * ВЕРСИОНИРОВАНИЕ ПУТЁМ. Тайлы лежат в tiles/<version>/ и раздаются с
 * immutable-кэшем на год: перезаписывать их на месте нельзя, у клиентов
 * останутся старые. Перенарезка — это НОВАЯ версия (--version v2), после
 * которой манифест начинает указывать на неё. Манифест лежит по
 * постоянному пути и отдаётся с must-revalidate, он и есть переключатель.
 */

import sharp from 'sharp';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

interface Level {
  z: number;
  /** Сторона карты на этом уровне в пикселях. */
  size: number;
  /** Тайлов по стороне. Краевые тайлы неполные — это норма. */
  cols: number;
  tiles: number;
}

interface Manifest {
  version: string;
  basePath: string;
  format: 'webp';
  tileSize: number;
  nativeSize: number;
  minZoom: number;
  maxZoom: number;
  /** Уровень постоянной подложки: грузится целиком сразу и никогда не снимается. */
  baseZoom: number;
  axis: string;
  levels: Level[];
  generatedAt: string;
  quality: number;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SRC = arg('src', 'map-full.jpg');
const VERSION = arg('version', 'v1');
const TILE = Number(arg('tile', '256'));
const QUALITY = Number(arg('quality', '80'));
const BASE_ZOOM = Number(arg('base-zoom', '2'));
const OUT_ROOT = arg('out', 'public/assets/tiles');

const OUT_DIR = path.join(OUT_ROOT, VERSION);
const MANIFEST_PATH = path.join(OUT_ROOT, 'manifest.json');

/** Сколько тайлов кодируется одновременно. Sharp считает в своём пуле потоков. */
const CONCURRENCY = 16;

async function main() {
  const meta = await sharp(SRC, { limitInputPixels: false }).metadata();
  const native = meta.width ?? 0;

  if (!native || native !== meta.height) {
    throw new Error(`ожидался квадратный снимок, получено ${meta.width}×${meta.height}`);
  }

  // Верхний уровень — тот, где карта лежит в натуральном разрешении.
  // Каждый следующий вниз вдвое мельче. Исходник НЕ растягиваем до
  // степени двойки: 8000 не делится на 256 нацело, но лучше неполные
  // краевые тайлы, чем пересэмплинг всего снимка ради круглого числа.
  const maxZoom = Math.ceil(Math.log2(native / TILE));

  const levels: Level[] = [];
  for (let z = 0; z <= maxZoom; z++) {
    const size = Math.round(native / 2 ** (maxZoom - z));
    const cols = Math.ceil(size / TILE);
    levels.push({ z, size, cols, tiles: cols * cols });
  }

  const total = levels.reduce((a, l) => a + l.tiles, 0);
  console.log(`исходник: ${SRC} — ${native}×${native}`);
  console.log(`уровней: ${maxZoom + 1} (z0..z${maxZoom}), тайлов: ${total}, качество webp: ${QUALITY}`);
  console.log(`каталог: ${OUT_DIR}\n`);

  // Каталог версии сносим целиком: иначе после перенарезки с другим
  // размером тайла останутся файлы от прошлой сетки, и загрузчик получит
  // мешанину из двух пирамид.
  await rm(OUT_DIR, { recursive: true, force: true });

  let written = 0;
  let bytes = 0;

  for (const level of levels) {
    await mkdir(path.join(OUT_DIR, String(level.z)), { recursive: true });

    // Уровень готовим ОДИН раз в сырых пикселях. Резать тайлы прямо из
    // JPEG нельзя: sharp декодировал бы весь прогрессивный снимок заново
    // на каждый из 1024 тайлов верхнего уровня.
    const pipeline = sharp(SRC, { limitInputPixels: false });
    if (level.size !== native) pipeline.resize(level.size, level.size, { kernel: 'lanczos3' });
    const raw = await pipeline.removeAlpha().raw().toBuffer();
    const channels = 3;

    const jobs: { x: number; y: number; w: number; h: number }[] = [];
    for (let y = 0; y < level.cols; y++) {
      for (let x = 0; x < level.cols; x++) {
        jobs.push({
          x, y,
          w: Math.min(TILE, level.size - x * TILE),
          h: Math.min(TILE, level.size - y * TILE),
        });
      }
    }

    let levelBytes = 0;
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const sizes = await Promise.all(batch.map(async (j) => {
        const buf = await sharp(raw, { raw: { width: level.size, height: level.size, channels } })
          .extract({ left: j.x * TILE, top: j.y * TILE, width: j.w, height: j.h })
          .webp({ quality: QUALITY, effort: 4 })
          .toBuffer();
        // {x}_{y}: x — колонка, y — строка. См. шапку файла.
        await writeFile(path.join(OUT_DIR, String(level.z), `${j.x}_${j.y}.webp`), buf);
        return buf.length;
      }));
      levelBytes += sizes.reduce((a, b) => a + b, 0);
      written += batch.length;
    }

    bytes += levelBytes;
    console.log(
      `  z${level.z}  ${String(level.size).padStart(4)}px  ${level.cols}×${level.cols}` +
      `  ${String(level.tiles).padStart(4)} тайлов  ${(levelBytes / 1048576).toFixed(2)} МБ`,
    );
  }

  const manifest: Manifest = {
    version: VERSION,
    basePath: `/assets/tiles/${VERSION}`,
    format: 'webp',
    tileSize: TILE,
    nativeSize: native,
    minZoom: 0,
    maxZoom,
    baseZoom: Math.min(BASE_ZOOM, maxZoom),
    axis: 'x = колонка, запад→восток; y = строка, север→юг',
    levels,
    generatedAt: new Date().toISOString(),
    quality: QUALITY,
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\nготово: ${written} тайлов, ${(bytes / 1048576).toFixed(1)} МБ`);
  console.log(`манифест: ${MANIFEST_PATH} → ${manifest.basePath}`);
}

main().catch((err) => {
  console.error('нарезка не удалась:', err instanceof Error ? err.message : err);
  process.exit(1);
});
