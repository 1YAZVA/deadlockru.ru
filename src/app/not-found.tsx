import Link from "next/link";

const LINKS = [
  { href: "/", title: "Главная", desc: "Онлайн Steam, мета, лидерборд и статистика игроков" },
  { href: "/heroes/", title: "Все герои", desc: "42 персонажа: статы, роли, лор и винрейт" },
  { href: "/items/", title: "Все предметы", desc: "Магазин: тиры, цены, свойства и винрейт покупки" },
  { href: "/patches/", title: "Патчи и обновления", desc: "Официальные новости Valve на русском" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(13,17,16,0.9)] backdrop-blur-md">
        <div className="container-dl flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="whitespace-nowrap font-display text-[15px] font-bold uppercase tracking-[0.14em]"
              aria-label="Deadlock//RU — на главную"
            >
              Deadlock<span className="text-[var(--accent)]">{"//"}</span>RU
            </Link>
            {/* возрастная маркировка — ФЗ-436, на каждой странице */}
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-black text-[9px] font-bold leading-none text-white"
              title="18+ — информация для совершеннолетних"
              role="img"
              aria-label="Возрастная категория 18+"
            >
              18+
            </span>
          </div>
          <Link href="/" className="text-sm text-[var(--accent)]">
            На портал
          </Link>
        </div>
      </header>

      <main className="container-dl flex-1 py-16">
        <p className="font-display text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">Ошибка 404</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">Страница не найдена</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted2)]">
          Похоже, ссылка устарела или в адресе опечатка. Данные Deadlock никуда не пропали — выберите раздел ниже
          или начните с главной: там живой онлайн Steam, мета, лидерборд и статистика аккаунта.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group card-dl block p-4 transition-colors hover:border-[var(--accent)]"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-display text-base font-bold group-hover:text-[var(--accent)]">{l.title}</span>
                <span aria-hidden className="text-[var(--accent)] transition-transform group-hover:translate-x-0.5">→</span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-[var(--muted2)]">{l.desc}</span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs text-[var(--muted2)]">
          Ищете конкретного героя или предмет? Воспользуйтесь поиском на главной — он ищет по всему каталогу.
        </p>
      </main>

      <footer className="border-t border-[var(--line)] py-6">
        <div className="container-dl flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted2)]">
          <span>Deadlock//RU — неофициальный фан-портал. Deadlock и все материалы принадлежат Valve Corporation.</span>
          <Link href="/" className="text-[var(--accent)] hover:text-[var(--ink)]">
            deadlockru.ru
          </Link>
        </div>
      </footer>
    </div>
  );
}
