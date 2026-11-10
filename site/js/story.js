/* Story view: one story on a clean page, with the longer summary written from the full article. */
(function () {
  const C = window.DE_CONFIG, S = window.DE_STORE, U = window.DE_UI;
  const { $, esc } = U;
  let date = null, n = 0, active = false;

  function find() {
    const c = S.content(date), r = S.get(date);
    if (!c || !r || r.status === "deleted" || !c.stories) return { c, r, st: null, all: [] };
    const all = c.stories.concat(c.india || []);
    return { c, r, st: all.find(x => x.n === n) || null, all };
  }

  function render() {
    const { c, r, st, all } = find();
    const main = $("#main");
    if (!st) {
      main.innerHTML = `<section class="page-head"><p class="label">${U.edCode(date)}</p><h1>Story not found</h1>
        <p>This story is not on this device. The edition may have been deleted or removed.</p>
        <div style="margin-top:24px"><a class="pill ghost lg" href="#ed-${date}">Back to the edition</a></div></section>`;
      return;
    }
    document.title = `${st.headline} · ${C.name}`;
    const i = all.indexOf(st), prev = all[i - 1], next = all[i + 1];
    const tag = [st.company, st.category].filter(Boolean).map(esc).join(" · ");
    const toggle = r.status === "read"
      ? `<button class="pill unread-btn sm" data-act="toggle" type="button">Mark edition unread</button>`
      : `<button class="pill read-btn sm" data-act="toggle" type="button">Mark edition read</button>`;
    main.innerHTML = `
    <article class="story-page">
      <nav class="sp-top"><a href="#ed-${date}">← ${esc(C.name)} · ${esc(U.shortDate(date))}</a><span class="label">${st.section === "india" ? "India" : "Story " + st.n + " of " + c.stories.length}</span></nav>
      <p class="kicker">${tag || "AI news"}</p>
      <h1 class="sp-h">${esc(st.headline)}</h1>
      <p class="sp-dek">${esc(st.dek)}</p>
      <div class="byline"><span>${esc(st.source)}${st.published ? " · " + esc(U.fmtTime(st.published)) : ""}</span>
        <span class="muted">${st.full_article ? "Summarised from the full article" : "From the source's summary only"}</span></div>
      <div class="sp-body fade">${st.detail.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      ${st.why ? `<aside class="sp-why fade"><span class="label">Why it matters to you</span><p>${esc(st.why)}</p></aside>` : ""}
      <div class="sp-actions">
        <a class="pill accent-btn lg" href="${esc(st.url)}" target="_blank" rel="noopener noreferrer">Read the original at ${esc(st.source)} ↗</a>
        <span class="card-state" id="sp-state">${U.stateHTML(r)}</span>${toggle}
      </div>
      <nav class="prevnext sp-nav" aria-label="Other stories">
        ${prev ? `<a class="prev" href="#story-${date}-${prev.n}"><span class="label">← Previous story</span><span class="t">${esc(prev.headline)}</span></a>` : `<a class="prev" href="#ed-${date}"><span class="label">← Back</span><span class="t">The front page</span></a>`}
        ${next ? `<a class="next" href="#story-${date}-${next.n}"><span class="label">Next story →</span><span class="t">${esc(next.headline)}</span></a>` : `<a class="next" href="#ed-${date}"><span class="label">Done →</span><span class="t">Back to the front page</span></a>`}
      </nav>
    </article>`;
    U.revealLines(main);
  }

  document.addEventListener("click", async e => {
    if (!active) return;
    const b = e.target.closest(".sp-actions [data-act]"); if (!b) return;
    await U.act(b.dataset.act, date, () => render());
  });

  window.DE_VIEWS = window.DE_VIEWS || {};
  window.DE_VIEWS.story = {
    mount(route) { date = route.date; n = route.n; active = true; render(); },
    unmount() { active = false; },
    refresh: render,
    remote: render
  };
})();
