"""Раз в час: официальные новости Deadlock из Steam — ПОЛНЫЙ текст с картинками.

Источник: RSS магазина Steam с параметром ?l=russian — Valve официально переводит
свои новости на русский, RSS отдаёт весь HTML-текст со скриншотами и баннерами.
Если у поста нет русской версии (латиница), текст и заголовок автоматически
переводятся через Google Translate. Результат — data/steam-news.json:
каждый свежий пост содержит безопасный HTML (contents), список картинок (images)
и короткое текстовое превью (text). Старые посты, которых нет в RSS,
сохраняются снизу списка в прежнем виде.
"""
import html as htmllib
import json
import time
import unicodedata
import datetime
import urllib.parse
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

APPID = 1422450
RSS_URL = f"https://store.steampowered.com/feeds/news/app/{APPID}/?l=russian"
OUT = "data/steam-news.json"
MAX_CHARS = 60000       # страховка: у самого длинного патчноута ~30К символов
PREVIEW_CHARS = 220     # длина текстовой превьюшки для карточки
TRANSLATE_BUDGET = 150  # максимум запросов к Google Translate за прогон

# безопасный HTML для сайта: только эти теги, атрибуты жёстко контролируем
ALLOWED = {"p", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li",
           "h1", "h2", "h3", "h4", "blockquote", "a", "table", "tr", "td", "th"}
VOID = {"br", "hr", "img"}
SKIP = {"script", "style", "object", "iframe"}
IMG_RE = r"^https://[\w.-]*steamstatic\.com/|^https://steamuserimages-a\.akamaihd\.net/|^https://shared\.[\w.-]*steamstatic\.com/"
HREF_RE = r"^https?://"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def url_ok(url: str) -> bool:
    """HEAD-проверка: картинка реально существует (Steam кладёт языковые варианты
    вроде russian.png не для всех изображений — тогда нужен data-fallback-src)."""
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return 200 <= r.status < 300
    except Exception:  # noqa: BLE001
        return False


