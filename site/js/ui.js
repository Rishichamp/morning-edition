/* Shared interface: top bar, toasts, confirm dialog, desk drawer,
   theme, page turn and fade helpers. */
(function () {
  const C = window.DE_CONFIG, S = window.DE_STORE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let motionPref = "system";
  try { motionPref = localStorage.getItem("dailyEdition.motion") || "system"; } catch (e) {}
  const RM = motionPref === "off" || (motionPref !== "on" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.documentElement.classList.toggle("reduce", RM);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fmtDay(k, o) { return new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: "UTC" }, o)).format(new Date(k + "T00:00:00Z")); }
  const longDate = k => fmtDay(k, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const shortDate = k => fmtDay(k, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  function fmtTime(iso) { return new Intl.DateTimeFormat("en-GB", { timeZone: C.timeZone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(iso)) + " IST"; }
  const edCode = k => "ED-" + k.replace(/-/g, "");

  /* ---------- theme ---------- */
  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return "light";
  }
  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("dailyEdition.theme", next); } catch (e) {}
    const b = $("#theme-btn"); if (b) b.textContent = next === "dark" ? "Light" : "Dark";
    document.dispatchEvent(new CustomEvent("de:theme"));
  }

  /* buttons keep plain text labels (kept as no-ops so view code stays simple) */
  function roll(el, text) { if (text != null) el.textContent = text; }
  function rollAll() {}

  /* ---------- logo mark: a folded newspaper ---------- */
  const mark = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5h11l5 5v9H4z"/><path d="M15 5v5h5"/><path d="M7 12h6M7 15h10"/></svg>`;

  /* ---------- chrome ---------- */
  function chrome() {
    const nav = document.createElement("header");
    nav.className = "nav";
    nav.innerHTML = `<div class="nav-in">
      <a class="nav-logo" id="nav-logo" href="#shelf" aria-label="${esc(C.name)}, home">${mark}<span class="nav-name">${esc(C.name)}</span></a>
      <nav aria-label="Main"><ul class="nav-links">
        <li><a href="#shelf" data-route="home">Shelf</a></li>
        <li><a href="#today" data-route="today">Today</a></li>
        <li class="hide-sm"><a href="#deleted" id="nav-deleted" data-route="deleted" aria-label="Recently deleted">Deleted</a></li>
        <li><button type="button" id="theme-btn">${currentTheme() === "dark" ? "Light" : "Dark"}</button></li>
        <li><button type="button" id="desk-btn" aria-haspopup="dialog">Desk</button></li>
      </ul></nav></div>`;
    document.body.prepend(nav);
    $("#theme-btn").addEventListener("click", toggleTheme);
    $("#desk-btn").addEventListener("click", openDesk);

    document.body.insertAdjacentHTML("beforeend", `
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <dialog class="confirm" id="confirm"><h2></h2><p></p><div class="acts"><button class="pill ghost" value="no" type="button">Cancel</button><button class="pill danger" value="yes" type="button">Delete</button></div></dialog>
      <dialog class="confirm mail-preview" id="mail-preview" aria-label="Email preview"><div class="mp-head"><h2>Email preview</h2><button class="pill ghost sm" type="button" id="mp-close">Close</button></div><iframe title="Email preview" sandbox=""></iframe></dialog>
      <div class="drawer-back" id="drawer-back"></div>
      <aside class="drawer" id="desk" role="dialog" aria-modal="true" aria-labelledby="desk-title" tabindex="-1"></aside>`);
    $("#mp-close").onclick = () => $("#mail-preview").close();
    badge();
  }
  function setCurrent(route) {
    $$("[data-route]").forEach(a => { if (a.dataset.route === route) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  }
  function badge() {
    const a = $("#nav-deleted"); if (!a) return;
    const n = S.list("deleted").length, b = $(".badge", a);
    if (b) b.remove();
    if (n) a.insertAdjacentHTML("beforeend", `<span class="badge" aria-hidden="true">${n}</span>`);
    a.setAttribute("aria-label", `Recently deleted${n ? ", " + n + " items" : ""}`);
  }
  function previewEmail(html) {
    const d = $("#mail-preview");
    $("iframe", d).srcdoc = html;
    d.showModal();
  }

  /* ---------- toast with undo ---------- */
  let toastTimer;
  function toast(msg, opts = {}) {
    const ms = opts.ms || (opts.undo ? 8000 : 3500);
    const t = $("#toast");
    t.classList.remove("show"); void t.offsetWidth;
    t.style.setProperty("--ms", ms + "ms");
    t.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button type="button">Undo</button>' : ""}<i class="bar"></i>`;
    t.classList.add("show");
    clearTimeout(toastTimer);
    const hide = () => t.classList.remove("show");
    toastTimer = setTimeout(hide, ms);
    if (opts.undo) $("button", t).addEventListener("click", () => { clearTimeout(toastTimer); hide(); opts.undo(); });
  }

  /* ---------- confirm (asks once) ---------- */
  function confirmBox(title, text, yes = "Delete") {
    const d = $("#confirm");
    $("h2", d).textContent = title; $("p", d).textContent = text; $('[value="yes"]', d).textContent = yes;
    return new Promise(res => {
      const done = v => { d.close(); res(v); };
      $('[value="yes"]', d).onclick = () => done(true);
      $('[value="no"]', d).onclick = () => done(false);
      d.oncancel = () => res(false);
      d.showModal();
    });
  }

  /* ---------- desk drawer: manual jobs and test clock ---------- */
  function openDesk() {
    const d = $("#desk"), m = S.meta();
    const off = S.clockOffset();
    d.innerHTML = `
      <div class="d-head"><h2 id="desk-title">The desk</h2><button class="pill ghost sm" id="desk-close" type="button">Close</button></div>
      ${C.source === "feed" ? feedDesk() : `<div class="d-sec">
        <span class="mono spec">What runs by itself</span>
        <div class="cap"><span>Cleanup on every page load</span><span class="ok">Automatic</span></div>
        <div class="cap"><span>Daily publish at ${esc(C.publishTime)} IST</span><span class="man">Manual for now</span></div>
        <div class="cap"><span>Cleanup at ${esc(C.cleanupTime)} IST</span><span class="man">Manual for now</span></div>
        <div class="cap"><span>Newsletter email</span><span class="man">Copy HTML</span></div>
        <div class="cap"><span>Sync phone and laptop</span><span class="${window.DE_SYNC && window.DE_SYNC.status.state === "on" ? "ok" : "man"}">${window.DE_SYNC && window.DE_SYNC.status.state === "on" ? "On" : "Off"}</span></div>
        <p class="mono">Sync: ${esc(window.DE_SYNC ? window.DE_SYNC.status.note : "This browser only")}</p>
      </div>
      <div class="d-sec">
        <span class="mono spec">Jobs</span>
        <p>Use these each morning until the schedule is connected.</p>
        <div class="acts"><button class="pill accent-btn" id="job-gen" type="button">Generate today's edition</button><button class="pill ghost" id="job-clean" type="button">Run cleanup</button></div>
        <p class="mono">Last cleanup: ${m.lastCleanup ? esc(fmtTime(m.lastCleanup)) : "never"}</p>
      </div>
      <div class="d-sec">
        <span class="mono spec">Test clock</span>
        <p>Move time forward to watch the countdowns and timers work. The clock only moves on this device, but editions it deletes are deleted everywhere when sync is on.</p>
        <div class="clock">${esc(fmtTime(S.now().toISOString()))}${off ? ` · shifted +${Math.round(off / 36e5)} h` : " · real time"}</div>
        <div class="acts"><button class="pill ghost sm" data-clock="1" type="button">+1 day</button><button class="pill ghost sm" data-clock="0.25" type="button">+6 hours</button><button class="pill ghost sm" data-clock="reset" type="button">Real time</button></div>
      </div>
      <div class="d-sec">
        <span class="mono spec">Motion</span>
        <p>Your device asks for ${matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full"} motion. Choose what this site does.</p>
        <div class="filters" role="group" aria-label="Motion">${["system", "on", "off"].map(v => `<button class="filter" type="button" data-motion="${v}" aria-pressed="${motionPref === v}">${v === "system" ? "Follow device" : v === "on" ? "On" : "Off"}</button>`).join("")}</div>
      </div>
      <div class="d-sec">
        <span class="mono spec">Sample data</span>
        <p>Brings back the six test editions: unread, read and expiring, emailed and expiring, kept, email failed and recently deleted.</p>
        <div class="acts"><button class="pill danger sm" id="job-reset" type="button">Reset sample data</button></div>
      </div>`}`;
    document.body.classList.add("drawer-open");
    d.focus();
    const close = () => { document.body.classList.remove("drawer-open"); $("#desk-btn").focus(); };
    $("#desk-close").onclick = close;
    $("#drawer-back").onclick = close;
    d.onkeydown = e => { if (e.key === "Escape") close(); };
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on("#job-check", async () => { await window.DE_ROUTER.check(); toast(window.DE_FEED.status.note); openDesk(); });
    on("#job-clear", async () => {
      if (!(await confirmBox("Clear this device?", "Forgets which editions you read, kept or deleted on this device, then loads the published editions again.", "Clear"))) return;
      S.clearDevice(); close(); await window.DE_ROUTER.check(); toast("This device was cleared."); refresh();
    });
    if (!$("#job-gen")) { bindCommon(); return; }
    $("#job-gen").onclick = () => {
      const r = S.generateToday();
      toast(r.created ? "Today's edition is published." : "Today's edition is already on the shelf.");
      close(); refresh();
    };
    $("#job-clean").onclick = () => {
      const r = S.cleanup();
      toast(`Cleanup done: ${r.deleted.length} moved to Recently deleted, ${r.purged.length} removed for good.`);
      close(); refresh();
    };
    bindCommon();
    function bindCommon() {
    $$("[data-clock]", d).forEach(b => b.onclick = () => {
      const v = b.dataset.clock;
      S.setClockOffset(v === "reset" ? 0 : S.clockOffset() + parseFloat(v) * S.DAY);
      const r = S.cleanup();
      toast(`Clock moved. Cleanup ran: ${r.deleted.length} deleted, ${r.purged.length} purged.`);
      openDesk(); refresh();
    });
    $$("[data-motion]", d).forEach(b => b.onclick = () => {
      try { localStorage.setItem("dailyEdition.motion", b.dataset.motion); } catch (e) {}
      location.reload();
    });
    }
    on("#job-reset", async () => {
      if (!(await confirmBox("Reset sample data?", "This replaces every edition in this browser with the six sample editions and sets the clock back to real time.", "Reset"))) return;
      S.resetAll(); close(); toast("Sample data restored."); refresh();
    });
  }

  /* Desk when editions come from the daily job */
  function feedDesk() {
    const f = window.DE_FEED ? window.DE_FEED.status : { note: "" };
    const off = S.clockOffset();
    return `<div class="d-sec">
        <span class="mono spec">What runs by itself</span>
        <div class="cap"><span>Research and publish at about ${esc(C.publishTime)} IST</span><span class="ok">Automatic</span></div>
        <div class="cap"><span>Morning email to your newsletter inbox</span><span class="ok">Automatic</span></div>
        <div class="cap"><span>Cleanup when the page opens</span><span class="ok">Automatic</span></div>
        <div class="cap"><span>Read and unread across devices</span><span class="man">Per device</span></div>
        <p class="mono">${esc(f.note)}</p>
        <div class="acts"><button class="pill accent-btn" id="job-check" type="button">Check for new editions</button></div>
      </div>
      <div class="d-sec">
        <span class="mono spec">Test clock</span>
        <p>Move time forward on this device to watch countdowns and timers.</p>
        <div class="clock">${esc(fmtTime(S.now().toISOString()))}${off ? ` · shifted +${Math.round(off / 36e5)} h` : " · real time"}</div>
        <div class="acts"><button class="pill ghost sm" data-clock="1" type="button">+1 day</button><button class="pill ghost sm" data-clock="0.25" type="button">+6 hours</button><button class="pill ghost sm" data-clock="reset" type="button">Real time</button></div>
      </div>
      <div class="d-sec">
        <span class="mono spec">Motion</span>
        <p>Page turns and fades. Your device asks for ${matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full"} motion.</p>
        <div class="filters" role="group" aria-label="Motion">${["system", "on", "off"].map(v => `<button class="filter" type="button" data-motion="${v}" aria-pressed="${motionPref === v}">${v === "system" ? "Follow device" : v === "on" ? "On" : "Off"}</button>`).join("")}</div>
      </div>
      <div class="d-sec">
        <span class="mono spec">This device</span>
        <p>Forget read, kept and deleted choices on this device only.</p>
        <div class="acts"><button class="pill danger sm" id="job-clear" type="button">Clear this device</button></div>
      </div>`;
  }
  function refresh() { if (window.DE_PAGE && window.DE_PAGE.refresh) window.DE_PAGE.refresh(); }

  /* ---------- motion: page turn and gentle fades ---------- */
  function motionOn() { return !RM; }
  function loader() { const L = $("#loader"); if (L) L.remove(); return Promise.resolve(); }
  function smooth() {}
  function scrollToY(y) { scrollTo(0, y); }
  function stopScroll() {}
  let fadeIO = null;
  function resetMotion() { if (fadeIO) fadeIO.disconnect(); scrollTo(0, 0); }

  /* sections fade up softly as they come into view */
  function revealLines(root = document) {
    const els = $$(".fade", root);
    if (RM || !("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
    if (fadeIO) fadeIO.disconnect();
    fadeIO = new IntersectionObserver(list => list.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("in"); fadeIO.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach(e => fadeIO.observe(e));
  }

  /* turning the page: the old sheet swings away, the new one swings in.
     dir = 1 goes forward (to an older or deeper page), -1 goes back. */
  function turnPage(dir, swap) {
    const m = $("#main");
    if (RM || !m.animate || document.hidden) { swap(); return; }
    m.style.transformOrigin = dir > 0 ? "left center" : "right center";
    const out = m.animate([
      { transform: "perspective(2200px) rotateY(0deg)", opacity: 1 },
      { transform: `perspective(2200px) rotateY(${dir > 0 ? -28 : 28}deg)`, opacity: 0 }
    ], { duration: 280, easing: "cubic-bezier(.4,0,1,1)" });
    let done = false;
    const go = () => {
      if (done) return; done = true;
      swap();
      m.style.transformOrigin = dir > 0 ? "right center" : "left center";
      m.animate([
        { transform: `perspective(2200px) rotateY(${dir > 0 ? 22 : -22}deg)`, opacity: 0 },
        { transform: "perspective(2200px) rotateY(0deg)", opacity: 1 }
      ], { duration: 420, easing: "cubic-bezier(0,0,.2,1)" });
    };
    out.onfinish = go;
    setTimeout(go, 400);   // never wait on a paused animation
  }

  /* status chips + countdown */
  function stateHTML(r) {
    const cd = S.countdown(r);
    return `<span class="chips">${S.chips(r).map(c => `<span class="chip ${c.k}">${esc(c.t)}</span>`).join("")}</span>` +
      (cd ? `<span class="countdown mono">${esc(cd)}</span>` : "");
  }
  function morphState(el) {
    if (RM || !el || !el.animate) return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "ease-out" });
  }
  function collapse(el) {
    return new Promise(res => {
      if (RM || !el || !el.animate || document.hidden) return res();
      let done = false; const fin = () => { if (!done) { done = true; res(); } };
      setTimeout(fin, 600);   // never wait on a paused animation
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: "ease-in", fill: "forwards" }).onfinish = fin;
    });
  }

  /* ---------- shared actions with Undo ---------- */
  async function act(kind, date, after) {
    const r = S.get(date); if (!r) return;
    const snap = S.snapshot([date]);
    const undo = () => { S.putBack(snap); toast("Undone."); after && after("undo"); };
    if (kind === "toggle") {
      if (r.status === "read") { S.markUnread(date); toast("Marked as unread. It stays until you read it.", { undo }); }
      else { S.markRead(date); toast(`Marked as read. Deletes in ${C.readDeleteDays} days.`, { undo }); }
      after && after(kind);
    } else if (kind === "delete") {
      if (!(await confirmBox("Delete this edition?", `It moves to Recently deleted for ${C.trashDays} days. You can restore it from there.`))) return;
      await (after && after("before-delete"));
      S.remove(date); toast("Edition deleted.", { undo });
      after && after(kind);
    } else if (kind === "restore") {
      S.restore(date); toast("Restored as unread.", { undo }); after && after(kind);
    } else if (kind === "purge") {
      if (!(await confirmBox("Delete forever?", "This cannot be undone. The edition and its content are removed from the site.", "Delete forever"))) return;
      S.purge(date); toast("Deleted for good."); after && after(kind);
    }
  }

  /* ---------- newsletter HTML (Gmail-friendly tables, inline styles) ---------- */
  function emailHTML(r, c) {
    const link = (C.siteUrl || location.href.split("#")[0]) + "#ed-" + r.date;
    const ink = "#1A2638", cream = "#FFFFFF", orange = "#2D5A94", muted = "#66768C";
    const li = c.brief.map((b, i) => `<tr><td style="padding:10px 0;border-top:1px dashed #D7DFEA;font:14px/1.5 Arial,sans-serif;color:${ink}"><span style="font:bold 14px Georgia,serif;color:${orange}">${i + 1}</span>&nbsp;&nbsp;${esc(b)}</td></tr>`).join("");
    const heads = (c.stories ? c.stories.concat(c.india || []) : c.world).map(s => `<tr><td style="padding:12px 0;border-top:1px solid #D7DFEA"><div style="font:bold 17px/1.3 Georgia,serif;color:${ink}">${esc(s.headline)}</div><div style="font:14px/1.5 Arial,sans-serif;color:${muted};margin-top:4px">${esc(s.dek || (s.summary || "").split(". ")[0])}</div></td></tr>`).join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(C.name)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="background:${ink};padding:22px 24px;border-radius:6px 6px 0 0"><div style="font:bold 28px/1.1 Georgia,serif;color:${cream}">${esc(C.name)}</div><div style="font:11px Arial,sans-serif;letter-spacing:1px;color:#A9C1E0;margin-top:6px;text-transform:uppercase">${esc(longDate(r.date))} &middot; ${esc(C.publishTime)} IST</div></td></tr>
<tr><td style="background:#FFFFFF;padding:24px;border:1px solid #D7DFEA;border-top:0">
<div style="font:italic 14px Georgia,serif;color:${orange}">${esc(c.front.kicker)}</div>
<div style="font:bold 26px/1.2 Georgia,serif;color:${ink};margin:6px 0 16px">${esc(c.front.headline)}</div>
<div style="font:bold 11px Arial,sans-serif;letter-spacing:1px;color:${muted};text-transform:uppercase;margin-bottom:4px">60-second brief</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${li}</table>
<div style="font:bold 11px Arial,sans-serif;letter-spacing:1px;color:${muted};text-transform:uppercase;margin:22px 0 4px">Top headlines</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${heads}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 6px"><tr><td style="background:${orange};border-radius:4px"><a href="${esc(link)}" style="display:inline-block;padding:14px 26px;font:bold 15px Arial,sans-serif;color:${cream};text-decoration:none">Open today's edition</a></td></tr></table>
</td></tr>
<tr><td style="padding:16px 24px;font:12px/1.5 Arial,sans-serif;color:${muted}">Sent automatically. Opening the site and pressing Mark as read starts the ${C.readDeleteDays}-day timer.</td></tr>
</table></td></tr></table></body></html>`;
  }

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  function prefersTheme() {
    try { const t = localStorage.getItem("dailyEdition.theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
  }

  window.DE_UI = {
    $, $$, esc, RM, motionOn, longDate, shortDate, fmtTime, edCode, mark,
    chrome, setCurrent, badge, previewEmail, resetMotion, turnPage, toast, confirmBox, roll, rollAll, loader, smooth, scrollToY, stopScroll,
    revealLines, stateHTML, morphState, collapse, act, emailHTML, prefersTheme
  };
})();
