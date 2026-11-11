#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Обновляет data/live.json: текущий онлайн и пик Deadlock (appid 1422450).

Источники:
  1. store.steampowered.com/charts/mostplayed — живой онлайн (nConcurrentInGame)
     и пик за сутки (nPeakInGame) — основной источник (Valve закрыл отдельный API
     GetNumberOfCurrentPlayers для этой игры: он отвечает result=42 без данных).
  2. api.steampowered.com ISteamChartsService/GetMostPlayedGames — пик за сутки,
     запасной источник.

Правила записи:
  - если не удалось получить НИЧЕГО — файл не трогаем (старые данные честно
    останутся с прежней меткой времени, сайт покажет их как «данные на HH:MM»);
  - live может быть null — сайт тогда честно показывает пик с пометкой.
"""
import json
import datetime
import pathlib
import re
import urllib.request

APPID = 1422450
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "live.json"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) deadlockru-live-updater/1.0"}


def get(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def from_mostplayed():
    """Текущий онлайн + пик за сутки из страницы store.steampowered.com/charts/mostplayed."""
    html = get("https://store.steampowered.com/charts/mostplayed").decode("utf-8", "ignore")
    # в HTML JSON заэкранирован (\") — допускаем необязательный бэкслэш перед кавычкой
    m = re.search(
        r'"itemKey\\?"\s*:\s*\{\s*"appid\\?"\s*:\s*%d\s*\}\s*,\s*"?n?ConcurrentInGame\\?"\s*:\s*(\d+)\s*,\s*"?n?PeakInGame\\?"\s*:\s*(\d+)' % APPID,
        html,
    )
    if m:
        return int(m.group(1)), int(m.group(2))
    # запасной вариант: другой порядок полей или большее расстояние
    m = re.search(r"%d[\s\S]{0,400}?nConcurrentInGame\\?\"?\s*:\s*(\d+)" % APPID, html)
    if not m:
        return None, None
    live = int(m.group(1))
    m2 = re.search(r"%d[\s\S]{0,600}?nPeakInGame\\?\"?\s*:\s*(\d+)" % APPID, html)
    return live, (int(m2.group(1)) if m2 else None)


def from_charts_api():
    """Пик за сутки из официального API (запасной источник)."""
    data = json.loads(get("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/"))
    for row in data.get("response", {}).get("ranks", []):
        if row.get("appid") == APPID:
            return int(row["peak_in_game"])
    return None


def main():
    live = None
    peak = None
    try:
        live, peak = from_mostplayed()
        print("mostplayed: live=%s peak=%s" % (live, peak))
    except Exception as e:
        print("mostplayed недоступен:", e)
    if peak is None:
        try:
            peak = from_charts_api()
            print("charts api: peak=%s" % peak)
        except Exception as e:
            print("charts api недоступен:", e)

    if live is None and peak is None:
        print("НИ ОДНОГО источника не ответило — data/live.json не изменяем")
        return 1

    old = {}
    try:
        old = json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        pass

    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    out = {
        "updated": now,
        # не подменяем свежие числа старыми: null честно означает «сейчас не известно»
        "live": live,
        "peak": peak if peak is not None else old.get("peak"),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("записан", OUT, "->", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
