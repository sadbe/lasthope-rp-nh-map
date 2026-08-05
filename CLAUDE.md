# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

LAST HOPE — интерактивная карта STALKER RP сервера в DayZ (карта мира NH ChernobylZone).
Публичная часть `/` — просмотр, `/admin` — редактирование точек. Точки общие: то, что
добавил один админ, через БД видят все.

Комментарии в коде и UI — на русском. Пишите так же.

## Команды

```bash
npm run dev            # dev-сервер на :3000, лог дублируется в dev.log
npm run build          # prisma generate && next build (типы и линт блокируют сборку)
npm run lint           # eslint .
npm run db:push        # prisma db push --accept-data-loss
npm run db:seed        # первый админ из ADMIN_EMAIL/ADMIN_PASSWORD (требует bun)
./scripts/smoke_test.sh  # curl-проверка публичных/защищённых роутов на localhost:3000
```

Автотестов в репозитории нет — `smoke_test.sh` единственная проверка, она гоняет
запущенный сервер curl'ом (коды ответов, редирект `/admin` → `/login`, логин-флоу).

Пакетный менеджер — npm (`package-lock.json`), но `db:seed` написан под `bun run`.

## Архитектура

### Состояние: один Zustand-стор, две поверхности рендера

`src/lib/zone-map-store.ts` (~635 строк) — единственный источник правды для карты.
`src/components/ZoneMapApp.tsx` (~1900 строк) — весь UI карты в одном файле: панели,
листы, тулбары, движок панорамы/зума, кластеризация. `/` и `/admin` рендерят **один и
тот же** `ZoneMapApp`, различаясь только `appMode` в сторе (`'viewer' | 'admin'`),
который выставляют `src/app/page.tsx` и `src/app/admin/AdminMapClient.tsx`.
Админские кнопки — это ветки `appMode === 'admin'` внутри ZoneMapApp, не отдельные
компоненты.

### Два независимых набора меток

- **preset** (`presetMarkers` / `presetCategories`) — статика из `public/assets/spawns.json`,
  выковырянная из файлов мода. Не редактируется, в БД не лежит.
- **user** (`markers` / `customCategories`) — в Postgres через `/api/markers` и
  `/api/categories`.

Они разделены намеренно: `loadFromServer()` перезаписывает `customCategories` ответом API
целиком, и при общем массиве категории миссии исчезали из-за гонки загрузок.
`allMarkers(preset, user)` склеивает их только для рендера.

Мутации в сторе **оптимистичные**: состояние меняется сразу, `fetch()` летит следом, при
ошибке предыдущее значение восстанавливается и уходит тост (`pushToast`). Не заменяйте
это на «дождаться ответа и потом обновить» — вся отзывчивость карты на этом держится.

### Системы координат — три штуки, их легко перепутать

| Что | Диапазон | Где живёт |
|---|---|---|
| Мировые DayZ (`x`, `z`) | 0…20480 м | `spawns.json`, подсказка метки |
| Проценты (`xPct`, `yPct`) | 0…100 | БД, API, стор — канонический формат |
| Сцена | 0…`STAGE_SIZE` (20000 px) | DOM-позиции меток |

Пересчёт мир → проценты: `xPct = X / worldSizeM * 100`, `yPct = 100 - Z / worldSizeM * 100`
(инверсия Y — в DayZ ось Z растёт на север, у картинки Y растёт вниз).

`mapWorldSizeM` (из `public/assets/map-meta.json`, сейчас 20480) — **не** то же самое, что
`mapImageWidth/Height`. Линейка (`calcDistances`) и радиусы зон считаются в метрах мира;
подстановка размера картинки в пикселях вместо метров — это баг, который здесь уже
чинили. `DEFAULT_WORLD_SIZE_M = 20480` — только начальное значение стора до того, как
загрузится `map-meta.json`; в расчётах используйте `mapWorldSizeM` из стора.

`map-meta.json` дополнительно несёт калибровку `offsetXPct/offsetYPct/scaleX/scaleY`,
которая применяется к preset-меткам в `loadPresetMarkers()` — подбирается на глаз, если
метки съехали относительно снимка.

### Движок карты

`MapEngine` в ZoneMapApp: панорама/зум трансформируют один родительский элемент, метки
лежат в координатах сцены и не перерендериваются при жестах. `MarkersLayer` обёрнут в
`React.memo` и перерисовывается только при смене набора видимых меток; иконки гасят
масштаб родителя через CSS-переменную `--inv`. Кластеризация — сетка с ячейкой
`CLUSTER_THRESHOLD / scaleStep`, кластеры получают `id` вида `cluster_*` и рендерятся
отдельной веткой. Обновления вида проходят через `requestAnimationFrame`.

