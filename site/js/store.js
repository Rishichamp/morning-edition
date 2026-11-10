/* Edition records and lifecycle rules (section 3 and 9 of the build brief).
   Storage is behind load()/save() so it can move to shared storage later. */
(function () {
  const C = window.DE_CONFIG;
  const KEY = "dailyEdition.v1.records";
  const CKEY = "dailyEdition.v1.content";
  const MKEY = "dailyEdition.v1.meta";
  const CLOCK = "dailyEdition.clockOffset";
  const DAY = 864e5;

  /* ---------- safe storage ---------- */
  const mem = {};
  function readJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch (e) { return mem[k] ? JSON.parse(mem[k]) : fallback; }
  }
  function writeJSON(k, v) {
    const s = JSON.stringify(v);
    try { localStorage.setItem(k, s); } catch (e) { mem[k] = s; }
  }

  /* ---------- time (all in the configured time zone) ---------- */
  function clockOffset() { try { return +localStorage.getItem(CLOCK) || 0; } catch (e) { return 0; } }
  function setClockOffset(ms) { try { localStorage.setItem(CLOCK, String(ms)); } catch (e) {} }
  function now() { return new Date(Date.now() + clockOffset()); }
  const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: C.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  function dayKey(d) { return keyFmt.format(d instanceof Date ? d : new Date(d)); }
  function todayKey() { return dayKey(now()); }
  function addDays(k, n) { const d = new Date(k + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diffDays(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / DAY); }
  function at(k, hhmm) { return new Date(`${k}T${hhmm}:00${C.utcOffset}`).toISOString(); }
  function plusDays(iso, n) { return new Date(new Date(iso).getTime() + n * DAY).toISOString(); }

  /* ---------- state ---------- */
  function records() { return readJSON(KEY, null); }
  function saveRecords(r) { writeJSON(KEY, r); }
  function contents() { return readJSON(CKEY, {}); }
  function meta() { return readJSON(MKEY, {}); }
  function saveMeta(m) { writeJSON(MKEY, m); }

  /* ---------- sync hook: every change is also sent to shared storage when connected ---------- */
  let sink = null;   // { put(kind, id, data), del(kind, id) }
  function setSink(s) { sink = s; }
  const push = (kind, id, data) => { if (sink) sink.put(kind, id, data); };
  const drop = (kind, id) => { if (sink) sink.del(kind, id); };
  function exportAll() { return { records: records() || {}, contents: contents() }; }
  function replaceAll(recs, cons) { saveRecords(recs); writeJSON(CKEY, cons); }

  function blank(date, publishedAt) {
    return { date, headline: "", status: "unread", publishedAt, emailedAt: null, emailStatus: "not_sent",
      emailAttempts: 0, readAt: null, pinned: false, deleteAfter: null, deletedAt: null, sample: true };
  }

  function seed() {
    const t = todayKey(), n = now().toISOString();
    const minNow = iso => (iso > n ? n : iso);
    const recs = {}, cons = {};
    const make = (offset, patch) => {
      const date = addDays(t, -offset);
      const c = window.DE_CONTENT.build(date, offset);
      const r = Object.assign(blank(date, minNow(at(date, C.publishTime))), { headline: c.front.headline }, patch(date));
      recs[date] = r; cons[date] = c;
    };
    // 1. today: emailed, untouched, 3-day timer running
    make(0, d => { const e = minNow(at(d, "08:01")); return { emailStatus: "sent", emailAttempts: 1, emailedAt: e, deleteAfter: plusDays(e, C.emailDeleteDays) }; });
    // 2. read yesterday evening: 2-day timer
    make(1, d => { const r = at(d, "20:30"); return { status: "read", readAt: r, emailStatus: "sent", emailAttempts: 1, emailedAt: at(d, "08:01"), deleteAfter: plusDays(r, C.readDeleteDays) }; });
    // 3. email failed after one retry, stays unread
    make(2, () => ({ emailStatus: "failed", emailAttempts: 2 }));
    // 4. marked unread by hand: kept, no timer
    make(3, d => ({ pinned: true, emailStatus: "sent", emailAttempts: 1, emailedAt: at(d, "08:01") }));
    // 5. plain unread, never emailed: never expires
    make(4, () => ({}));
    // 6. in Recently deleted
    make(5, d => ({ status: "deleted", prevStatus: "read", readAt: at(d, "21:00"), emailStatus: "sent", emailAttempts: 1,
      emailedAt: at(d, "08:01"), deletedAt: at(addDays(t, -2), C.cleanupTime) }));
    saveRecords(recs); writeJSON(CKEY, cons); saveMeta({ seededAt: n });
    return recs;
  }

  function all() {
    const r = records();
    if (r) return r;
    if (C.source === "feed") { saveRecords({}); return {}; }   // real editions arrive from the feed
    return seed();
  }

  /* take in the editions the daily job published; this device's read/unread/delete choices win */
  function ingest(entries, newContents) {
    const r = all(), cs = contents(), listed = new Set(entries.map(e => e.date));
    Object.assign(cs, newContents);
    entries.forEach(e => {
      if (!cs[e.date]) return;
      const x = r[e.date];
      if (!x) {
        const rec = blank(e.date, e.publishedAt || at(e.date, C.publishTime));
        rec.sample = !!e.test;
        r[e.date] = rec;
      }
      const rec = r[e.date];
      rec.headline = e.headline || (cs[e.date].front && cs[e.date].front.headline) || rec.headline;
      if (rec.emailStatus !== e.emailStatus && e.emailStatus) {
        rec.emailStatus = e.emailStatus; rec.emailedAt = e.emailedAt || null;
        if (e.emailStatus === "sent" && rec.status === "unread" && !rec.pinned && !rec.deleteAfter && e.emailedAt)
          rec.deleteAfter = plusDays(e.emailedAt, C.emailDeleteDays);
      }
    });
    // editions the job no longer lists were removed for good
    Object.keys(r).forEach(d => { if (!listed.has(d)) { delete r[d]; delete cs[d]; } });
    Object.keys(cs).forEach(d => { if (!r[d]) delete cs[d]; });
    saveRecords(r); writeJSON(CKEY, cs);
  }
  function clearDevice() {
    try { [KEY, CKEY, MKEY, CLOCK].forEach(k => localStorage.removeItem(k)); } catch (e) {}
    Object.keys(mem).forEach(k => delete mem[k]);
  }
  function get(date) { return all()[date] || null; }
  function content(date) { return contents()[date] || null; }
  function update(date, fn) {
    const r = all(); if (!r[date]) return null;
    fn(r[date]); saveRecords(r); push("editions", date, r[date]); return r[date];
  }

  /* ---------- button logic (9.4) ---------- */
  function markRead(date) {
    return update(date, x => { const t = now().toISOString(); x.status = "read"; x.readAt = t; x.deleteAfter = plusDays(t, C.readDeleteDays); x.pinned = false; });
  }
  function markUnread(date) {
    return update(date, x => { x.status = "unread"; x.readAt = null; x.deleteAfter = null; x.pinned = true; });
  }
  function remove(date) {
    return update(date, x => { if (x.status !== "deleted") x.prevStatus = x.status; x.status = "deleted"; x.deletedAt = now().toISOString(); });
  }
  function restore(date) {
    return update(date, x => { x.status = "unread"; x.deletedAt = null; x.deleteAfter = null; x.readAt = null; });
  }
  function purge(date) {
    const r = all(); delete r[date]; saveRecords(r);
    const c = contents(); delete c[date]; writeJSON(CKEY, c);
    drop("editions", date); drop("content", date);
  }
  function markEmailed(date) {
    return update(date, x => {
      if (x.emailStatus === "sent") return;              // never twice
      const t = now().toISOString();
      x.emailStatus = "sent"; x.emailedAt = t; x.emailAttempts = (x.emailAttempts || 0) + 1;
      if (x.status === "unread" && !x.pinned) x.deleteAfter = plusDays(t, C.emailDeleteDays);
    });
  }

  /* undo support: copy records before an action, put them back after */
  function snapshot(dates) { const r = all(); const s = {}; dates.forEach(d => { if (r[d]) s[d] = JSON.parse(JSON.stringify(r[d])); }); return s; }
  function putBack(snap) { const r = all(); Object.keys(snap).forEach(d => { r[d] = snap[d]; }); saveRecords(r); Object.keys(snap).forEach(d => push("editions", d, r[d])); }

  /* ---------- cleanup job (9.3), also run on every page load ---------- */
  function cleanup() {
    const r = all(), t = now(), today = todayKey(), out = { deleted: [], purged: [] };
    Object.values(r).forEach(x => {
      if (x.status === "deleted") {
        if (x.deletedAt && t - new Date(x.deletedAt) >= C.trashDays * DAY) { out.purged.push(x.date); }
        return;
      }
      if (!x.deleteAfter || x.pinned || x.date === today) return;
      if (t >= new Date(x.deleteAfter)) { x.prevStatus = x.status; x.status = "deleted"; x.deletedAt = t.toISOString(); out.deleted.push(x.date); }
    });
    saveRecords(r);
    out.deleted.forEach(d => push("editions", d, r[d]));
    out.purged.forEach(purge);
    const m = meta(); m.lastCleanup = t.toISOString(); saveMeta(m);
    return out;
  }

  /* ---------- publish job (9.2), manual mode ---------- */
  function generateToday() {
    const date = todayKey(), r = all();
    if (r[date]) return { created: false, date };
    const age = Object.keys(r).length;
    const c = window.DE_CONTENT.build(date, age);
    r[date] = Object.assign(blank(date, now().toISOString()), { headline: c.front.headline });
    saveRecords(r);
    const cs = contents(); cs[date] = c; writeJSON(CKEY, cs);
    push("content", date, c); push("editions", date, r[date]);
    return { created: true, date };
  }

  function resetAll() {
    const old = Object.keys(records() || {});
    try { [KEY, CKEY, MKEY, CLOCK].forEach(k => localStorage.removeItem(k)); } catch (e) {}
    Object.keys(mem).forEach(k => delete mem[k]);
    const recs = seed(), cons = contents();
    old.filter(d => !recs[d]).forEach(d => { drop("editions", d); drop("content", d); });
    Object.keys(recs).forEach(d => { push("content", d, cons[d]); push("editions", d, recs[d]); });
  }

  /* ---------- derived view helpers ---------- */
  function chips(x) {
    if (x.status === "deleted") return [{ k: "deleted", t: "Deleted" }];
    const out = [x.status === "read" ? { k: "read", t: "Read" } : { k: "unread", t: "Unread" }];
    if (x.emailStatus === "sent") out.push({ k: "emailed", t: "Emailed" });
    if (x.emailStatus === "failed") out.push({ k: "failed", t: "Email failed" });
    if (x.pinned && x.status === "unread") out.push({ k: "kept", t: "Kept" });
    return out;
  }
  function plural(n, a, b, c) { return n <= 0 ? a : n === 1 ? b : c.replace("#", n); }
  function countdown(x) {
    const today = todayKey();
    if (x.status === "deleted") {
      const n = diffDays(today, dayKey(plusDays(x.deletedAt, C.trashDays)));
      return plural(n, "Gone for good today", "Gone for good tomorrow", "Gone for good in # days");
    }
    if (!x.deleteAfter || x.pinned) return null;
    const n = diffDays(today, dayKey(x.deleteAfter));
    if (x.date === today && n <= 0) return null;
    return plural(n, "Deletes today", "Deletes tomorrow", "Deletes in # days");
  }
  function list(filter) {
    return Object.values(all()).sort((a, b) => b.date.localeCompare(a.date)).filter(x => {
      if (filter === "deleted") return x.status === "deleted";
      if (x.status === "deleted") return false;
      if (filter === "unread") return x.status === "unread";
      if (filter === "read") return x.status === "read";
      if (filter === "emailed") return x.emailStatus === "sent";
      return true;
    });
  }

  window.DE_STORE = {
    now, todayKey, dayKey, addDays, diffDays, clockOffset, setClockOffset, DAY,
    all, get, content, list, chips, countdown, meta,
    markRead, markUnread, remove, restore, purge, markEmailed, snapshot, putBack,
    cleanup, generateToday, resetAll, setSink, exportAll, replaceAll, ingest, clearDevice
  };
})();
