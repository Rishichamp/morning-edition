"""Turn candidate stories and the knowledge base into one edition, using Gemini.
Gemini only chooses and rewrites; every link and source name is copied from the feeds here in code."""
import json
import os
import re
import time


CALL_LIMIT = 120  # seconds one Gemini call may take before we give up on it


FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]


def _with_limit(fn, seconds):
    """Run fn in a background (daemon) thread and stop waiting after `seconds`.
    A daemon thread never keeps the job alive, even if the call underneath is stuck."""
    import threading
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
    """Readable one-line error, with the quota or reason lines kept."""
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
                print(f"    Gemini {m}: empty reply", flush=True)
            except Exception as e:  # busy, over limit, unknown model, network, or time limit
                last = e
                print(f"    Gemini {m} failed after {time.time() - t0:.0f} s: {_short(e)}", flush=True)
        if rnd == 0:
            print("    All models busy or limited; waiting 60 s and trying once more", flush=True)
            time.sleep(60)
    raise RuntimeError(f"Gemini did not answer: {_short(last)}")


def parse_json(text):
    """Read the first JSON object in the reply, even if it is wrapped in ``` fences."""
    m = re.search(r"\{.*\}", text, flags=re.S)
    if not m:
        raise ValueError("no JSON object in Gemini reply")
    return json.loads(m.group(0))


PROMPT = """You are the editor of "{name}", a calm personal morning newspaper.
Reader: {profile}
Topics: {topics}. Skip celebrity, entertainment and sport.
Today is {today}.

CANDIDATE STORIES from news feeds (id | topic | source | published | headline | snippet):
{cands}

EARLIER STORIES already reported in past editions (id | date | headline | summary):
{kb}

Write today's edition. Rules:
- Use ONLY the candidate stories above. Never invent a story, a fact, a number, a quote or a link.
- A summary may only restate what the headline and snippet say. If the snippet is empty, keep the summary to one plain sentence about the headline and say details are in the source.
- Pick the {n} most useful stories for this reader, a mix of topics, no two about the same event.
- "why" is one sentence on why it matters to this reader. Be honest and modest.
- "changes": only where a candidate is clearly a follow-up to an EARLIER story (same event or organisation, new development). 0 to 3 items. If none, return an empty list.
- No names of private people. Public organisations and public figures in the news are fine.
- Plain, short British English. No hype, no exclamation marks.

Reply with ONLY one JSON object, no other text:
{{
  "front": {{"kicker": "2 to 4 words", "headline": "front-page headline based on the most important chosen story", "dek": "one sentence"}},
  "brief": ["three short points the reader should not miss today, each under 20 words"],
  "world": [{{"id": "C?", "headline": "clear headline", "summary": "1 to 2 sentences", "why": "one sentence"}}],
  "changes": [{{"earlier_id": "K?", "id": "C?", "headline": "what this follow-up is about", "update": "one sentence on what is new since the earlier report"}}],
  "question": "one short reflective question for the day, related to the news"
}}"""


def build_prompt(settings, today, cands, earlier):
    cl = "\n".join(f"{c['id']} | {c['topic']} | {c['source']} | {c['published'][:10]} | {c['title']} | {c['snippet'][:300]}" for c in cands)
    kl = "\n".join(f"{k['kid']} | {k['date']} | {k['headline']} | {k['summary']}" for k in earlier) or "(none yet)"
    return PROMPT.format(name=settings["name"], profile=settings["reader_profile"],
                         topics=", ".join(t["name"] for t in settings["topics"]), today=today,
                         cands=cl, kb=kl, n=settings["stories_per_day"])


def assemble(raw, settings, today, cands, earlier):
    """Check Gemini's answer against the real candidates and attach the real links."""
    by_id = {c["id"]: c for c in cands}
    by_kid = {k["kid"]: k for k in earlier}
    world, used = [], set()
    for s in raw.get("world", []):
        c = by_id.get(str(s.get("id", "")).strip())
        if not c or c["id"] in used:
            continue  # unknown id: dropped, never guessed
        used.add(c["id"])
        world.append({"headline": str(s.get("headline") or c["title"])[:200], "summary": str(s.get("summary", ""))[:600],
                      "why": str(s.get("why", ""))[:300], "source": c["source"], "url": c["link"], "topic": c["topic"],
                      "unverified": False})
        if len(world) >= settings["stories_per_day"]:
            break
    changes = []
    for ch in raw.get("changes", []) or []:
        c, k = by_id.get(str(ch.get("id", ""))), by_kid.get(str(ch.get("earlier_id", "")))
        if c and k:
            changes.append({"headline": str(ch.get("headline", ""))[:200], "update": str(ch.get("update", ""))[:400],
                            "since": k["date"], "earlier": k["headline"], "source": c["source"], "url": c["link"]})
    if not world:
        raise ValueError("no usable stories in Gemini reply")
    front = raw.get("front") or {}
    brief = [str(b)[:200] for b in (raw.get("brief") or [])][:3]
    while len(brief) < 3 and len(brief) < len(world):
        brief.append(world[len(brief)]["headline"])
    return {
        "date": today, "sample": False,
        "front": {"kicker": str(front.get("kicker") or "The big story")[:60],
                  "headline": str(front.get("headline") or world[0]["headline"])[:200],
                  "dek": str(front.get("dek") or world[0]["summary"])[:300]},
        "brief": brief, "changes": changes, "world": world,
        "question": str(raw.get("question") or "What is one thing you want to learn more about today?")[:300],
        "record": {
            "window": f"News from the last 36 hours, gathered at {settings['publish_time']} IST",
            "privacy": "Built only from public news feeds. No personal mail, chats or calendar are read.",
            "verification": "Every story links to the article the feed listed. Summaries restate the headline and feed snippet; open the source for detail.",
            "unverified": [f"Picked and summarised by {settings['model']} from {len(cands)} feed items. Facts beyond the headline were not checked."]
        }
    }


def dry_run(settings, today, cands, earlier):
    """No Gemini: build a plain edition straight from the feeds (for testing)."""
    picks, topics = [], set()
    for c in cands:  # one per topic first, then fill
        if c["topic"] not in topics:
            picks.append(c); topics.add(c["topic"])
    for c in cands:
        if len(picks) >= settings["stories_per_day"]:
            break
        if c not in picks:
            picks.append(c)
    raw = {"front": {"kicker": "Test edition", "headline": picks[0]["title"], "dek": "Built from the feeds without Gemini, for testing."},
           "brief": [p["title"] for p in picks[:3]],
           "world": [{"id": p["id"], "headline": p["title"], "summary": p["snippet"][:200] or "Headline only; details are in the source.", "why": "Test run: no reason written."} for p in picks[:settings["stories_per_day"]]],
           "changes": [], "question": "What would you like tomorrow's edition to cover?"}
    ed = assemble(raw, settings, today, cands, earlier)
    ed["record"]["unverified"] = ["Test edition built without Gemini. Stories are the first feed items per topic."]
    return ed
