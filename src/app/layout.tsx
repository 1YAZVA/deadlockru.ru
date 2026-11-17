import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Deadlock//RU — глобальный портал: герои, предметы, патчи, лидерборд и мета",
  description:
    "Всё о Deadlock на русском: живой онлайн Steam, все герои и предметы, автопереваренные патчи Valve, лидерборды пяти регионов, киберспорт, мета-аналитика, сравнение героев и калькулятор билдов. Данные обновляются автоматически.",
  keywords: [
    "Deadlock", "Deadlock RU", "Дедлок", "герои Deadlock", "предметы Deadlock",
    "патчи Deadlock", "лидерборд Deadlock", "киберспорт Deadlock", "мета Deadlock",
    "Deadlock статистика", "Valve Deadlock",
  ],
  authors: [{ name: "Deadlock//RU" }],
  openGraph: {
    title: "Deadlock//RU — глобальный портал о Deadlock",
    description:
      "Герои, предметы, патчи, лидерборды, киберспорт и мета-аналитика. Всё обновляется автоматически.",
    siteName: "Deadlock//RU",
    type: "website",
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deadlock//RU",
    description: "Глобальный портал о Deadlock: герои, предметы, патчи, лидерборд, мета.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D1110",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Шрифты (Golos Text, Unbounded, Limelight) лежат в /public/fonts и подключены
            через @font-face в globals.css — без Google Fonts, чтобы сайт открывался
            из РФ без заблокированных/тормозящих внешних сервисов. */}
        <link rel="preload" href="/fonts/golos-text-400-normal-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/golos-text-600-normal-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/unbounded-700-normal-cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={`${"antialiased"} bg-background text-foreground`}>
        {/* Яндекс.Метрика (интерфейсная часть — сразу после открытия body) */}
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/114300683" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>
        {/* Яндекс.Метрика — id счётчика 114300683 */}
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`(function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=114300683', 'ym');

    ym(114300683, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});`}
        </Script>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
