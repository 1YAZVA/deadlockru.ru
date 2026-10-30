"""Каждые 5 минут: берём текущий онлайн Deadlock с официальной страницы Steam Store
(она содержит nConcurrentInGame — реальный «сейчас» от Valve) и пик за 24 ч из
ISteamChartsService. Пишем всё в data/live.json без лишней возни."""
import json
import re
import datetime
import urllib.request

APPID = 1422450


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def main() -> None:
    live = None
    peak = None

    # 1) живое «сейчас» со страницы магазина
    try:
        html = fetch("https://store.steampowered.com/charts/mostplayed")
        m = re.search(r"1422450.{0,240}?nConcurrentInGame\\?\":\s*(\d+)", html, re.S)
        if m:
            live = int(m.group(1))
    except Exception as e:  # noqa: BLE001 — файл обновится и без него
        print(f"store fetch failed: {e}")

    # 2) суточный пик из официального API графиков
    try:
        j = json.loads(fetch(f"https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/"))
        for row in j.get("response", {}).get("ranks", []):
            if row.get("appid") == APPID and row.get("peak_in_game"):
                peak = int(row["peak_in_game"])
                break
    except Exception as e:  # noqa: BLE001
        print(f"charts fetch failed: {e}")

    if live is None and peak is None:
        print("no data this run, keep old file")
        return

    data = {
        "updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "live": live,
        "peak": peak,
    }
    with open("data/live.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("written:", data)


if __name__ == "__main__":
    main()
