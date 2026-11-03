"""Раз в час: выкачиваем RSS официальных новостей Deadlock из Steam Store
и перегенерируем data/steam-news.json — свежие патчи появляются на сайте сами.
Старые посты, которых больше нет в RSS (или которые не влезли), сохраняются снизу списка."""
import html as htmllib
import json
import datetime
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

APPID = 1422450
RSS_URL = f"https://store.steampowered.com/feeds/news/app/{APPID}/"
OUT = "data/steam-news.json"
KEEP_CHARS = 1400  # как в файле: длинные патчноуты режем


class HTML2Text(HTMLParser):
    """Простой конвертер описаний RSS (они в HTML) в текст для карточек новостей."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0  # img / style и прочее не текст

    def handle_starttag(self, tag, attrs):
        if tag in ("img", "style", "script", "object", "iframe"):
            self.skip += 1
        elif tag in ("p", "br", "li", "ul", "div", "h1", "h2", "h3", "b", "i"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("img", "style", "script", "object", "iframe") and self.skip > 0:
            self.skip -= 1
        elif tag in ("p", "li", "ul", "div", "h1", "h2", "h3"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.parts.append(data)


def html2text(raw: str) -> str:
    p = HTML2Text()
    try:
        p.feed(raw)
        p.close()
    except Exception:  # noqa: BLE001 — упадём только до stderr, файл не пострадает
        pass
    text = "".join(p.parts)
    lines = [ln.strip() for ln in text.splitlines()]
    text = "\n".join(ln for ln in lines if ln)
    return text[:KEEP_CHARS].rstrip() + ("…" if len(text) > KEEP_CHARS else "")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main() -> None:
    try:
        raw = fetch(RSS_URL)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"rss fetch failed: {e}")
        return

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        print(f"rss parse failed: {e}")
        return

    old = {p["id"]: p for p in json.load(open(OUT, encoding="utf-8")).get("posts", [])}
    fresh_ids = set()

    posts = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "Без названия").strip()
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or link).strip()
        pub = item.findtext("pubDate") or ""
        try:
            date = datetime.datetime.strptime(pub, "%a, %d %b %Y %H:%M:%S %z").strftime("%Y-%m-%d")
        except ValueError:
            date = pub[:10] or datetime.date.today().isoformat()
        text = html2text(htmllib.unescape(item.findtext("description") or ""))
        digits = "".join(ch for ch in guid if ch.isdigit())
        pid = "st" + (digits[-16:] if digits else title[:24])
        fresh_ids.add(pid)
        posts.append({"id": pid, "date": date, "title": title, "text": text, "url": link})

    if not posts:
        print("rss пуст — файл не трогаем")
        return

    # посты из RSS — сверху (свежие первые), остальная история — снизу без изменений
    rest = sorted((p for pid, p in old.items() if pid not in fresh_ids), key=lambda p: p["date"], reverse=True)
    all_posts = posts + rest

    data = {
        "updatedAt": datetime.date.today().isoformat(),
        "source": f"https://store.steampowered.com/news/app/{APPID}",
        "posts": all_posts,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"written: {len(all_posts)} posts, top = «{posts[0]['title']}» ({posts[0]['date']})")


if __name__ == "__main__":
    main()
