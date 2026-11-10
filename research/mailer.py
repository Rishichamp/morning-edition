"""Email the edition from the newsletter Gmail account to itself, using a Gmail app password."""
import html
import os
import smtplib
import ssl
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date as _date

INK, BLUE, MUTED, RULE, BG = "#1A2638", "#2D5A94", "#66768C", "#D7DFEA", "#EEF2F8"


def long_date(d):
    x = _date.fromisoformat(d)
    return f"{x.strftime('%A')}, {x.day} {x.strftime('%B %Y')}"


def subject(settings, ed):
    # starts with the paper's name so the Gmail filter files it under the label
    return f"{settings['name']} · {long_date(ed['date'])} · {ed['front']['headline']}"


def body_html(settings, ed):
    e = html.escape
    link = settings["site_url"].rstrip("/") + "/#ed-" + ed["date"]
    brief = "".join(f'<tr><td style="padding:9px 0;border-top:1px solid {RULE};font:15px/1.5 Georgia,serif;color:{INK}"><b style="color:{BLUE}">{i}</b>&nbsp;&nbsp;{e(b)}</td></tr>' for i, b in enumerate(ed["brief"], 1))
    world = "".join(f'<tr><td style="padding:12px 0;border-top:1px solid {RULE}"><div style="font:bold 17px/1.3 Georgia,serif;color:{INK}">{e(s["headline"])}</div><div style="font:14px/1.5 Georgia,serif;color:{MUTED};margin-top:4px">{e(s["summary"])}</div><div style="font:12px Arial,sans-serif;margin-top:6px"><a href="{e(s["url"])}" style="color:{BLUE}">{e(s["source"])}</a></div></td></tr>' for s in ed["world"])
    changes = ""
    if ed.get("changes"):
        rows = "".join(f'<tr><td style="padding:9px 0;border-top:1px solid {RULE};font:14px/1.5 Georgia,serif;color:{INK}"><b>{e(c["headline"])}</b> &mdash; {e(c["update"])} <a href="{e(c["url"])}" style="color:{BLUE};font:12px Arial,sans-serif">{e(c["source"])}</a></td></tr>' for c in ed["changes"])
        changes = f'<div style="font:bold 11px Arial,sans-serif;letter-spacing:1px;color:{MUTED};text-transform:uppercase;margin:22px 0 4px">What changed since yesterday</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>'
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(settings['name'])}</title></head>
<body style="margin:0;padding:0;background:{BG}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#FFFFFF;border:1px solid {RULE}">
<tr><td style="padding:22px 26px 10px;text-align:center"><div style="font:bold 30px/1.1 Georgia,serif;color:{INK}">{e(settings['name'])}</div>
<div style="border-top:3px double {INK};border-bottom:1px solid {INK};margin-top:12px;padding:6px 0;font:bold 11px Arial,sans-serif;letter-spacing:1px;color:{INK};text-transform:uppercase">{e(long_date(ed['date']))}</div></td></tr>
<tr><td style="padding:10px 26px 26px">
<div style="font:bold 11px Arial,sans-serif;letter-spacing:1px;color:{BLUE};text-transform:uppercase">{e(ed['front']['kicker'])}</div>
<div style="font:bold 26px/1.2 Georgia,serif;color:{INK};margin:6px 0 8px">{e(ed['front']['headline'])}</div>
<div style="font:italic 16px/1.5 Georgia,serif;color:{MUTED};margin-bottom:16px">{e(ed['front']['dek'])}</div>
<div style="font:bold 11px Arial,sans-serif;letter-spacing:1px;color:{MUTED};text-transform:uppercase;margin-bottom:4px">At a glance</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{brief}</table>
{changes}
<div style="font:bold 11px Arial,sans-serif;letter-spacing:1px;color:{MUTED};text-transform:uppercase;margin:22px 0 4px">World news</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{world}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr><td style="background:{BLUE};border-radius:4px"><a href="{e(link)}" style="display:inline-block;padding:13px 24px;font:bold 15px Arial,sans-serif;color:#FFFFFF;text-decoration:none">Open today's edition</a></td></tr></table>
</td></tr>
<tr><td style="padding:14px 26px;border-top:1px solid {RULE};font:12px/1.5 Arial,sans-serif;color:{MUTED}">Sent automatically each morning. Opening the site and pressing Mark as read starts the 2-day timer.</td></tr>
</table></td></tr></table></body></html>"""


def body_text(settings, ed):
    lines = [settings["name"], long_date(ed["date"]), "", ed["front"]["headline"], ed["front"]["dek"], "", "At a glance:"]
    lines += [f"{i}. {b}" for i, b in enumerate(ed["brief"], 1)]
    lines += ["", "World news:"] + [f"- {s['headline']} ({s['source']}) {s['url']}" for s in ed["world"]]
    lines += ["", "Open today's edition: " + settings["site_url"].rstrip("/") + "/#ed-" + ed["date"]]
    return "\n".join(lines)


def send(settings, ed, retry_wait=900):
    """Returns 'sent', 'failed' or 'not_sent' (no credentials). Tries twice, 15 minutes apart."""
    addr, pw = os.environ.get("GMAIL_ADDRESS", "").strip(), os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "")
    if not addr or not pw:
        print("Email skipped: GMAIL_ADDRESS or GMAIL_APP_PASSWORD is not set.")
        return "not_sent"
    msg = MIMEMultipart("alternative")
    msg["Subject"], msg["From"], msg["To"] = subject(settings, ed), f"{settings['name']} <{addr}>", addr
    msg.attach(MIMEText(body_text(settings, ed), "plain", "utf-8"))
    msg.attach(MIMEText(body_html(settings, ed), "html", "utf-8"))
    for attempt in range(2):
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=60) as s:
                s.login(addr, pw)
                s.sendmail(addr, [addr], msg.as_string())
            print("Email sent.")
            return "sent"
        except smtplib.SMTPAuthenticationError as e:
            print(f"Email login refused (check the app password): {e.smtp_code}")
            return "failed"
        except Exception as e:
            print(f"Email attempt {attempt + 1} failed: {e}")
            if attempt == 0:
                time.sleep(retry_wait)
    return "failed"
