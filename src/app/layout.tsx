import type { Metadata, Viewport } from "next";
import { Oswald, Share_Tech_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import tileManifest from "../../public/assets/tiles/manifest.json";

// Шрифты кладутся в бандл и отдаются с нашего домена. Раньше здесь был
// <link rel="stylesheet"> на fonts.googleapis.com — обычный stylesheet
// блокирует первую отрисовку, а Google из России ходит как повезёт: то мгновенно,
// то в таймаут. Отсюда был белый экран на несколько секунд. Ни одного запроса
// к Google на странице больше нет, проверяйте это при правках.
//
// Кириллица нужна: интерфейс русский. У Share Tech Mono её нет вовсе (в данных
// next/font у него только latin), поэтому русский текст в моноширинных подписях
// падает на системный monospace — так было и раньше с Google Fonts, поведение
// не изменилось.
const oswald = Oswald({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const shareTechMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-share-tech-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});

// Тайлы базового уровня (z2, 16 штук, ~150 КБ) — тот самый фолбэк, который всегда
// смонтирован под детальным слоем. Без предзагрузки браузер узнаёт про них только
// после того, как разберёт JS и сходит за манифестом: HTML -> JS -> манифест ->
// тайлы, четыре последовательных круга до первой картинки. С <link rel="preload">
// они едут параллельно с JS.
//
// Манифест импортируется, а не читается через fs: путь к тайлам и baseZoom берутся
// из него же, ничего не захардкожено, и файл попадает в бандл — иначе на Vercel
// его не окажется рядом с серверной функцией.
const baseTileUrls: string[] = (() => {
  const level = tileManifest.levels.find(l => l.z === tileManifest.baseZoom);
  if (!level) return [];
  const urls: string[] = [];
  // x — колонка (запад->восток), y — строка (север->юг). Уровень квадратный,
  // поэтому cols годится и для строк.
  for (let y = 0; y < level.cols; y++) {
    for (let x = 0; x < level.cols; x++) {
      urls.push(`${tileManifest.basePath}/${tileManifest.baseZoom}/${x}_${y}.${tileManifest.format}`);
    }
  }
  return urls;
})();

export const metadata: Metadata = {
  title: "LAST HOPE // STALKER RP — DayZ Interactive Map",
  description: "Interactive map for Last Hope — Stalker RP server on DayZ. Anomalies, artifacts, faction bases, radiation zones, and more.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☠️</text></svg>",
  },
};

// Браузеру запрещено зумить страницу: два пальца идут в карту.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${oswald.variable} ${shareTechMono.variable} ${inter.variable}`}
    >
      <head>
        {baseTileUrls.map(href => (
          <link key={href} rel="preload" as="image" href={href} />
        ))}
      </head>
      <body className="zone-app">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