class HTMLCleaner(HTMLParser):
    """HTML из RSS → безопасный HTML для сайта (белый список тегов и атрибутов)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[str] = []
        self.images: list[str] = []
        self.videos: list[str] = []
        self.text_parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP:
            src = (a.get("src") or "") if tag == "iframe" else ""
            if tag == "iframe" and ("youtube.com" in src or "youtu.be" in src):
                self.videos.append(src)
            self.skip += 1
            return
        if tag == "img":
            src = (a.get("src") or "").strip()
            if src.startswith("//"):
                src = "https:" + src
            fallback = (a.get("data-fallback-src") or "").strip()
            if fallback.startswith("//"):
                fallback = "https:" + fallback
            # языковая копия (russian.png) может не существовать — тогда берём фолбэк Steam
            if fallback and IMG_OK(fallback) and src != fallback and not url_ok(src):
                src = fallback
            if src and IMG_OK(src):
                if src not in self.images:
                    self.images.append(src)
                self.out.append(f'<img src="{htmllib.escape(src, quote=True)}" alt="" loading="lazy">')
            return
        if tag in VOID:
            self.out.append(f"<{tag}>")
            return
        if tag not in ALLOWED:
            return  # незнакомый тег выбрасываем, содержимое оставляем
        if tag == "a":
            href = (a.get("href") or "").strip()
            if HREF_OK(href):
                self.out.append(f'<a href="{htmllib.escape(href, quote=True)}" target="_blank" rel="noopener">')
                self.stack.append("a")
            else:
                self.stack.append("\x00a")  # ссылка невалидна — тег выбрасываем, текст остаётся
            return
        self.out.append(f"<{tag}>")
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in SKIP:
            if self.skip:
                self.skip -= 1
            return
        if tag in VOID:
            return
        if tag not in ALLOWED:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            ent = self.stack[i]
            if ent == tag or ent == "\x00" + tag:
                del self.stack[i:]
                if ent == tag:
                    self.out.append(f"</{tag}>")
                return

    def handle_data(self, data):
        if self.skip:
            return
        if data.strip():
            self.text_parts.append(data)
        self.out.append(htmllib.escape(data, quote=False))

    def finish(self):
        while self.stack:
            t = self.stack.pop()
            if not t.startswith("\x00"):
                self.out.append(f"</{t}>")

    def html(self) -> str:
        return "".join(self.out)


def IMG_OK(src: str) -> bool:
    import re
    return bool(re.match(IMG_RE, src))


def HREF_OK(href: str) -> bool:
    import re
    return bool(re.match(HREF_RE, href))


def plain_text(parts: list[str]) -> str:
    return " ".join(" ".join(parts).split())


def html_to_plain(html_str: str) -> str:
    """Текст из безопасного HTML (для превью после перевода)."""
    c = HTMLCleaner()
    c.feed(html_str)
    c.close()
    c.finish()
    return plain_text(c.text_parts)


def cyr_ratio(s: str) -> float:
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return 1.0
    cyr = sum(1 for c in letters if "CYRILLIC" in unicodedata.name(c, ""))
    return cyr / len(letters)


class _Translator(HTMLParser):
    """Переводит только текстовые узлы уже безопасного HTML (англ → рус)."""

    def __init__(self, budget: list[int]) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[str] = []
        self.budget = budget
        self.broken = False

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            self.out.append(f"<{tag}>")
            return
        s = "".join(f' {k}="{htmllib.escape(v or "", quote=True)}"' for k, v in attrs)
        self.out.append(f"<{tag}{s}>")
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in self.stack:
            i = len(self.stack) - 1 - self.stack[::-1].index(tag)
            del self.stack[i:]
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        core = data.strip()
        if not core or self.broken or self.budget[0] <= 0 or cyr_ratio(core) > 0.3:
            self.out.append(data)
            return
        lead = data[:len(data) - len(data.lstrip())]
        trail = data[len(data.rstrip()):]
        try:
            ru = gtx(core)
            self.budget[0] -= 1
            self.out.append(lead + ru + trail)
        except Exception:  # noqa: BLE001 — переводчик недоступен, оставляем оригинал
            self.broken = True
            self.out.append(data)

    def finish(self):
        while self.stack:
            self.out.append(f"</{self.stack.pop()}>")

    def html(self) -> str:
        return "".join(self.out)


def gtx(text: str) -> str:
    """Англ → рус через Google Translate. Два эндпоинта: основной (dict-chrome-ex,
    реже упирается в лимиты) и запасной (translate_a/single с client=gtx).
    Если недоступны оба — исключение: пост останется на английском."""
    q = urllib.parse.quote(text[:4500])
    last_err: Exception | None = None
    for url in (
        f"https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ru&q={q}",
        f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q={q}",
    ):
        try:
            data = json.loads(fetch(url).decode("utf-8"))
            if isinstance(data, list) and data and isinstance(data[0], str):
                return "".join(s for s in data if isinstance(s, str))
            if isinstance(data, list) and data and isinstance(data[0], list):
                return "".join(seg[0] for seg in data[0] if seg and seg[0])
        except Exception as e:  # noqa: BLE001 — пробуем следующий эндпоинт
            last_err = e
            time.sleep(0.5)
    raise RuntimeError(f"translate failed: {last_err}")


def translate_html(html_str: str, budget: list[int]) -> str:
    t = _Translator(budget)
    t.feed(html_str)
    t.close()
    t.finish()
    return t.html()


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
    budget = [TRANSLATE_BUDGET]

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

        desc = htmllib.unescape(item.findtext("description") or "")
        cleaner = HTMLCleaner()
        cleaner.feed(desc)
        cleaner.close()
        cleaner.finish()
        contents = cleaner.html()[:MAX_CHARS]

        for v in cleaner.videos[:2]:
            contents += f'<p><a href="{htmllib.escape(v, quote=True)}" target="_blank" rel="noopener">▶ Видео в новости</a></p>'

        full = plain_text(cleaner.text_parts)
        preview = full[:PREVIEW_CHARS] + ("…" if len(full) > PREVIEW_CHARS else "")
        images = cleaner.images[:12]

        lang = "ru"
        if cyr_ratio(full) < 0.25 and len(full) > 40 and budget[0] > 0:
            # официального перевода нет — автоматический перевод
            try:
                if cyr_ratio(title) < 0.25:
                    title = gtx(title)
                    budget[0] -= 1
                contents = translate_html(contents, budget)
                full_ru = html_to_plain(contents)
                preview = full_ru[:PREVIEW_CHARS] + ("…" if len(full_ru) > PREVIEW_CHARS else "")
                lang = "en→ru"
            except Exception:  # noqa: BLE001
                pass  # остаётся оригинал на английском
            time.sleep(0.3)

        digits = "".join(ch for ch in guid if ch.isdigit())
        pid = "st" + (digits[-16:] if digits else title[:24])
        fresh_ids.add(pid)
        posts.append({
            "id": pid, "date": date, "title": title, "text": preview,
            "contents": contents, "images": images, "url": link, "lang": lang,
        })

    if not posts:
        print("rss пуст — файл не трогаем")
        return

    # посты из RSS — сверху (свежие первые), остальная история — снизу без изменений
    rest = sorted((p for pid, p in old.items() if pid not in fresh_ids),
                  key=lambda p: p["date"], reverse=True)
    all_posts = posts + rest

    data = {
        "updatedAt": datetime.date.today().isoformat(),
        "source": f"https://store.steampowered.com/news/app/{APPID}",
        "posts": all_posts,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    top = posts[0]
    print(f"written: {len(all_posts)} posts ({len(posts)} полных), "
          f"top = «{top['title']}» ({top['date']}), картинок: {len(top['images'])}, lang: {top['lang']}")


if __name__ == "__main__":
    main()
