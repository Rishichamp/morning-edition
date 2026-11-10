"""Read the main text of an article page, so the detailed story view is written from the article itself.
Plain standard-library parsing: it keeps paragraph text and drops menus, scripts and footers."""
import html
import re
import urllib.request
from html.parser import HTMLParser

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SKIP = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "figure", "button"}


class _Paras(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth_skip, self.in_p, self.buf, self.paras = 0, 0, [], []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.depth_skip += 1
        elif tag in ("p", "li", "h2", "h3") and not self.depth_skip:
            self.in_p += 1
            self.buf = []

    def handle_endtag(self, tag):
        if tag in SKIP and self.depth_skip:
            self.depth_skip -= 1
        elif tag in ("p", "li", "h2", "h3") and self.in_p:
            self.in_p -= 1
            text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
            if len(text) >= 60 and not re.search(r"(?i)cookie|subscribe|newsletter|sign up|all rights reserved|advertisement", text):
                self.paras.append(text)
            self.buf = []

    def handle_data(self, data):
        if self.in_p and not self.depth_skip:
            self.buf.append(data)


def fetch_text(url, limit=7000, timeout=20):
    """Return the article's paragraphs joined, or '' if the page refuses or has no readable text."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if "html" not in (r.headers.get("Content-Type") or ""):
                return ""
            raw = r.read(2_000_000).decode(r.headers.get_content_charset() or "utf-8", "replace")
    except Exception:
        return ""
    p = _Paras()
    try:
        p.feed(raw)
    except Exception:
        return ""
    seen, out, total = set(), [], 0
    for para in p.paras:
        if para in seen:
            continue
        seen.add(para)
        out.append(html.unescape(para))
        total += len(para)
        if total >= limit:
            break
    text = "\n".join(out)
    return text if len(text) >= 400 else ""
