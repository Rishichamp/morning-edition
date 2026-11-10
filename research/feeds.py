"""Collect candidate stories from free feeds: Google News RSS per topic, and arXiv for papers.
Every candidate keeps the link and source name exactly as the feed gives them."""
import re
import time
import html
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = "MorningEditionBot/1.0 (personal daily newspaper)"


def _get(url, tries=2):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read()
        except Exception as e:  # network hiccup: wait and try once more
            if attempt == tries - 1:
                print(f"  feed failed: {url[:80]}... ({e})")
                return None
            time.sleep(3)


def _clean(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def norm(title):
    """Comparable form of a headline, used to drop duplicates."""
    t = re.sub(r"\s+-\s+[^-]{2,60}$", "", title.lower())  # Google News appends " - Source"
    return re.sub(r"[^a-z0-9 ]", "", t).strip()


def google_news(topic, query, hours=36, limit=12):
    q = urllib.parse.quote(f"{query} when:2d")
    url = f"https://news.google.com/rss/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en"
    raw = _get(url)
    if not raw:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    out = []
    for item in ET.fromstring(raw).iter("item"):
        title = _clean(item.findtext("title"))
        link = (item.findtext("link") or "").strip()
        src_el = item.find("source")
        source = _clean(src_el.text) if src_el is not None else ""
        try:
            when = parsedate_to_datetime(item.findtext("pubDate"))
        except Exception:
            when = None
        if not title or not link or (when and when < cutoff):
            continue
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3].strip()
        out.append({"topic": topic, "title": title, "link": link, "source": source or "Google News",
                    "published": when.isoformat() if when else "", "snippet": ""})
        if len(out) >= limit:
            break
    return out


def arxiv(categories, limit=8):
    q = "+OR+".join(f"cat:{c}" for c in categories)
    url = f"http://export.arxiv.org/api/query?search_query={q}&sortBy=submittedDate&sortOrder=descending&max_results={limit}"
    raw = _get(url)
    if not raw:
        return []
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out = []
    for e in ET.fromstring(raw).findall("a:entry", ns):
        title = _clean(e.findtext("a:title", default="", namespaces=ns))
        link = (e.findtext("a:id", default="", namespaces=ns) or "").strip()
        summary = _clean(e.findtext("a:summary", default="", namespaces=ns))
        if title and link:
            out.append({"topic": "Research", "title": title, "link": link, "source": "arXiv",
                        "published": e.findtext("a:published", default="", namespaces=ns), "snippet": summary[:500]})
    return out


def collect(settings):
    seen, cands = set(), []
    ignore = [w.lower() for w in settings.get("ignore_words", [])]
    pools = [google_news(t["name"], t["query"]) for t in settings["topics"]]
    pools.append(arxiv(settings.get("arxiv_categories", ["cs.AI"])))
    for pool in pools:
        for c in pool:
            key = norm(c["title"])
            if not key or key in seen or any(w in c["title"].lower() for w in ignore):
                continue
            seen.add(key)
            cands.append(c)
    for i, c in enumerate(cands, 1):
        c["id"] = f"C{i}"
    return cands
