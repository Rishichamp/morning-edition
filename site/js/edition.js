/* Edition view: one long newspaper scroll with a sticky action bar. */
(function () {
  const C = window.DE_CONFIG, S = window.DE_STORE, U = window.DE_UI;
  const { $, $$, esc } = U;
  let date = null, active = false;
  let promptTimer = null, promptDismissed = false, io = null;

  const toggleBtn = (r, cls = "") => r.status === "read"
    ? `<button class="pill unread-btn ${cls}" data-act="toggle" type="button">Mark as unread</button>`
    : `<button class="pill read-btn ${cls}" data-act="toggle" type="button">Mark as read</button>`;

  function neighbours() {
    const list = S.list("all");
    const i = list.findIndex(x => x.date === date);
    return { newer: i > 0 ? list[i - 1] : null, older: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
  }

  function emailLine(r) {
    if (C.source === "feed") {
      if (r.emailStatus === "sent") return `Emailed to your newsletter inbox ${esc(U.fmtTime(r.emailedAt))}.`;
      if (r.emailStatus === "failed") return "The morning email could not be sent. The job tries again on its next run.";
      return "Not emailed: the email step is off or its password is not set yet.";
    }
    if (r.emailStatus === "sent") return `Sent ${esc(U.fmtTime(r.emailedAt))}. It will not be sent again.`;
    if (r.emailStatus === "failed") return `Sending failed after ${r.emailAttempts || 2} tries. Copy the HTML and send it yourself, then press “I sent it”.`;
    return "Not sent yet. Automatic sending is not connected, so copy the address, subject and HTML into a new mail.";
  }

  function middle(c) {
    if (Array.isArray(c.changes)) {
      const items = c.changes.length
        ? `<ul class="changes">${c.changes.map(ch => `<li>
            <p class="label">Since ${esc(U.shortDate(ch.since))} · ${esc(ch.earlier)}</p>
            <h3>${esc(ch.headline)}</h3><p>${esc(ch.update)}</p>
            <p class="src"><a href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer">${esc(ch.source)} ↗</a></p></li>`).join("")}</ul>`
        : `<p class="note">No follow-ups today: none of today's stories continue an earlier one. This section fills in as the knowledge base grows.</p>`;
      return `<section class="e-sec fade" id="changes" aria-labelledby="changes-h">
      <div class="e-flag"><h2 id="changes-h">What changed since yesterday</h2><span class="label">From the knowledge base</span></div>
      ${items}
    </section>`;
    }
    if (!c.myDay) return "";
    const d = c.myDay;
    return `
    <section class="e-sec fade" id="myday" aria-labelledby="myday-h">
      <div class="e-flag"><h2 id="myday-h">My day</h2><span class="label">Names and message text hidden</span></div>
      <div class="cols3">
        <div class="panel"><h3>Inbox</h3><span class="sub">Unread, last 24 hours</span>
          ${d.inbox.map(g => `<p class="grp">${esc(g.group)}</p><ul>${g.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")}
        </div>
        <div class="panel cal"><h3>Tomorrow</h3><span class="sub">${esc(U.longDate(S.addDays(date, 1)))}</span>
          <ul>${d.calendar.map(e => `<li><span class="tm">${esc(e.t)}</span><span>${esc(e.e)}</span>${e.clash ? '<span class="clash">Clash</span>' : "<span></span>"}</li>`).join("")}</ul>
        </div>
        <div class="panel"><h3>Slack</h3><span class="sub">Needs a reply</span>
          <p class="note">${esc(d.slack.note)}</p>
          <ul>${d.slack.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
        </div>
      </div>
    </section>`;
  }

  function body(r, c) {
    const n = neighbours();
    const [top, ...rest] = c.world;
    const story = (s, i, cls) => `<article class="story ${cls}">
        <div><p class="label">${String(i + 1).padStart(2, "0")} · World</p><h3>${esc(s.headline)}</h3>${cls ? `<p>${esc(s.summary)}</p>` : ""}</div>
        <div>${cls ? "" : `<p>${esc(s.summary)}</p>`}
          <p class="why"><b>Why it matters to you</b>${esc(s.why)}</p>
          <p class="src">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.source)} ↗</a>` : `<span>${esc(s.source)} · no link</span>`}${s.unverified ? '<span class="unv">Unverified*</span>' : ""}</p>
        </div></article>`;
    return `
    <header class="ed-mast">
      <a class="name" href="#shelf">${esc(C.name)}</a>
      <div class="dateline"><span>${esc(U.longDate(date))}</span><span class="hide-sm">${esc(c.front.kicker)}</span><span>${U.edCode(date)}</span></div>
    </header>

    <section class="front" id="front" aria-labelledby="front-h">
      <p class="kicker">Front page${c.sample ? ' · <span class="unv">sample</span>' : ""}</p>
      <h1 class="front-h" id="front-h">${esc(c.front.headline)}</h1>
      <p class="dek">${esc(c.front.dek)}</p>
      <div class="byline"><span>Published ${esc(U.fmtTime(r.publishedAt))} · about 5 minutes to read</span><span class="card-state" id="front-state">${U.stateHTML(r)}</span></div>
    </section>

    <section class="e-sec fade" id="brief" aria-labelledby="brief-h">
      <div class="glance">
        <div class="e-flag" style="border:0;padding:0;margin-bottom:12px"><h2 id="brief-h">At a glance</h2><span class="label">Three things not to miss</span></div>
        <ol class="brief-cols">${c.brief.map(b => `<li>${esc(b)}</li>`).join("")}</ol>
      </div>
    </section>

    ${middle(c)}

    <section class="e-sec fade" id="world" aria-labelledby="world-h">
      <div class="e-flag"><h2 id="world-h">World news</h2><span class="label">For you: ${esc(C.topics.join(", "))}</span></div>
      <div class="news">
        ${top ? story(top, 0, "top") : ""}
        ${rest.map((s, i) => story(s, i + 1, "")).join("")}
      </div>
    </section>

    <section class="question fade" id="question" aria-labelledby="q-h">
      <span class="label" id="q-h">Editor's question</span>
      <blockquote>${esc(c.question)}</blockquote>
    </section>

    <section class="e-sec fade" id="record" aria-labelledby="record-h">
      <div class="e-flag"><h2 id="record-h">The record</h2><span class="label">How this edition was made</span></div>
      <div class="record-grid">
        <dl class="fine">
          <div class="row"><dt>Reporting window</dt><dd>${esc(c.record.window)}</dd></div>
          <div class="row"><dt>Privacy rule</dt><dd>${esc(c.record.privacy)}</dd></div>
          <div class="row"><dt>Verification rule</dt><dd>${esc(c.record.verification)}</dd></div>
          <div class="row"><dt>Not verified*</dt><dd><ul>${c.record.unverified.map(u => `<li>${esc(u)}</li>`).join("")}</ul></dd></div>
          <div class="row"><dt>Lifecycle</dt><dd>Mark as read starts a ${C.readDeleteDays}-day timer. An emailed edition you never touch clears after ${C.emailDeleteDays} days. Mark as unread keeps it until you read it.</dd></div>
        </dl>
        ${C.source === "feed" ? `<div class="email-box" id="email-box">
          <span class="label">Newsletter</span>
          <h3>Morning email</h3>
          <p class="note" id="email-line">${emailLine(r)}</p>
          <dl class="mail-meta"><div><dt>Subject</dt><dd>${esc(emailSubject(r, c))}</dd></div></dl>
          <div class="acts"><button class="pill ghost sm" type="button" id="preview-email">Preview</button></div>
        </div>` : `<div class="email-box" id="email-box">
          <span class="label">Newsletter</span>
          <h3>Email copy</h3>
          <p class="note" id="email-line">${emailLine(r)}</p>
          <dl class="mail-meta">
            <div><dt>Send to</dt><dd>${C.archiveEmail ? esc(C.archiveEmail) : "Not set: add it in js/config.js"}</dd></div>
            <div><dt>Subject</dt><dd>${esc(emailSubject(r, c))}</dd></div>
          </dl>
          <div class="acts">
            ${C.archiveEmail ? '<button class="pill ghost sm" type="button" id="copy-to">Copy address</button>' : ""}
            <button class="pill ghost sm" type="button" id="copy-subject">Copy subject</button>
            <button class="pill ghost sm" type="button" id="copy-email">Copy email</button>
            <button class="pill ghost sm" type="button" id="preview-email">Preview</button>
            <button class="pill read-btn sm" type="button" id="sent-email" ${r.emailStatus === "sent" ? "disabled" : ""}>I sent it</button>
          </div>
        </div>`}
      </div>
    </section>

    <nav class="prevnext" aria-label="Other editions">
      ${n.newer ? `<a class="prev" href="#ed-${n.newer.date}"><span class="label">← Newer · ${esc(U.shortDate(n.newer.date))}</span><span class="t">${esc(n.newer.headline)}</span></a>` : '<span class="none">This is the newest edition.</span>'}
      ${n.older ? `<a class="next" href="#ed-${n.older.date}"><span class="label">Older · ${esc(U.shortDate(n.older.date))} →</span><span class="t">${esc(n.older.headline)}</span></a>` : '<span class="none" style="text-align:right">No older editions.</span>'}
    </nav>`;
  }

  function missing(r) {
    const del = r && r.status === "deleted";
    return `<section class="page-head">
      <p class="label">${U.edCode(date)}</p>
      <h1>${del ? "In Recently deleted" : "Not on the shelf"}</h1>
      <p>${del ? `This edition was deleted. ${esc(S.countdown(r))}. Restore it to read it again.` : (date === S.todayKey() ? (C.source === "feed" ? `Today's edition has not arrived yet. The morning job publishes it at about ${esc(C.publishTime)} IST; GitHub can run it a little late.` : `Today's edition has not been published yet. It arrives at ${esc(C.publishTime)} IST, or publish it from the desk.`) : "This edition was removed for good, or it never existed.")}</p>
      <div style="display:flex;gap:10px;margin-top:28px;flex-wrap:wrap">
        ${del ? '<button class="pill read-btn lg" id="restore-here" type="button">Restore</button>' : (date === S.todayKey() ? `<button class="pill accent-btn lg" id="gen-here" type="button">${C.source === "feed" ? "Check again" : "Generate today's edition"}</button>` : "")}
        <a class="pill ghost lg" href="#shelf">Back to the shelf</a>
      </div></section>`;
  }

  function renderSticky(r) {
    const bar = $("#sticky");
    if (!r || r.status === "deleted") { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = `<span class="sb-state card-state">${U.stateHTML(r)}</span>${toggleBtn(r, "sm")}<button class="pill danger sm" data-act="delete" type="button">Delete</button>`;
    U.rollAll(bar);
  }

  function updateState(animate) {
    const r = S.get(date);
    renderSticky(r);
    const fs = $("#front-state"); if (fs) fs.innerHTML = U.stateHTML(r);
    const el = $("#email-line"); if (el) el.innerHTML = emailLine(r);
    const sb = $("#sent-email"); if (sb) sb.disabled = r.emailStatus === "sent";
    if (animate) { U.morphState($("#sticky .card-state")); U.morphState(fs); }
  }

  function render() {
    const r = S.get(date), c = r && S.content(date);
    const main = $("#main");
    if (!r || !c || r.status === "deleted") {
      document.title = `${C.name} · ${U.edCode(date)}`;
      main.innerHTML = missing(r); U.rollAll(main); renderSticky(null);
      const rb = $("#restore-here"); if (rb) rb.onclick = () => { S.restore(date); U.toast("Restored as unread."); render(); };
      const gb = $("#gen-here"); if (gb) gb.onclick = async () => {
        if (C.source === "feed") { await window.DE_ROUTER.check(); U.toast(window.DE_FEED.status.note); return; }
        S.generateToday(); U.toast("Today's edition is published."); render();
      };
      return;
    }
    document.title = `${r.headline} · ${C.name}`;
    main.innerHTML = body(r, c);
    U.rollAll(main);
    renderSticky(r);
    wireEmail(r, c);
    watchEnd();
    motion();
  }

  /* ---------- actions ---------- */
  document.addEventListener("click", async e => {
    if (!active) return;
    const b = e.target.closest("#sticky [data-act]"); if (!b) return;
    const kind = b.dataset.act;
    await U.act(kind, date, phase => {
      if (phase === "before-delete") return;
      if (phase === "delete") { render(); return; }
      if (phase === "undo" && !$("#front")) { render(); return; }
      updateState(true);
    });
  });

  /* subject starts with the paper's name so the Gmail filter files it under the label */
  function emailSubject(r, c) { return `${C.name} · ${U.longDate(r.date)} · ${c.front.headline}`; }

  async function copyText(text, done) {
    try { await navigator.clipboard.writeText(text); U.toast(done); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); U.toast(done); } catch (er) { U.toast("Copy blocked by the browser. Select the text and copy it by hand."); }
      ta.remove();
    }
  }

  function wireEmail(r, c) {
    const to = $("#copy-to");
    if (to) to.onclick = () => copyText(C.archiveEmail, "Address copied.");
    $("#preview-email").onclick = () => U.previewEmail(U.emailHTML(S.get(date), c));
    if (!$("#copy-subject")) return;
    $("#copy-subject").onclick = () => copyText(emailSubject(S.get(date), c), "Subject copied.");
    $("#copy-email").onclick = async () => {
      const html = U.emailHTML(S.get(date), c);
      const body = html.slice(html.indexOf("<table"), html.lastIndexOf("</table>") + 8);
      try {
        // formatted copy: pastes into Gmail as the finished newsletter, not as code
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([body], { type: "text/html" }),
          "text/plain": new Blob([c.brief.join("\n")], { type: "text/plain" })
        })]);
        U.toast("Email copied. Paste it into the body of a new Gmail message.");
      } catch (e) { copyText(html, "Email HTML copied (as code). Use Preview to copy it formatted."); }
    };
    $("#preview-email").onclick = () => U.previewEmail(U.emailHTML(S.get(date), c));
    $("#sent-email").onclick = () => {
      const snap = S.snapshot([date]);
      S.markEmailed(date);
      const x = S.get(date);
      U.toast(x.deleteAfter && x.status === "unread" ? `Marked as emailed. Deletes in ${C.emailDeleteDays} days unless you act.` : "Marked as emailed.", { undo: () => { S.putBack(snap); updateState(true); } });
      updateState(true);
    };
  }

  /* ---------- "Mark as read?" after 10 s on the last section ---------- */
  function watchEnd() {
    if (io) io.disconnect();
    clearTimeout(promptTimer);
    const target = $("#record"); if (!target || !("IntersectionObserver" in window)) return;
    io = new IntersectionObserver(([en]) => {
      clearTimeout(promptTimer);
      if (en.isIntersecting) promptTimer = setTimeout(() => {
        const r = S.get(date);
        if (active && r && r.status === "unread" && !promptDismissed) $("#read-prompt").classList.add("show");
      }, 10000);
    }, { threshold: 0.2 });
    io.observe(target);
  }
  $("#rp-yes").onclick = () => {
    $("#read-prompt").classList.remove("show"); promptDismissed = true;
    const snap = S.snapshot([date]); S.markRead(date);
    U.toast(`Marked as read. Deletes in ${C.readDeleteDays} days.`, { undo: () => { S.putBack(snap); updateState(true); } });
    updateState(true);
  };
  $("#rp-no").onclick = () => { $("#read-prompt").classList.remove("show"); promptDismissed = true; };

  /* ---------- motion: sections fade in as you read ---------- */
  function motion() { U.revealLines($("#main")); }
  document.addEventListener("de:theme", () => { if (active) render(); });

  window.DE_VIEWS = window.DE_VIEWS || {};
  window.DE_VIEWS.edition = {
    mount(route) { date = route.date; active = true; promptDismissed = false; render(); },
    unmount() {
      active = false;
      if (io) io.disconnect();
      clearTimeout(promptTimer);
      $("#read-prompt").classList.remove("show");
      $("#sticky").hidden = true;
    },
    refresh: () => render(),
    remote() {
      const r = S.get(date);
      if ($("#front") && r && r.status !== "deleted") updateState(true); else render();
    }
  };
})();
