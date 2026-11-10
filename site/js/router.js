/* Picks the view from the address: #shelf, #today, #ed-2026-11-08 or #deleted. */
(function () {
  const S = window.DE_STORE, U = window.DE_UI, V = window.DE_VIEWS, FEED = window.DE_FEED;
  let current = null;

  function parse() {
    const h = location.hash.slice(1);
    if (h === "deleted") return { v: "deleted", nav: "deleted" };
    if (h === "today") return { v: "edition", date: S.todayKey(), nav: "today" };
    const sm = h.match(/^story-(\d{4}-\d{2}-\d{2})-(\d{1,2})$/);
    if (sm) return { v: "story", date: sm[1], n: +sm[2], nav: "" };
    const m = h.match(/^ed-(\d{4}-\d{2}-\d{2})$/);
    if (m) return { v: "edition", date: m[1], nav: m[1] === S.todayKey() ? "today" : "" };
    return { v: "home", nav: "home" };
  }

  /* where a page sits in the paper: shelf first, then editions from newest to oldest */
  function rank(r) {
    if (r.v === "home") return 0;
    if (r.v === "deleted") return 1e6;
    return 1 + S.diffDays(r.date, S.todayKey()) + (r.v === "story" ? r.n / 100 : 0);
  }
  let last = null;

  function go() {
    const r = parse();
    const swap = () => {
      if (current && current.unmount) current.unmount();
      U.resetMotion();
      current = V[r.v];
      U.setCurrent(r.nav);
      current.mount(r);
    };
    if (!last) { swap(); $main.classList.add("first"); }
    else U.turnPage(rank(r) >= rank(last) ? 1 : -1, swap);
    last = r;
  }
  const $main = document.getElementById("main");

  window.DE_PAGE = {
    refresh() { S.cleanup(); U.badge(); current.refresh ? current.refresh() : go(); },
    remote() { S.cleanup(); U.badge(); current.remote ? current.remote() : go(); }
  };

  /* show what this device saved at once, then bring in any new editions */
  async function check() { await FEED.load(); window.DE_PAGE.remote(); }

  S.cleanup();
  U.chrome();
  addEventListener("hashchange", go);
  go();
  check();
  // look again when the tab comes back after a while (e.g. the phone was asleep overnight)
  document.addEventListener("visibilitychange", () => {
    const t = FEED.status.checkedAt;
    if (!document.hidden && (!t || Date.now() - t > 15 * 60 * 1000)) check();
  });
  window.DE_ROUTER = { check };
})();
