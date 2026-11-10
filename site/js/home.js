/* Shelf view: the front page with today's edition and the shelf of older editions. */
(function () {
  const C = window.DE_CONFIG, S = window.DE_STORE, U = window.DE_UI;
  const { $, $$, esc } = U;
  let filter = "all", query = "", limit = 12;

  const toggleBtn = (r, cls) => r.status === "read"
    ? `<button class="pill unread-btn ${cls}" data-act="toggle" type="button">Mark as unread</button>`
    : `<button class="pill read-btn ${cls}" data-act="toggle" type="button">Mark as read</button>`;

  const shell = () => {
    const unread = S.list("unread").length;
    return `
  <header class="masthead">
    <div class="ears">
      <p class="ear">Published every morning at ${esc(C.publishTime)} IST</p>
      <p class="ear r">${unread} unread · ${S.list("all").length} on the shelf</p>
    </div>
    <h1 class="mast-title">${esc(C.name)}</h1>
    <p class="mast-tag">${esc(C.tagline)}</p>
    <div class="dateline"><span>${esc(U.longDate(S.todayKey()))}</span><span class="hide-sm">Private edition for ${esc(C.owner)}</span><span>${U.edCode(S.todayKey())}</span></div>
  </header>

  <section class="section fade" id="today" aria-label="Today's edition">
    <div id="today-slot"></div>
  </section>

  <section class="section" id="shelf" aria-labelledby="shelf-h">
    <div class="sec-flag fade"><h2 id="shelf-h">The shelf</h2><span class="label" id="shelf-count"></span></div>
    <div class="toolbar" role="toolbar" aria-label="Shelf filters">
      <div class="filters" id="filters">
        ${[["all", "All"], ["unread", "Unread"], ["read", "Read"], ["emailed", "Emailed"], ["deleted", "Recently deleted"]].map(([k, t]) => `<button class="filter" type="button" data-f="${k}" aria-pressed="${filter === k}">${t}</button>`).join("")}
      </div>
      <label class="search"><span class="sr-only">Search headlines</span><input id="search" type="search" placeholder="Search headlines" autocomplete="off" value="${esc(query)}"></label>
      <div class="bulk">
        <button class="pill ghost sm" type="button" id="bulk-read">Mark all as read</button>
        <button class="pill danger sm" type="button" id="bulk-del">Delete all read</button>
      </div>
    </div>
    <div id="shelf-groups"></div>
  </section>

  <footer class="footer">
    <span>${esc(C.name)} · made for one reader</span>
    <span>Unread stays · Read clears in ${C.readDeleteDays} days · Emailed clears in ${C.emailDeleteDays} days</span>
  </footer>`;
  };

  /* ---------- today ---------- */
  function renderToday() {
    const t = S.todayKey(), r = S.get(t), slot = $("#today-slot");
    if (!slot) return;
    if (!r || r.status === "deleted") {
      slot.innerHTML = `<div class="empty-card">
        <h3>${r ? "Today's edition is in Recently deleted" : "No edition yet today"}</h3>
        <p>${r ? "Restore it to read it again." : (C.source === "feed" ? `The morning job publishes it at about ${esc(C.publishTime)} IST. GitHub can start it a little late.` : `Editions arrive at ${esc(C.publishTime)} IST. In manual mode, publish it yourself.`)}</p>
        <button class="pill accent-btn lg" type="button" id="today-fix">${r ? "Restore" : (C.source === "feed" ? "Check again" : "Generate today's edition")}</button></div>`;
      $("#today-fix").onclick = async () => {
        if (r) { S.restore(t); U.toast("Restored as unread."); }
        else if (C.source === "feed") { await window.DE_ROUTER.check(); U.toast(window.DE_FEED.status.note); return; }
        else { S.generateToday(); U.toast("Today's edition is published."); }
        refresh();
      };
      return;
    }
    const c = S.content(t) || { front: { kicker: "", dek: "" }, brief: [], world: [] };
    slot.innerHTML = `<article class="lead" data-date="${t}">
      <div class="lead-main">
        <p class="kicker">Today's edition · ${esc(c.front.kicker)}</p>
        <h2><a href="#ed-${t}">${esc(r.headline)}</a></h2>
        <p class="dek">${esc(c.front.dek)}</p>
        <div class="lead-meta"><span class="card-state">${U.stateHTML(r)}</span><span class="muted mono">Published ${esc(U.fmtTime(r.publishedAt))}</span></div>
        <ol class="brief-cols" aria-label="60-second brief">${c.brief.map(b => `<li>${esc(b)}</li>`).join("")}</ol>
        <div class="actions"><a class="pill accent-btn lg" href="#ed-${t}">Read edition</a>${toggleBtn(r, "lg")}</div>
      </div>
      <aside class="lead-side" aria-label="Inside today">
        <p class="side-h">Inside today</p>
        <ul class="index-list">${c.world.map((s, i) => `<li><a href="#ed-${t}"><span class="t">${esc(s.headline)}</span></a><span class="s">World news · story ${i + 1}</span></li>`).join("")}</ul>
      </aside>
    </article>`;
  }

  /* ---------- shelf ---------- */
  function card(r) {
    const del = r.status === "deleted";
    const actions = del
      ? `<button class="pill read-btn sm" data-act="restore" type="button">Restore</button><button class="pill danger sm" data-act="purge" type="button">Delete forever</button>`
      : `${toggleBtn(r, "sm")}<button class="pill danger sm" data-act="delete" type="button">Delete</button><a class="pill ghost sm open" href="#ed-${r.date}">Open</a>`;
    return `<article class="card ${r.status === "unread" ? "is-unread" : ""}" data-date="${r.date}">
      <div class="card-top"><span>${esc(U.shortDate(r.date))}</span><span>${U.edCode(r.date)}</span></div>
      <h4>${del ? esc(r.headline) : `<a href="#ed-${r.date}">${esc(r.headline)}</a>`}</h4>
      <div class="card-state">${U.stateHTML(r)}</div>
      <div class="card-actions">${actions}</div></article>`;
  }
  function group(title, sub, items) {
    if (!items.length) return "";
    return `<div class="group"><div class="group-head"><h3>${esc(title)}</h3><span class="muted mono">${esc(sub)} · ${items.length}</span></div>
      <div class="cards">${items.map(card).join("")}</div></div>`;
  }
  function renderShelf() {
    const host = $("#shelf-groups"); if (!host) return;
    const today = S.todayKey();
    let items = S.list(filter);
    if (filter !== "deleted") items = items.filter(x => x.date !== today);
    if (query) items = items.filter(x => x.headline.toLowerCase().includes(query));
    const total = items.length;
    items = items.slice(0, limit);
    let html;
    if (filter === "deleted") html = group("Recently deleted", `Kept ${C.trashDays} days, then gone for good`, items);
    else html = group("Unread", "Stays until you read it", items.filter(x => !S.countdown(x))) +
      group("Read / expiring soon", "Clears itself when the countdown ends", items.filter(x => S.countdown(x)));
    if (!html) {
      html = query
        ? `<div class="empty"><strong>No headlines match “${esc(query)}”.</strong>Try a shorter word.</div>`
        : filter === "deleted"
          ? `<div class="empty"><strong>Nothing in Recently deleted.</strong>Deleted editions wait here for ${C.trashDays} days.</div>`
          : `<div class="empty"><strong>You're all caught up.</strong>Nothing older is waiting on the shelf.</div>`;
    }
    if (total > limit) html += `<div class="more"><button class="pill ghost" id="more" type="button">Show older editions</button></div>`;
    host.innerHTML = html;
    const m = $("#more"); if (m) m.onclick = () => { limit += 12; renderShelf(); };
    $("#shelf-count").textContent = `${S.list("all").length} editions · ${S.list("unread").length} unread`;
    $("#bulk-read").disabled = !S.list("unread").length;
    $("#bulk-del").disabled = !S.list("read").length;
  }

  function refresh() { S.cleanup(); renderToday(); renderShelf(); U.badge(); }

  /* ---------- actions ---------- */
  async function onAct(e) {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const el = b.closest("[data-date]"), date = el.dataset.date;
    await U.act(b.dataset.act, date, async phase => {
      if (phase === "before-delete") { await U.collapse(el); return; }
      renderToday(); renderShelf(); U.badge();
      if (phase === "toggle" || phase === "undo" || phase === "restore") U.morphState($(`[data-date="${date}"] .card-state`));
    });
  }

  function wire() {
    $("#today-slot").addEventListener("click", onAct);
    $("#shelf-groups").addEventListener("click", onAct);
    $("#filters").addEventListener("click", e => {
      const b = e.target.closest("[data-f]"); if (!b) return;
      filter = b.dataset.f; limit = 12;
      $$("[data-f]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      renderShelf();
    });
    $("#search").addEventListener("input", e => { query = e.target.value.trim().toLowerCase(); renderShelf(); });
    $("#bulk-read").addEventListener("click", () => {
      const ds = S.list("unread").map(x => x.date); if (!ds.length) return;
      const snap = S.snapshot(ds);
      ds.forEach(S.markRead);
      U.toast(`${ds.length} marked as read.`, { undo: () => { S.putBack(snap); refresh(); } });
      refresh();
    });
    $("#bulk-del").addEventListener("click", async () => {
      const ds = S.list("read").map(x => x.date); if (!ds.length) return;
      if (!(await U.confirmBox(`Delete ${ds.length} read edition${ds.length > 1 ? "s" : ""}?`, `They move to Recently deleted for ${C.trashDays} days.`))) return;
      const snap = S.snapshot(ds);
      ds.forEach(S.remove);
      U.toast(`${ds.length} deleted.`, { undo: () => { S.putBack(snap); refresh(); } });
      refresh();
    });
  }

  window.DE_VIEWS = window.DE_VIEWS || {};
  window.DE_VIEWS.home = {
    mount() {
      document.title = C.name;
      limit = 12;
      $("#main").innerHTML = shell();
      renderToday(); renderShelf();
      wire();
      U.revealLines($("#main"));
    },
    unmount() {},
    refresh,
    remote() { renderToday(); renderShelf(); }
  };
})();
