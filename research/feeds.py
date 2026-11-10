"""Collect candidate AI stories from free sources:
official company blogs, tech publications, Indian tech press, a news search per company (Bing News RSS,
which gives direct article links), Hugging Face daily papers and arXiv.
Every candidate keeps the link, source and date exactly as the source gave them."""
import html
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MorningEdition/2.0"
ATOM = "{http://www.w3.org/2005/Atom}"


def _get(url, tries=2):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read()
        except Exception as e:
            if attempt == tries - 1:
                print(f"    skipped {url[:70]} ({type(e).__name__})", flush=True)
                return None
            time.sleep(2)


def _clean(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def norm(title):
    t = re.sub(r"\s+[-|–]\s+[^-|–]{2,60}$", "", (title or "").lower())
    return re.sub(r"[^a-z0-9 ]", "", t).strip()


def _date(s):
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except Exception:
        try:
            d = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
        except Exception:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _direct(link):
    """Bing News wraps links in apiclick.aspx?url=...; unwrap to the publisher's own page."""
    if "bing.com" in link and "url=" in link:
        return urllib.parse.parse_qs(urllib.parse.urlparse(link).query).get("url", [link])[0]
    return link


def rss(url, source, kind, cutoff, limit=25):
    raw = _get(url)
    if not raw:
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    out = []
    items = list(root.iter("item")) or root.findall(ATOM + "entry")
    for it in items[:limit]:
        title = _clean(it.findtext("title") or it.findtext(ATOM + "title"))
        link = (it.findtext("link") or "").strip()
        if not link:
            l = it.find(ATOM + "link")
            link = l.get("href", "") if l is not None else ""
        link = _direct(link)
        when = _date(it.findtext("pubDate") or it.findtext(ATOM + "published") or it.findtext(ATOM + "updated"))
        snippet = _clean(it.findtext("description") or it.findtext(ATOM + "summary") or "")[:500]
        src = source
        if kind == "search":   # Bing News names the real publisher
            src = _clean(it.findtext("{https://www.bing.com/news/search?q=rss}Source") or "") or _clean(
                (it.find("source").text if it.find("source") is not None else "")) or source
        if not title or not link.startswith("http") or not when or when < cutoff:
            continue
        out.append({"title": title, "link": link, "source": src, "kind": kind,
                    "published": when.isoformat(), "snippet": snippet})
    return out


def bing(query, cutoff):
    q = urllib.parse.quote(query)
    return rss(f"https://www.bing.com/news/search?q={q}&format=rss&setlang=en", "News search", "search", cutoff, limit=12)


def hf_papers(limit=12):
    raw = _get("https://huggingface.co/api/daily_papers")
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        return []
    data.sort(key=lambda d: -(d.get("paper", {}).get("upvotes") or 0))
    out = []
    for d in data[:limit]:
        p = d.get("paper", {})
        pid, title = p.get("id"), _clean(p.get("title") or d.get("title"))
        if pid and title:
            out.append({"title": title, "link": f"https://huggingface.co/papers/{pid}", "source": "Hugging Face Papers",
                        "kind": "paper", "published": d.get("publishedAt") or "", "snippet": _clean(p.get("summary", ""))[:500],
                        "upvotes": p.get("upvotes") or 0})
    return out


def tag_company(c, companies):
    text = (c["title"] + " " + c["snippet"][:200]).lower()
    for co in companies:
        if any(re.search(r"\b" + re.escape(m) + r"\b", text) for m in co["match"]):
            return co["name"]
    return ""


def collect(settings):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.get("freshness_hours", 72))
    jobs = [(rss, (f["url"], f["name"], f["kind"], cutoff)) for f in settings["feeds"]]
    jobs += [(bing, (co["query"], cutoff)) for co in settings["companies"]]
    jobs += [(bing, (q, cutoff)) for q in settings.get("india_queries", [])]
    with ThreadPoolExecutor(max_workers=8) as pool:
        pools = list(pool.map(lambda j: j[0](*j[1]), jobs))
    india_search_from = len(settings["feeds"]) + len(settings["companies"])
    for i, p in enumerate(pools):
        if i >= india_search_from:
            for c in p:
                c["kind"] = "india"
    pools.append(hf_papers())

    avoid = [w.lower() for w in settings.get("avoid", [])]
    seen, cands = set(), []
    rank = {"official": 0, "paper": 1, "press": 2, "india": 3, "search": 4}
    flat = sorted((c for p in pools for c in p), key=lambda c: rank.get(c["kind"], 9))   # primary sources win duplicates
    for c in flat:
        key = norm(c["title"])
        if not key or key in seen or any(w in c["title"].lower() for w in avoid):
            continue
        seen.add(key)
        c["company"] = tag_company(c, settings["companies"])
        cands.append(c)
    # keep the prompt a sensible size: newest first, at most 8 per company
    cands.sort(key=lambda c: c["published"], reverse=True)
    per, kept = {}, []
    for c in cands:
        k = c["company"] or c["kind"]
        if per.get(k, 0) >= 8:
            continue
        per[k] = per.get(k, 0) + 1
        kept.append(c)
    kept = kept[:240]
    for i, c in enumerate(kept, 1):
        c["id"] = f"C{i}"
    return kept
