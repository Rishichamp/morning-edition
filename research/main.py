"""Daily job: gather news, update the knowledge base, write today's edition, publish it, email it.

    python research/main.py            normal run (needs GEMINI_API_KEY)
    python research/main.py --dry-run  build a test edition from the feeds without Gemini
    python research/main.py --no-email skip the email step
    python research/main.py --replace  rebuild today's edition even if it exists
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import feeds, kb, writer, mailer, article  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "site", "data")
EDS = os.path.join(DATA, "editions")
INDEX = os.path.join(DATA, "index.json")


def load_json(path, default):
    try:
        with open(path, encoding="utf8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def ist_now(settings):
    sign = 1 if settings["time_zone_offset"][0] == "+" else -1
    h, m = settings["time_zone_offset"][1:].split(":")
    return datetime.now(timezone(sign * timedelta(hours=int(h), minutes=int(m))))


def update_index(index, entry, keep):
    """index.json lists the editions on the site, newest first; old ones are removed."""
    entries = [e for e in index.get("editions", []) if e["date"] != entry["date"]] + [entry]
    entries.sort(key=lambda e: e["date"], reverse=True)
    keep_list, drop = entries[:keep], entries[keep:]
    for e in drop:
        p = os.path.join(EDS, e["date"] + ".json")
        if os.path.exists(p):
            os.remove(p)
    index["editions"] = keep_list
    return index


def main(argv):
    dry, no_email = "--dry-run" in argv, "--no-email" in argv
    settings = load_json(os.path.join(os.path.dirname(__file__), "settings.json"), None)
    settings["model"] = os.environ.get("GEMINI_MODEL", settings["model"])
    now = ist_now(settings)
    today = now.date().isoformat()
    index = load_json(INDEX, {"editions": []})
    existing = next((e for e in index["editions"] if e["date"] == today), None)
    ed_path = os.path.join(EDS, today + ".json")

    replace = "--replace" in argv
    replace_test = bool(existing and existing.get("test") and not dry)   # a real run replaces a test edition
    if existing and os.path.exists(ed_path) and not replace_test and not replace:
        print(f"Edition {today} already published.")
        if existing.get("emailStatus") != "sent" and not no_email:   # never send twice
            existing["emailStatus"] = mailer.send(settings, load_json(ed_path, None))
            if existing["emailStatus"] == "sent":
                existing["emailedAt"] = datetime.now(timezone.utc).isoformat()
            save_json(INDEX, index)
        return 0

    if not dry and not os.environ.get("GEMINI_API_KEY"):
        print("GEMINI_API_KEY is not set. Add it as a GitHub secret (or use --dry-run to test).")
        return 2

    print("1/5 Gathering AI news from company blogs, tech press, news search and papers...", flush=True)
    cands = feeds.collect(settings)
    print(f"    {len(cands)} candidate stories", flush=True)
    if len(cands) < 5:
        print("Too few stories from the sources today; nothing published.")
        return 3

    earlier = kb.load(days=7, today=now.date())
    for i, k in enumerate(earlier, 1):
        k["kid"] = f"K{i}"
    print(f"    knowledge base: {len(earlier)} stories from the last 7 days", flush=True)

    model = "no Gemini (test run)"
    print("2/5 Picking the lead, 9 world stories and the India section", flush=True)
    picked = None
    if not dry:
        try:
            reply, model = writer.ask_gemini(writer.build_pick_prompt(settings, today, cands), settings["model"])
            picked = writer.check_pick(writer.parse_json(reply), settings, cands)
        except Exception as e:
            print(f"    pick step failed, using the plain fallback: {e}", flush=True)
    if not picked:
        picked = writer.fallback_pick(settings, cands)
    print(f"    {sum(p['section'] == 'world' for p in picked)} world + {sum(p['section'] == 'india' for p in picked)} India", flush=True)

    print("3/5 Reading the chosen articles in full", flush=True)
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=6) as pool:
        texts = list(pool.map(lambda p: article.fetch_text(p["link"]) if p["kind"] != "paper" else "", picked))
    for p, t in zip(picked, texts):
        p["text"] = t or (p["snippet"] if p["kind"] == "paper" and len(p["snippet"]) > 300 else "")
    print(f"    {sum(bool(p['text']) for p in picked)} of {len(picked)} read in full", flush=True)

    print("4/5 Writing the tiles and detailed pages", flush=True)
    written = None
    if not dry:
        try:
            reply, model = writer.ask_gemini(writer.build_write_prompt(settings, today, picked, earlier), settings["model"])
            written = writer.parse_json(reply)
        except Exception as e:
            print(f"    write step failed, using article text directly: {e}", flush=True)
    ed = writer.assemble(written, settings, today, picked, earlier, model)

    save_json(ed_path, ed)
    kb.add([{"date": today, "company": s["company"], "category": s["category"], "headline": s["headline"],
             "summary": s["dek"], "source": s["source"], "url": s["url"]} for s in ed["stories"] + ed["india"]],
           keep_days=settings["keep_kb_days"], today=now.date())

    entry = {"date": today, "headline": ed["front"]["headline"], "publishedAt": datetime.now(timezone.utc).isoformat(),
             "emailStatus": "not_sent", "emailedAt": None, "test": dry, "version": 2}
    print("5/5 Sending the email", flush=True)
    if not no_email:
        entry["emailStatus"] = mailer.send(settings, ed)
        if entry["emailStatus"] == "sent":
            entry["emailedAt"] = datetime.now(timezone.utc).isoformat()
    save_json(INDEX, update_index(index, entry, settings["keep_editions"]))
    print(f"Done: {today} · {ed['front']['headline']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