Слои в панели группируются регулярками `LAYER_GROUP_DEFS` по **русскому названию**
категории; порядок правил значим (зомби проверяются раньше транспорта). 31 слой в
плоском списке нечитаем — отсюда группировка.

### Авторизация — три уровня, все нужны

1. `src/middleware.ts` — `withAuth` по matcher'у `/admin/*` и мутирующим `/api/*`;
   GET `/api/markers`, GET `/api/categories`, `/api/auth/*` пропускаются как публичные.
2. `src/app/admin/page.tsx` — Server Component, `getServerSession` до рендера клиента.
3. `requireAdmin()` из `src/lib/auth.ts` — **источник правды**, вызывается первой строкой
   каждого мутирующего route handler'а, возвращает либо объект юзера, либо готовый
   `NextResponse` 401/403:

```ts
const auth = await requireAdmin();
if (auth instanceof NextResponse) return auth;
```

Пароли — bcrypt-хэши в таблице `AdminUser`, NextAuth credentials provider, JWT-сессии
(8 часов), роли `admin`/`editor`.

### Валидация и санитизация

Каждый мутирующий эндпоинт валидируется zod-схемой из `src/lib/validation.ts` через
`validateBody()`. Регексы там не косметические: `color` обязан быть `#RRGGBB`, потому что
`iconSvg()` подставляет его прямо в строку SVG, которая рендерится через
`dangerouslySetInnerHTML`. `icon` ограничен `[a-z_]+` по той же причине.
`src/lib/sanitize.ts` — вторая линия для текста, идущего в HTML.

### Хранилище и данные

- Postgres через Prisma (`src/lib/db.ts`, singleton через `globalThis` для dev-hot-reload).
  В схеме три модели: `AdminUser`, `MapMarker`, `MapCategory`.
- Фото меток — Vercel Blob (`/api/upload`, проверка magic bytes + MIME, 5 МБ, имя файла
  генерируется на сервере). Файловая система на Vercel эфемерная, писать в `public/` нельзя —
  роут, читавший фото с диска, поэтому и удалён.
- В localStorage остаются только личные настройки: тема, выключенные слои, масштаб иконок,
  флаг просмотра интро. Метки в localStorage не кладём — это была исходная проблема
  проекта («никто не видит чужие точки»).

### Ассеты карты

`public/assets/`: `map-satellite.webp|jpg|png` (загрузчик пробует в этом порядке, webp
вдвое легче), `map-topo.*` (необязательно — без неё кнопка переключения слоёв не
появляется), `spawns.json`, `map-meta.json`. Заголовки кэша для `/assets/*` заданы в
`vercel.json` (JSON — must-revalidate, картинки — сутки).

Снимок карты — 8000×8000, 14,7 МБ в jpg и 9,2 МБ в webp. В git его когда-то уже
вычищали переписыванием истории, поэтому прежде чем коммитить что-то в `public/assets/`,
уточните, не должно ли оно жить в Vercel Blob.

## Что стоит знать

- ESLint-конфиг почти полностью отключён (`no-explicit-any`, `no-unused-vars`,
  `exhaustive-deps` и десятки других — `off`). При этом `next.config.ts` держит
  `ignoreBuildErrors: false` — **TypeScript-ошибки ломают сборку**, линт практически нет.
- **shadcn/ui в проекте нет.** Слой `src/components/ui/` удалён — им никто не пользовался.
  Вся вёрстка карты своя, на `globals.css` (~1600 строк) и инлайн-стилях; тосты — через
  `pushToast` в сторе. Не тащите сюда `cn()` и радиксы, не спросив.
- В `package.json` осталось около 60 зависимостей, реально импортируются 13. Чистка
  назрела, но ещё не сделана.
- Пять групп в `mapgroupproto.xml` мода содержат мировые координаты вместо локальных —
  лут оттуда спавнится за километры от здания (список в README).
- Деплой: `git push` в `main` → Vercel собирает автоматически. Подробности в `DEPLOY.md`.
- Python-скрипты сборки ассетов из README (`build_spawns_full.py`, `stitch_satmap.py`,
  `prepare_maps.py`) в репозитории отсутствуют — `.gitignore` вычищает `*.py`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
