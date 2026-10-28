"""Every 5 minutes: read current Deadlock CCU from official Steam Store page
(it embeds nConcurrentInGame - Valve's live number) and 24h peak from
ISteamChartsService. Writes both into data/live.json."""
import json, re, datetime, urllib.request

APPID = 1422450

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")

def main():
    live = None
    peak = None
    try:
        html = fetch("https://store.steampowered.com/charts/mostplayed")
        m = re.search(r"1422450.{0,240}?nConcurrentInGame\\?\":\s*(\d+)", html, re.S)
        if m:
            live = int(m.group(1))
    except Exception as e:
        print("store fetch failed:", e)
    try:
        j = json.loads(fetch("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/"))
        for row in j.get("response", {}).get("ranks", []):
            if row.get("appid") == APPID and row.get("peak_in_game"):
                peak = int(row["peak_in_game"])
                break
    except Exception as e:
        print("charts fetch failed:", e)
    if live is None and peak is None:
        print("no data this run, keep old file")
        return
    data = {"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "live": live, "peak": peak}
    with open("data/live.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("written:", data)

if __name__ == "__main__":
    main()
