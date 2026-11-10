"""Daily job: gather news, update the knowledge base, write today's edition, publish it, email it.

    python research/main.py            normal run (needs GEMINI_API_KEY)
    python research/main.py --dry-run  build a test edition from the feeds without Gemini
    python research/main.py --no-email skip the email step
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
import feeds, kb, writer, mailer  # noqa: E402

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

    if existing and os.path.exists(ed_path):
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

    print("1/4 Gathering news from feeds...")
    cands = feeds.collect(settings)
    print(f"    {len(cands)} candidate stories")
    if len(cands) < 3:
        print("Too few stories from the feeds today; nothing published.")
        return 3

    earlier = kb.load(days=7, today=now.date())
    for i, k in enumerate(earlier, 1):
        k["kid"] = f"K{i}"
    print(f"2/4 Knowledge base: {len(earlier)} stories from the last 7 days")

    print("3/4 Writing the edition" + (" (dry run, no Gemini)" if dry else f" with {settings['model']}"))
    if dry:
        ed = writer.dry_run(settings, today, cands, earlier)
    else:
        reply = writer.ask_gemini(writer.build_prompt(settings, today, cands, earlier), settings["model"])
        ed = writer.assemble(writer.parse_json(reply), settings, today, cands, earlier)

    save_json(ed_path, ed)
    kb.add([{"date": today, "topic": s["topic"], "headline": s["headline"], "summary": s["summary"],
             "source": s["source"], "url": s["url"]} for s in ed["world"]],
           keep_days=settings["keep_kb_days"], today=now.date())

    entry = {"date": today, "headline": ed["front"]["headline"], "publishedAt": datetime.now(timezone.utc).isoformat(),
             "emailStatus": "not_sent", "emailedAt": None, "test": dry}
    print("4/4 Sending the email")
    if not no_email:
        entry["emailStatus"] = mailer.send(settings, ed)
        if entry["emailStatus"] == "sent":
            entry["emailedAt"] = datetime.now(timezone.utc).isoformat()
    save_json(INDEX, update_index(index, entry, settings["keep_editions"]))
    print(f"Done: {today} · {ed['front']['headline']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
