/* Loads the editions the daily job published (data/index.json and data/editions/<date>.json).
   Read, unread and delete choices stay on this device. */
(function () {
  const S = window.DE_STORE;
  const status = { state: "loading", note: "Checking for editions…", checkedAt: null };

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " " + r.status);
    return r.json();
  }

  async function load() {
    try {
      const index = await getJSON("data/index.json");
      const entries = (index.editions || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
      const have = S.exportAll().contents;
      const contents = {};
      for (const e of entries) {
        if (have[e.date] && !e.refresh) continue;
        try { contents[e.date] = await getJSON(`data/editions/${e.date}.json`); }
        catch (err) { /* a missing file is skipped; it is listed again tomorrow */ }
      }
      S.ingest(entries, contents);
      status.state = "on"; status.checkedAt = new Date();
      status.note = entries.length ? `${entries.length} editions published` : "No editions published yet";
    } catch (err) {
      status.state = "offline";
      status.note = "Could not reach the edition files. Showing what this device saved last time.";
    }
    return status;
  }

  window.DE_FEED = { load, status };
})();
