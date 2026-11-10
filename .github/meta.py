"""Раз в день: тянем винрейты героев с api.deadlock-api.com в двух срезах —
общий (все ранги) и Этернус (высший ранг, tier 11 = бейдж 110–116).
Пишем data/meta.json в компактном виде, который читает вкладка «Мета»."""
import json
import re
import datetime
import urllib.parse
import urllib.request

BASE = "https://api.deadlock-api.com/v1"
WINDOW_DAYS = 30
# Этернус = tier 11, бейдж = tier * 10 + субтир (110..116)
ETERMIN_BADGE = 110
ETEMAX_BADGE = 116
MIN_OVERALL = 30   # матчей, чтобы герой попал в общий срез
MIN_ETER = 5       # матчей, чтобы герой попал в срез Этернуса


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "deadlockru-meta-bot"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def norm(name: str) -> str:
    """Lady Geist / lady-geist / LADY GEIST -> ladygeist"""
    return re.sub(r"[^a-z0-9]+", "", str(name).lower())


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")


def load_roster():
    """id героя на сайте -> нормализованное имя, для сопоставления с API."""
    with open("data/heroes.json", encoding="utf-8") as f:
        data = json.load(f)
    by_name = {}
    ids = []
    for h in data.get("heroes", []):
        hid = h.get("id")
        name = h.get("name")
        if not hid or not name:
            continue
        ids.append(hid)
        by_name[norm(name)] = hid
        by_name[norm(slugify(name))] = hid
    return ids, by_name


def hero_rows(extra: str):
    min_ts = int(datetime.datetime.now(datetime.timezone.utc).timestamp()) - WINDOW_DAYS * 86400
    q = {
        "match_mode": "ranked",
        "game_mode": "normal",
        "min_unix_timestamp": str(min_ts),
    }
    if extra:
        q.update(urllib.parse.parse_qsl(extra))
    url = f"{BASE}/analytics/hero-stats?{urllib.parse.urlencode(q)}"
    return fetch_json(url)


def main() -> None:
    ids, by_name = load_roster()

    assets = fetch_json(f"{BASE}/assets/heroes")
    api_name = {a["id"]: a.get("name") for a in assets if a.get("name")}

    overall = hero_rows("")
    eternus = hero_rows(f"min_average_badge={ETERMIN_BADGE}&max_average_badge={ETEMAX_BADGE}")

    def collect(rows):
        out = {}
        for r in rows:
            hid = r.get("hero_id")
            name = api_name.get(hid)
            if not name:
                continue
            site_id = by_name.get(norm(name)) or by_name.get(norm(slugify(name))) or slugify(name)
            matches = int(r.get("matches") or 0)
            wins = int(r.get("wins") or 0)
            if matches <= 0:
                continue
            out[site_id] = (matches, round(wins / matches * 100, 1))
        return out

    o = collect(overall)
    e = collect(eternus)

    heroes = {}
    for hid in ids:
        row = {}
        if hid in o and o[hid][0] >= MIN_OVERALL:
            row["wr"], row["matches"] = o[hid][1], o[hid][0]
        if hid in e and e[hid][0] >= MIN_ETER:
            row["wrE"], row["matchesE"] = e[hid][1], e[hid][0]
        if row:
            heroes[hid] = row

    # герои, которых нет в локальном ростере, но API их вернул — тоже сохраняем
    for hid, (matches, wr) in o.items():
        if hid in heroes or hid in ids or matches < MIN_OVERALL:
            continue
        row = {"wr": wr, "matches": matches}
        if hid in e and e[hid][0] >= MIN_ETER:
            row["wrE"], row["matchesE"] = e[hid][1], e[hid][0]
        heroes[hid] = row

    if not heroes:
        print("no data this run, keep old file")
        return

    data = {
        "updatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "windowDays": WINDOW_DAYS,
        "mode": "ranked",
        "source": "api.deadlock-api.com",
        "heroes": dict(sorted(heroes.items())),
    }
    with open("data/meta.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"written: {len(heroes)} heroes, overall={len(o)}, eternus={len(e)}")


if __name__ == "__main__":
    main()
