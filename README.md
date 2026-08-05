# LAST HOPE — интерактивная карта

Карта STALKER RP сервера в DayZ, мир NH ChernobylZone. Живёт на
**[www.lhmap.ru](https://www.lhmap.ru)**.

На `/` игроки смотрят карту: 7778 точек в 31 слое — лут по типам зданий, зоны
спавна зомби, территории животных, — линейка с расстоянием в метрах, поиск,
координатная сетка. На `/admin` админы ставят свои точки: точки общие, что
добавил один, сразу видят все.

Next.js 16, React 19, Zustand, Prisma + PostgreSQL, NextAuth. Хостинг Vercel.

## Запуск

```bash
npm install
cp .env.example .env        # DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
npm run db:push             # создать таблицы
npm run db:seed             # первый админ из ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                 # :3000
```

## Дальше

| Куда | Зачем |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | как устроен код: стор, системы координат, тайлы, авторизация |
| [`docs/deploy.md`](docs/deploy.md) | развёртывание на Vercel с доменом |
| [`docs/mod-data.md`](docs/mod-data.md) | откуда взяты точки и снимок карты, особенности мода |
| [`CHANGELOG.md`](CHANGELOG.md) | что менялось |

Обновление сайта: `git push` в `main` — Vercel пересобирает и выкладывает сам.

Разработка карты — **[@corbinuwu](https://t.me/corbinuwu)**.
