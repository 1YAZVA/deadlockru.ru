// Cloudflare Worker — свой CORS-прокси к deadlock-api.com на СВОЁМ домене.
// Когда он развёрнут и привязан к маршруту deadlockru.ru/dlapi/*, сайт deadlockru.ru
// начинает использовать его автоматически (маршрут №0 в js/app.js, DL_ROUTES[0]) —
// самый надёжный путь из РФ, публичные прокси становятся не нужны.
//
// КАК РАЗВЕРНУТЬ (5 минут):
// 1. dash.cloudflare.com → ваш домен deadlockru.ru (DNS уже в Cloudflare).
// 2. Слева «Workers & Pages» → Create → Create Worker → имя например «dlapi» → Deploy.
// 3. «Edit code» — вставить ВЕСЬ этот файл вместо шаблона → Deploy.
// 4. У воркера: Settings → Domains & Routes → Add → Route:
//        deadlockru.ru/dlapi*     (зона deadlockru.ru)
//    или Custom Domain: dlapi.deadlockru.ru (тогда в app.js маршрут №0 поправить на этот домен).
// 5. Готово: на сайте маршрут /dlapi/ перестанет отдавать 404 и начнёт отвечать.
//
// Безопасность: воркер пропускает только запросы к api.deadlock-api.com/v1/* —
// чужой открытый релей через ваш домен сделать не получится.

const ALLOWED = /^https:\/\/api\.deadlock-api\.com\/v1\//;

export default {
  async fetch(request) {
    // CORS-префлайт
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    const u = new URL(request.url);
    if (!u.pathname.startsWith('/dlapi')) return new Response('not found', { status: 404 });
    const target = u.searchParams.get('url');
    if (!target || !ALLOWED.test(target)) return new Response('bad url', { status: 400 });

    // кэш на edge на 2 минуты: повторные запросы одного профиля не бьют по API
    const upstream = await fetch(target, {
      cf: { cacheTtl: 120, cacheEverything: true },
      headers: { 'Accept': 'application/json' },
    });
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Expose-Headers', '*');
    headers.delete('content-encoding'); // воркер отдаёт уже разжатое
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
