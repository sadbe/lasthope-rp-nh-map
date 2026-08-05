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
npm run db:seed        # первый админ из ADMIN_EMAIL/ADMIN_PASSWORD
npm run tiles          # нарезать пирамиду тайлов из map-full.jpg
./scripts/smoke_test.sh  # curl-проверка публичных/защищённых роутов на localhost:3000
```

Автотестов в репозитории нет — `smoke_test.sh` единственная проверка, она гоняет
запущенный сервер curl'ом (коды ответов, редирект `/admin` → `/login`, логин-флоу).

Пакетный менеджер — npm, bun больше не нужен нигде. Оба скрипта в `scripts/` имеют
расширение `.mts` и запускаются голым `node`: Node 24 стирает типы сам.

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

`public/assets/`: `tiles/` (пирамида, см. ниже), `spawns.json`, `map-meta.json`,
`map-topo.*` (необязательно — без неё кнопка переключения слоёв не появляется).

Заголовки кэша заданы в `vercel.json`. **Порядок правил там значим: при совпадении
нескольких побеждает последнее.** На этом уже обжигались — правило `must-revalidate`
для `.json` стояло первым, его перекрывал общий `/assets/(.*)`, и `spawns.json`
реально отдавался с суточным кэшем.

**Комментариев в `vercel.json` быть не может.** Vercel валидирует файл по строгой схеме,
и любой посторонний ключ — включая приём с `"//"` — роняет деплой на этапе валидации:
статус Error, `Builds [0ms]`, логов нет вообще, потому что сборка не стартовала. Тоже
уже ловили. Объяснения к правилам держите здесь, а не в конфиге.

### Пирамида тайлов и исходник

Карта рисуется тайлами 256×256, а не одной картинкой: снимок целиком — это 9,2 МБ и
секунд двадцать белого экрана на телефоне. Пирамида отдаёт только видимое — 150 КБ на
первом экране.

**Исходник `map-full.jpg` (8000×8000, 14,7 МБ) намеренно вне git** и прописан в
`.gitignore` явной строкой. Историю репозитория из-за него уже один раз переписывали,
второй раз не надо. Лежит в корне рабочей копии; если его там нет — спросите у
[@corbinuwu](https://t.me/corbinuwu), восстановить из git нельзя.

Пересборка пирамиды:

```bash
node scripts/build-tiles.mts                      # 1365 тайлов, 11,4 МБ, ~20 с
node scripts/build-tiles.mts --version v2         # перенарезка = НОВАЯ версия
```

Скрипт на TypeScript и запускается голым `node` — **Node 24 стирает типы сам**, bun и
tsx не нужны (расширение `.mts`, иначе Node ругается на отсутствие `"type": "module"`).

Устройство:

- Уровни `z0..z5`, у `z5` натуральные 8000 px. Исходник не растягивается до степени
  двойки — краевые тайлы неполные, и это норма.
- Имя тайла `tiles/<version>/{z}/{x}_{y}.webp`, где **`x` — колонка (запад→восток),
  `y` — строка (север→юг)**. Записано ещё и в манифесте: на этой неоднозначности уже
  ломалась склейка тайлов мода, перепутаете — карта выйдет транспонированной.
- `tiles/manifest.json` — переключатель версий, отдаётся с `must-revalidate`. Сами
  тайлы кэшируются на год как `immutable`, поэтому **перезаписывать их на месте
  нельзя**: у клиентов останутся старые. Перенарезка — новый каталог `v2` плюс новый
  `version` в манифесте.
- В коде ничего из этого не захардкожено: `TileLayer` читает манифест и подстроится под
  другой размер тайла или число уровней.
- Фолбэк — уровень `baseZoom` (z2, 16 тайлов, 150 КБ). Он всегда смонтирован под
  детальным слоем, поэтому при недогрузе видно мыло, а не белый экран. Полноразмерного
  снимка для этого не нужно.

## Что стоит знать

- ESLint-конфиг почти полностью отключён (`no-explicit-any`, `no-unused-vars`,
  `exhaustive-deps` и десятки других — `off`). При этом `next.config.ts` держит
  `ignoreBuildErrors: false` — **TypeScript-ошибки ломают сборку**, линт практически нет.
- **shadcn/ui в проекте нет.** Слой `src/components/ui/` удалён — им никто не пользовался.
  Вся вёрстка карты своя, на `globals.css` (~1600 строк) и инлайн-стилях; тосты — через
  `pushToast` в сторе. Не тащите сюда `cn()` и радиксы, не спросив.
- Зависимости вычищены до 10 рантаймовых и 10 dev. Наследство шаблона — 27 пакетов
  Radix, dnd-kit, mdxeditor, recharts, framer-motion и прочее — удалено, ни один из них
  нигде не импортировался. Прежде чем добавлять пакет, посмотрите, не решается ли это
  своим CSS: вёрстка здесь ручная.
- **Tailwind остался, но только ради preflight.** Утилитарных классов в разметке нет,
  все имена свои (`zone-app`, `intro-title`). `globals.css` тянет `@import "tailwindcss"`,
  и убирать его нельзя: на сброс стилей завязана вся вёрстка. `tailwind.config.ts` удалён —
  в Tailwind v4 он не читается без директивы `@config`, а его `content`-глоба указывали
  на несуществующие `./app` и `./components`.
- Пять групп в `mapgroupproto.xml` мода содержат мировые координаты вместо локальных —
  лут оттуда спавнится за километры от здания. Список и остальные особенности мода —
  в `docs/mod-data.md`.
- Деплой: `git push` в `main` → Vercel собирает автоматически. Подробности в
  `docs/deploy.md`.
- Python-скрипты сборки ассетов (`build_spawns_full.py`, `stitch_satmap.py`,
  `prepare_maps.py`) в репозитории отсутствуют — `.gitignore` вычищает `*.py`.
  Что они делали, описано в `docs/mod-data.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
