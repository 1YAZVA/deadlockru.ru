"use client";

/** Футер: соцсети, обратная связь, юрблок — возрастная маркировка 18+ (436-ФЗ),
 *  модальная политика конфиденциальности (152-ФЗ), атрибуция источников данных. */
import { useEffect, useState } from "react";
import { Telegram } from "./icons";

const POLICY_TEXT: { h: string; p: string }[] = [
  {
    h: "1. Общие положения",
    p: "Настоящая политика описывает порядок обращения с информацией на сайте deadlockru.ru (далее — Сайт). Сайт является неофициальным информационным ресурсом сообщества об игре Deadlock, не требует регистрации и не создаёт учётных записей пользователей.",
  },
  {
    h: "2. Персональные данные",
    p: "Сайт не запрашивает и не хранит на своих серверах персональные данные: при обычном использовании имя, телефон, адрес электронной почты на сервер не передаются. В браузере пользователя (localStorage) хранятся только сервисные настройки — рекорды квиза и рулетки, состояние звука. Эти данные не покидают устройство и могут быть удалены очисткой данных сайта в браузере в любой момент.",
  },
  {
    h: "3. Данные игроков из открытых источников",
    p: "Никнеймы, ранги и статистика матчей в разделах «Лидерборд» и «Аккаунт» получены из открытых официальных источников: официального рейтинга игры Deadlock, Steam Web API и открытой базы deadlock-api.com. Сайт отображает только общедоступные сведения и не объединяет их с иными данными, а также не публикует сведения, скрытые их владельцами в источниках.",
  },
  {
    h: "4. Cookies и сторонние сервисы",
    p: "Сайт не использует рекламные и аналитические счётчики. Встроенный видеоплеер VK может устанавливать собственные файлы cookie и обрабатывать данные в соответствии с политикой VK. Переходы по внешним ссылкам (Steam, Telegram, Discord, Liquipedia и другие) происходят на условиях соответствующих ресурсов.",
  },
  {
    h: "5. Обращения пользователей",
    p: "Электронная почта deadlockru.ru@gmail.com используется исключительно для получения и ответа на обращения пользователей. Содержание переписки третьим лицам не передаётся и публично не публикуется.",
  },
  {
    h: "6. Правообладатели",
    p: "Сайт не аффилирован с Valve Corporation. Deadlock и связанные с ним материалы — торговые марки и объекты авторского права Valve. Изображения и данные используются в информационных целях некоммерческим сообществным проектом с указанием источников. Данные киберспортивной сцены — Liquipedia (лицензия CC BY-SA) и collegedeadlock.com; шрифты сайта распространяются по лицензии SIL Open Font License (см. public/fonts/FONTS-LICENSE.txt).",
  },
  {
    h: "7. Изменения политики",
    p: "Актуальная редакция политики всегда доступна на этой странице. Дата последнего обновления: 16.11.2026.",
  },
];

export function SiteFooter({ lastSyncAt }: { lastSyncAt: string | null }) {
  const [policyOpen, setPolicyOpen] = useState(false);

  // Esc закрывает политику, при открытой модалке страница не скроллится
  useEffect(() => {
    if (!policyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPolicyOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [policyOpen]);

  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-[var(--panel2)]">
      {/* внутренние паддинги шире стандартного контейнера — текст не прилипает к краю экрана */}
      <div className="container-dl grid gap-8 px-6 py-10 md:grid-cols-3 md:px-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold uppercase tracking-[0.14em]">
              Deadlock<span className="text-[var(--accent)]">{"//"}</span>RU
            </span>
            {/* возрастная маркировка информационной продукции — ФЗ-436 */}
            <span className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[var(--muted2)]" title="Возрастная категория 18+">
              18+
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <a
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              href="https://t.me/deadlockru"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram-канал"
            >
              <Telegram className="h-4 w-4" />
            </a>
            <a
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              href="https://discord.gg/gvMFxV5jqM"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord-сервер"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.291.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
            <a
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              href="mailto:deadlockru.ru@gmail.com"
              aria-label="Почта — по всем вопросам"
              title="deadlockru.ru@gmail.com"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2.5" y="5" width="19" height="14" rx="2" />
                <path d="M3.5 6.5L12 13l8.5-6.5" />
              </svg>
            </a>
            <span className="text-xs text-[var(--muted2)]">Новости и анонсы — в каналах; почта — по всем вопросам</span>
          </div>
        </div>

        <nav className="flex flex-col gap-2 text-sm text-[var(--muted2)]" aria-label="Ссылки">
          <a href="mailto:deadlockru.ru@gmail.com" className="transition-colors hover:text-[var(--ink)]">Обратная связь: deadlockru.ru@gmail.com</a>
          <a href="https://steamdb.info/app/1422450/charts/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--ink)]">Онлайн в Steam ↗</a>
          <a href="https://www.playdeadlock.com" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--ink)]">Официальный сайт игры ↗</a>
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            className="w-fit text-left underline decoration-[var(--line)] underline-offset-4 transition-colors hover:text-[var(--ink)]"
          >
            Политика конфиденциальности
          </button>
          <span className="text-xs">
            {lastSyncAt
              ? `Последняя синхронизация данных: ${new Date(lastSyncAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : "Данные синхронизируются автоматически"}
          </span>
        </nav>

        <div className="text-xs leading-relaxed text-[var(--muted2)]">
          <p className="mb-1">
            <b className="text-[var(--ink)]">DeadlockRU</b> © 2026 · <span className="font-bold tracking-wide text-[var(--ink)]">18+</span> — материалы сайта
            описывают игру, содержащую сцены насилия, и предназначены для совершеннолетних
          </p>
          <p className="mb-1">Сайт не аффилирован с Valve</p>
          <p>
            Все материалы носят информационный характер и являются мнением авторов. Deadlock и все связанные
            материалы — торговые марки Valve Corporation. Данные: deadlock-api.com, Steam Web API, Steam RSS,
            Liquipedia (CC BY-SA), collegedeadlock.com, коллективные данные сообщества. По всем вопросам и
            предложениям — пишите на почту{" "}
            <a href="mailto:deadlockru.ru@gmail.com" className="whitespace-nowrap text-[var(--accent)] transition-colors hover:text-[var(--ink)]">deadlockru.ru@gmail.com</a>.
          </p>
        </div>
      </div>

      {/* Политика конфиденциальности — модальное окно */}
      {policyOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[rgba(8,10,9,0.78)] p-4 backdrop-blur-sm md:p-8"
          onClick={() => setPolicyOpen(false)}
          role="presentation"
        >
          <div
            className="card-dl my-4 w-full max-w-[760px] bg-[var(--panel)]"
            role="dialog"
            aria-modal="true"
            aria-label="Политика конфиденциальности"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-4">
              <div>
                <h2 className="font-display text-lg font-bold">Политика конфиденциальности</h2>
                <p className="mt-0.5 text-xs text-[var(--muted2)]">deadlockru.ru · неофициальный информационный проект сообщества</p>
              </div>
              <button
                type="button"
                onClick={() => setPolicyOpen(false)}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
                aria-label="Закрыть политику конфиденциальности"
              >
                Закрыть
              </button>
            </div>
            <div className="max-h-[62vh] overflow-y-auto px-6 py-4">
              {POLICY_TEXT.map((s) => (
                <div key={s.h} className="mb-4">
                  <h3 className="mb-1.5 text-sm font-bold text-[var(--accent)]">{s.h}</h3>
                  <p className="text-[13px] leading-relaxed text-[var(--muted2)]">{s.p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </footer>
  );
}
