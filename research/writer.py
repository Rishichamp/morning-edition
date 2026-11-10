"""Two Gemini steps turn candidates into an edition:
  1. pick: choose the lead story, 9 more world stories and the India stories from the candidate list;
  2. write: from each chosen article's own text, write the tile text and the detailed page.
Gemini never supplies links or sources: the code copies those from the candidates, and drops any
story ID it does not recognise. If Gemini is unavailable, a plain fallback still publishes an edition."""
import json
import os
import re
import time
import threading

CALL_LIMIT = 150  # seconds one Gemini call may take
FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]


# ---------------- Gemini plumbing ----------------
def _with_limit(fn, seconds):
    """Run fn in a daemon thread; stop waiting after `seconds`. A stuck call never keeps the job alive."""
    box = {}

    def run():
        try:
            box["value"] = fn()
        except Exception as e:
            box["error"] = e
    t = threading.Thread(target=run, daemon=True)
    t.start()
    t.join(seconds)
    if t.is_alive():
        raise TimeoutError(f"no reply within {seconds} s")
    if "error" in box:
        raise box["error"]
    return box.get("value")


def _short(e):
    s = re.sub(r"\s+", " ", str(e).replace("\\n", " "))
    return f"{type(e).__name__}: {s[:900]}"


def ask_gemini(prompt, model):
    """Ask Gemini, moving to the next free model when one is busy (503) or over its limit (429)."""
    from google import genai  # pip install google-genai
    from google.genai import types
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"],
                          http_options=types.HttpOptions(timeout=CALL_LIMIT * 1000))
    models = [model] + [m for m in FALLBACK_MODELS if m != model]
    last = None
    for rnd in range(2):
        for m in models:
            t0 = time.time()
            try:
                text = _with_limit(lambda: client.models.generate_content(model=m, contents=prompt).text, CALL_LIMIT + 10)
                if text:
                    print(f"    Gemini {m} replied in {time.time() - t0:.0f} s", flush=True)
                    return text, m
                last = RuntimeError("empty reply")
            except Exception as e:
                last = e
                print(f"    Gemini {m} failed after {time.time() - t0:.0f} s: {_short(e)}", flush=True)
        if rnd == 0:
            print("    All models busy or limited; waiting 60 s and trying once more", flush=True)
            time.sleep(60)
    raise RuntimeError(f"Gemini did not answer: {_short(last)}")


def parse_json(text):
    m = re.search(r"\{.*\}", text, flags=re.S)
    if not m:
        raise ValueError("no JSON object in Gemini reply")
    return json.loads(m.group(0))


# ---------------- step 1: pick ----------------
PICK = """You are the front-page editor of "{name}", a daily AI newspaper.
Reader: {profile}
Today is {today}.

Companies the reader follows: {companies}
Kinds of news the reader wants: {categories}
Never pick: stock tips, share-price predictions, crypto, celebrity gossip, rumours or unconfirmed leaks, sport.

CANDIDATES (id | kind | company | source | published | headline | snippet):
{cands}

Choose:
- "lead": the single most important AI story for this reader today.
- "world": 9 more stories (not the lead). Together with the lead these are 10 genuinely different events.
  Prefer primary sources (kind "official" or "paper") over write-ups of the same news. At most 2 stories about
  the same company. Cover a spread of the reader's kinds of news. Skip generic "AI is changing everything" pieces.
- "india": {india_n} stories about AI in India (Indian companies, government, institutes, startups, jobs), not
  already chosen above. If fewer good ones exist, return fewer.
- For every chosen id give a "category" from the reader's list above, word for word.

Reply with ONLY one JSON object:
{{"lead": "C?", "world": ["C?", "..."], "india": ["C?"], "category": {{"C?": "Model launches"}}}}"""


def build_pick_prompt(settings, today, cands):
    lines = "\n".join(f"{c['id']} | {c['kind']} | {c['company'] or '-'} | {c['source']} | {c['published'][:10]} | {c['title']} | {c['snippet'][:220]}" for c in cands)
    return PICK.format(name=settings["name"], profile=settings["reader_profile"], today=today,
                       companies=", ".join(co["name"] for co in settings["companies"]),
                       categories=", ".join(settings["categories"]), cands=lines,
                       india_n=settings["india_stories"])


def check_pick(raw, settings, cands):
    by_id = {c["id"]: c for c in cands}
    cats = set(settings["categories"])
    picked, used, per_company = [], set(), {}

    def take(cid, section):
        c = by_id.get(str(cid).strip())
        if not c or c["id"] in used:
            return
        if section != "india" and c["company"] and per_company.get(c["company"], 0) >= 2:
            return
        used.add(c["id"])
        if c["company"]:
            per_company[c["company"]] = per_company.get(c["company"], 0) + 1
        cat = (raw.get("category") or {}).get(c["id"], "")
        picked.append(dict(c, section=section, category=cat if cat in cats else ""))

    take(raw.get("lead", ""), "world")
    for cid in raw.get("world", []):
        if sum(p["section"] == "world" for p in picked) < settings["world_stories"]:
            take(cid, "world")
    for cid in raw.get("india", []):
        if sum(p["section"] == "india" for p in picked) < settings["india_stories"]:
            take(cid, "india")
    if not any(p["section"] == "world" for p in picked):
        raise ValueError("no usable stories in Gemini's pick")
    return picked


