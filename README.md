# The Morning Edition

A personal daily newspaper by Rishi Singh. Every morning at about 8:00 IST a GitHub Actions job gathers the news, updates a small knowledge base, writes the day's edition with Gemini, publishes it to GitHub Pages and emails it to the newsletter inbox.

**Site:** https://rishichamp.github.io/morning-edition/

## How one edition is made

1. **Gather** (`research/feeds.py`): Google News RSS for each topic, plus arXiv for new AI papers. Free, no key. Every story keeps the link and source the feed gave.
2. **Remember** (`research/kb.py`): stories from earlier editions live in `kb/stories.jsonl`, one per line, kept for 60 days.
3. **Write** (`research/writer.py`): Gemini (free tier, `gemini-3.8-flash`) picks 5 stories, writes short summaries and "why it matters", spots follow-ups for *What changed since yesterday*, and writes the front page and the question. Gemini never supplies links: the code checks every story ID it returns against the real feed items and drops anything it doesn't recognise.
4. **Publish** (`research/main.py`): saves `site/data/editions/<date>.json`, updates `site/data/index.json`, and keeps the last 14 editions.
5. **Email** (`research/mailer.py`): sends the edition from the newsletter Gmail account to itself, never twice for the same day, retrying once after 15 minutes.

## One-time setup (secrets)

In the repo on GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add three:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | A free key from Google AI Studio (aistudio.google.com → Get API key) |
| `GMAIL_ADDRESS` | The newsletter address |
| `GMAIL_APP_PASSWORD` | A Gmail app password for that account (Google Account → Security → 2-Step Verification → App passwords) |

Secrets stay inside GitHub. They are never written into the site or the repo.

## Run it

- **Automatically:** every day at 02:30 UTC (08:00 IST). GitHub can start scheduled jobs a few minutes to an hour late.
- **By hand:** Actions tab → *Daily edition* → *Run workflow*. Tick *Test run without Gemini* to try it without a key.
- **On your computer:**
  ```
  pip install -r research/requirements.txt
  python research/main.py --dry-run --no-email
  python -m http.server 5174 --directory site
  ```

## How to change things

- **Topics, ignored words, stories per day, model:** `research/settings.json`
- **Publish time:** the `cron` line in `.github/workflows/daily.yml` (time is in UTC)
- **Read and email timers, colours, wording on the site:** `site/js/config.js` and `site/css/site.css`

## Notes

- Summaries restate the headline and the feed snippet. Open the source for the full story.
- Read, unread and delete choices are saved on each device separately.
- Only public news is used. No mail, chats or calendar are read.
