"use client";

/**
 * Раздел «Профиль»: статистика аккаунта Deadlock по нику, ссылке на профиль
 * Steam или Steam ID. Все внешние запросы идут через серверный прокси
 * /api/player — работает из любых сетей, включая РФ.
 */
import { useCallback, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { HeroRow } from "@/lib/site";
import { fmtInt, viaImgProxy, rankLocalIcon, RANK_NAMES, RANK_ROMAN, RANK_TIER_COLORS, HERO_TYPE_RU, STATIC_MODE, REMOTE_API } from "@/lib/site";
import { HeroIcon, SectionHeader } from "./shared";

type ResolveResponse = {
  accountId?: number;
  profile?: {
    account_id: number; personaname?: string; realname?: string; avatarfull?: string;
    profileurl?: string; countrycode?: string; matches_played_last_30d?: number;
  } | null;
  rank?: { tier: number; subrank: number; badge: number } | null;
  resolvedBy?: string;
  error?: string;
  mode?: "candidates";
  candidates?: { account_id: number; personaname?: string; avatarmedium?: string; matches_played_last_30d?: number }[];
  query?: string;
  plural?: string;
};

type StatsResponse = {
  accountId: number;
  tiles: { n: string; t: string; s?: string; hot?: boolean; cls?: string }[];
  rankMovement: number[];
  historyRows: { matchId: number; heroId: number; date: string; outcome: "w" | "l" | "u"; kda: string; souls: number; duration: string; delta: number | null }[];
  favHeroes: { heroId: number; matches: number; wr: number; soulsPerMin: number }[];
  bestHeroes: { heroId: number; matches: number; wr: number; soulsPerMin: number }[];
  heroesWithStats: number;
  error?: string;
};

function Spark({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return null;
  const w = 600, h = 76, pad = 8;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min;
  const pts = vals
    .map((v, i) => [
      (pad + (i * (w - 2 * pad)) / (vals.length - 1)).toFixed(1),
      (h - pad - (span ? (v - min) / span : 0.5) * (h - 2 * pad)).toFixed(1),
    ].join(","))
    .join(" ");
  return (
    <svg className="sp-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AccountSection({ heroes }: { heroes: HeroRow[] }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [candidates, setCandidates] = useState<NonNullable<ResolveResponse["candidates"]>>([]);
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const heroById = useCallback((id: number) => heroes.find((h) => h.id === id), [heroes]);

  // в статике моторчик «Аккаунта» живёт на бесплатной функции Яндекс.Облака (NEXT_PUBLIC_API_BASE)
  const remote = STATIC_MODE ? REMOTE_API : "";
  // Прямые вызовы functions.yandexcloud.net/<id> не поддерживают подпути —
  // в статике путь функции роутим через query-параметр ?path=/api/player.
  const playerEp = (qs: string) =>
    STATIC_MODE ? `${remote}?path=/api/player&${qs}` : `${remote}/api/player?${qs}`;

  const showPlayer = useCallback(async (accountId: number) => {
    setLoading(true);
    setMsg({ text: "Загружаю профиль и ранг…" });
    setCandidates([]);
    setStats(null);
    try {
      const r = await fetch(playerEp(`phase=resolve&account_id=${accountId}`), { cache: "no-store" });
      const d = (await r.json()) as ResolveResponse;
      if (!r.ok || d.error) {
        setMsg({ text: d.error ?? "Профиль не найден", err: true });
        setResolved(null);
        return;
      }
      setResolved(d);
      setMsg(null);
      // фаза 2: считаем матчей и героев независимо от шапки
      fetch(playerEp(`phase=stats&account_id=${accountId}`), { cache: "no-store" })
        .then(async (r2) => {
          const d2 = (await r2.json()) as StatsResponse;
          if (!r2.ok || d2.error) {
            setMsg({ text: d2.error ?? "Статистика недоступна", err: true });
            return;
          }
          setStats(d2);
        })
        .catch(() => setMsg({ text: "Статистика не загрузилась — повтори поиск", err: true }));
    } catch {
      setMsg({ text: "Сервер не ответил — попробуй ещё раз", err: true });
    } finally {
      setLoading(false);
    }
  }, []);

  const lookup = useCallback(async (raw: string) => {
    const s = raw.trim();
    if (!s) {
      setMsg({ text: "Введи никнейм, ссылку на профиль Steam или Steam ID.", err: true });
      return;
    }
    setLoading(true);
    setMsg({ text: "Ищу игрока…" });
    setResolved(null);
    setStats(null);
    setCandidates([]);
    try {
      const r = await fetch(playerEp(`phase=resolve&input=${encodeURIComponent(s)}`), { cache: "no-store" });
      const d = (await r.json()) as ResolveResponse;
      if (!r.ok || d.error) {
        setMsg({ text: d.error ?? "Не удалось выполнить поиск", err: true });
        return;
      }
      if (d.mode === "candidates") {
        if (!d.candidates?.length) {
          setMsg({ text: `Никого не нашёл по «${d.query}». Введи Steam ID цифрами (узнать: steamid.io) или ссылку на профиль Steam.`, err: true });
          return;
        }
        setCandidates(d.candidates);
        setMsg({ text: `Нашёл ${d.candidates.length} ${d.plural} — выбери свой аккаунт:` });
        return;
      }
      setMsg(null);
      setResolved(d);
      if (d.accountId != null) await showPlayer(d.accountId);
    } catch {
      setMsg({ text: "Сервер не ответил — попробуй ещё раз", err: true });
    } finally {
      setLoading(false);
    }
  }, [showPlayer]);

  const rank = resolved?.rank ?? null;
  const rankName = rank ? `${RANK_NAMES[Math.min(11, rank.tier)]} ${RANK_ROMAN[Math.min(5, Math.max(0, rank.subrank - 1))]}` : null;
  const rankColor = rank ? RANK_TIER_COLORS[Math.min(11, rank.tier)] ?? "var(--accent)" : "var(--muted2)";
  const profile = resolved?.profile ?? null;

  const heroCard = (h: { heroId: number; matches: number; wr: number; soulsPerMin: number }) => {
    const hr = heroById(h.heroId);
    return (
      <div className="sp-hero" key={h.heroId}>
        <HeroIcon hero={hr ?? { name: "Герой", iconSmall: "", iconCard: "" }} size={40} rounded={9} />
        <span className="sp-hinfo">
          <b>{hr?.name ?? `Герой #${h.heroId}`}</b>
          <small>{fmtInt(h.matches)} матчей · {fmtInt(h.soulsPerMin)} душ/мин</small>
        </span>
        <span className="sp-hwr">
          {h.wr}%
          <small>винрейт</small>
        </span>
      </div>
    );
  };

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="Живая база матчей"
        title="Статистика аккаунта"
        lead="Введи никнейм, ссылку на профиль Steam или Steam ID — покажем ранг, винрейты по героям, историю матчей и движение по рангу. Данные из открытой базы deadlock-api.com через сервер сайта."
      />

      <div className="steam-search">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void lookup(input);
          }}
          placeholder="Никнейм · steamcommunity.com/id/... · steamcommunity.com/profiles/7656... · Steam ID"
          aria-label="Ник или ссылка на профиль Steam"
          disabled={loading}
        />
        <button type="button" onClick={() => void lookup(input)} disabled={loading}>
          <Search className="mr-1 inline h-4 w-4" aria-hidden />
          Найти
        </button>
      </div>
      <div className="steam-hint">
        <span>Например:</span>
        <button type="button" className="steam-example" onClick={() => { const v = "deadlock"; setInput(v); void lookup(v); }}>deadlock</button>
        <button type="button" className="steam-example" onClick={() => { const v = "https://steamcommunity.com/id/gabelogannewell"; setInput(v); void lookup(v); }}>steamcommunity.com/id/gabelogannewell</button>
      </div>

      {msg ? (
        <div className={`steam-msg ${msg.err ? "err" : ""}`} role="status">{msg.text}</div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="steam-cands">
          {candidates.map((c) => (
            <button
              key={c.account_id}
              type="button"
              className="steam-cand"
              onClick={() => void showPlayer(c.account_id)}
            >
              {c.avatarmedium ? (
                // аватарки Steam — через собственный прокси-кэш
                 
                <img src={viaImgProxy(c.avatarmedium)} alt="" width={40} height={40} className="rounded-lg border border-[var(--line)]" loading="lazy" />
              ) : (
                <span className="ava-letter">?</span>
              )}
              <span className="sp-hinfo">
                <b>{c.personaname}</b>
                <small>{fmtInt(c.matches_played_last_30d ?? 0)} матчей за 30 дней</small>
              </span>
              <span className="sp-hwr">
                ID
                <small>{c.account_id}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {resolved && profile !== undefined ? (
        <>
          <div className="sp-head fade-in">
            {profile?.avatarfull ? (
               
              <img className="sp-ava" src={viaImgProxy(profile.avatarfull)} alt={profile.personaname ?? ""} width={64} height={64} />
            ) : null}
            <span className="sp-who">
              <b>{profile?.personaname ?? `Аккаунт ${resolved.accountId}`}</b>
              <span className="sp-sub">
                {[profile?.realname, profile?.countrycode ? `Страна: ${profile.countrycode}` : "", `ID: ${resolved.accountId}`]
                  .filter(Boolean)
                  .join(" · ")}
                {resolved.resolvedBy === "vanity" ? " · найден по ссылке профиля" : ""}
              </span>
              {profile?.profileurl ? (
                <a className="sp-link" href={profile.profileurl} target="_blank" rel="noopener noreferrer">
                  Открыть в Steam <ExternalLink className="inline h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </span>
            <span className="sp-rank">
              {rank ? (
                 
                <img src={rankLocalIcon(rank.tier)} alt={rankName ?? ""} width={56} height={56} />
              ) : null}
              <span className="sp-tier">
                {rank ? <b style={{ color: rankColor }}>{rankName}</b> : <b>Ранг не определён</b>}
                <small>{rank ? `звание · бейдж ${rank.badge}` : "нет ранкед-матчей"}</small>
              </span>
            </span>
          </div>

          {loading && !stats ? (
            <div className="steam-msg mt-3">Считаю матчи, героев и историю… (история матчей весит ~2 МБ — это занимает несколько секунд)</div>
          ) : null}

          {stats ? (
            <div className="fade-in">
              <div className="sp-tiles">
                {stats.tiles.map((t) => (
                  <div key={t.t} className={`sp-tile ${t.hot ? "hot" : ""}`}>
                    <div className={`n ${t.cls ?? ""}`}>{t.n}</div>
                    <div className="t">{t.t}</div>
                    {t.s ? <div className="s">{t.s}</div> : null}
                  </div>
                ))}
              </div>

              {stats.rankMovement.length > 1 ? (
                <div className="sp-block">
                  <h3>Движение по рангу · последние {stats.rankMovement.length} ранкед-матчей</h3>
                  <Spark vals={stats.rankMovement} color={rankColor} />
                </div>
              ) : null}

              {stats.favHeroes.length > 0 ? (
                <div className="sp-block sp-heroes">
                  <div>
                    <h3>Любимые герои</h3>
                    <div className="grid gap-2">{stats.favHeroes.map(heroCard)}</div>
                  </div>
                  <div>
                    <h3>Лучшие по винрейту</h3>
                    <div className="grid gap-2">{stats.bestHeroes.map(heroCard)}</div>
                  </div>
                </div>
              ) : null}

              {stats.historyRows.length > 0 ? (
                <div className="sp-block">
                  <h3>История матчей · последние {stats.historyRows.length}</h3>
                  <div className="sp-hist">
                    {stats.historyRows.map((m) => {
                      const hr = heroById(m.heroId);
                      return (
                        <div key={m.matchId} className={`sp-match ${m.outcome}`}>
                          <HeroIcon hero={hr ?? { name: "Герой" }} size={34} rounded={8} />
                          <span className="sp-mhero">
                            <b>{hr?.name ?? `Герой #${m.heroId}`}</b>
                            <small>
                              {m.date} · {m.outcome === "w" ? "победа" : m.outcome === "l" ? "поражение" : "не учёт"}
                              {hr ? ` · ${HERO_TYPE_RU[hr.heroType]?.label ?? ""}` : ""}
                            </small>
                          </span>
                          <span className="sp-mkda"><b>{m.kda}</b> К/Д/П</span>
                          <span className="sp-msouls"><i className="soul-dot" />{fmtInt(m.souls)}</span>
                          <span className="sp-mdur">{m.duration}</span>
                          {m.delta != null ? (
                            <span className={`sp-mdelta ${m.delta >= 0 ? "up" : "down"}`}>
                              {m.delta >= 0 ? "+" : ""}{m.delta}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <p className="sp-note">
                Цифры — из открытой базы deadlock-api.com: в ней нет части матчей и исходов до сентября 2026,
                поэтому итоги могут быть меньше внутриигровых. «Часов в матчах» не включает время в меню и лобби.
                Данные кэшируются на 10 минут.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