def fallback_pick(settings, cands):
    """No Gemini: primary sources first, one per company, then the newest."""
    picked, companies, used = [], set(), set()
    order = sorted(cands, key=lambda c: ({"official": 0, "paper": 1, "press": 2, "search": 3, "india": 4}.get(c["kind"], 9)))
    for c in order:
        if c["kind"] == "india" or (c["company"] and c["company"] in companies):
            continue
        picked.append(dict(c, section="world", category="")); used.add(c["id"])
        if c["company"]:
            companies.add(c["company"])
        if len(picked) >= settings["world_stories"]:
            break
    for c in cands:
        if c["kind"] == "india" and c["id"] not in used and sum(p["section"] == "india" for p in picked) < settings["india_stories"]:
            picked.append(dict(c, section="india", category="India AI and startups"))
    return picked


# ---------------- step 2: write ----------------
WRITE = """You write "{name}", a calm daily AI newspaper for: {profile}
Today is {today}.

For each story below you get the article text (or only a short snippet if the page could not be read).

Rules:
- Use ONLY facts written in that story's text. Never add numbers, names, dates, quotes or claims that are not there.
- If only a snippet is available, keep the detail short and say that the full article has more.
- Plain, clear British English. No hype, no exclamation marks, no "game-changer".
- headline: clear, specific, under 14 words.
- dek: one or two sentences (under 40 words) for the front-page tile.
- detail: the longer summary for the story page: 3 to 5 short paragraphs (each 2 to 4 sentences) that explain
  what happened, the important details and numbers from the article, and the context the article gives.
- why: one sentence on why this matters to this reader.
Also write:
- "brief": three short points (under 20 words each) the reader should not miss today, from these stories.
- "changes": using EARLIER STORIES, list 0 to 3 of today's stories that are clear follow-ups of an earlier story
  (same event or product, new development). Give the earlier id and one sentence on what is new.
- "question": one short reflective question for the day, linked to today's news.

STORIES:
{stories}

EARLIER STORIES (id | date | headline):
{kb}

Reply with ONLY one JSON object:
{{"stories": [{{"id": "C?", "headline": "...", "dek": "...", "detail": ["para 1", "para 2", "para 3"], "why": "..."}}],
  "brief": ["...", "...", "..."],
  "changes": [{{"earlier_id": "K?", "id": "C?", "update": "..."}}],
  "question": "..."}}"""


def build_write_prompt(settings, today, picked, earlier):
    blocks = []
    for p in picked:
        body = p.get("text") or ("(snippet only) " + (p["snippet"] or p["title"]))
        blocks.append(f"### {p['id']} | {p['source']} | {p['published'][:10]} | {p['title']}\n{body[:6500]}")
    kb = "\n".join(f"{k['kid']} | {k['date']} | {k['headline']}" for k in earlier) or "(none yet)"
    return WRITE.format(name=settings["name"], profile=settings["reader_profile"], today=today,
                        stories="\n\n".join(blocks), kb=kb)


def _plain_detail(p):
    """Detail without Gemini: the article's own first paragraphs, or the snippet."""
    if p.get("text"):
        paras = [x for x in p["text"].split("\n") if len(x) > 80][:4]
        if paras:
            return paras
    return [p["snippet"] or "Open the source for the full story."]


def assemble(written, settings, today, picked, earlier, model):
    """Merge Gemini's writing with the real candidate data; anything unknown is ignored."""
    w = {str(s.get("id", "")).strip(): s for s in (written or {}).get("stories", [])}
    by_kid = {k["kid"]: k for k in earlier}
    stories = []
    for p in picked:
        s = w.get(p["id"], {})
        detail = [str(x)[:1200] for x in (s.get("detail") or []) if str(x).strip()][:6] or _plain_detail(p)
        stories.append({
            "id": p["id"], "section": p["section"], "company": p["company"], "category": p["category"],
            "headline": str(s.get("headline") or p["title"])[:200],
            "dek": str(s.get("dek") or p["snippet"][:220] or "")[:400],
            "detail": detail, "why": str(s.get("why") or "")[:300],
            "source": p["source"], "url": p["link"], "published": p["published"],
            "full_article": bool(p.get("text")),
        })
    world = [s for s in stories if s["section"] == "world"]
    india = [s for s in stories if s["section"] == "india"]
    changes = []
    for ch in (written or {}).get("changes", []) or []:
        k = by_kid.get(str(ch.get("earlier_id", "")))
        st = next((s for s in stories if s["id"] == str(ch.get("id", ""))), None)
        if k and st and ch.get("update"):
            changes.append({"headline": st["headline"], "update": str(ch["update"])[:400], "since": k["date"],
                            "earlier": k["headline"], "source": st["source"], "url": st["url"], "story": st["id"]})
    brief = [str(b)[:200] for b in ((written or {}).get("brief") or [])][:3]
    for s in world:
        if len(brief) >= 3:
            break
        if s["headline"] not in brief:
            brief.append(s["headline"])
    lead = world[0]
    full = sum(s["full_article"] for s in stories)
    for i, s in enumerate(stories, 1):
        s["n"] = i
    return {
        "date": today, "version": 2, "sample": False,
        "front": {"kicker": lead["category"] or lead["company"] or "The big story", "headline": lead["headline"], "dek": lead["dek"]},
        "brief": brief, "stories": world, "india": india, "changes": changes,
        "question": str((written or {}).get("question") or "Which of today's stories will you look into further?")[:300],
        "record": {
            "window": f"Stories published in the last {settings.get('freshness_hours', 72)} hours, gathered at {settings['publish_time']} IST",
            "privacy": "Built only from public news, company blogs and papers. No personal mail, chats or calendar are read.",
            "verification": "Every story links to its original page. Detailed summaries are written only from that page's text.",
            "unverified": [f"Picked and written by {model}. {full} of {len(stories)} stories were read in full; the rest are from the feed's summary only."]
        }
    }
