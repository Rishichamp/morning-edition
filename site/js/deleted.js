/* Recently deleted view: restore or delete forever. */
(function () {
  const C = window.DE_CONFIG, S = window.DE_STORE, U = window.DE_UI;
  const { $, esc } = U;
  let active = false;

  function render() {
    const items = S.list("deleted");
    $("#main").innerHTML = `
      <section class="page-head">
        <p class="label">Kept ${C.trashDays} days, then removed for good</p>
        <h1>Recently deleted</h1>
        <p>Editions land here when their timer ends or when you delete them. Restore brings one back as unread, with no timer.</p>
      </section>
      <section class="section" style="padding-top:0">
        ${items.length ? `<ul class="del-list" id="del-list">${items.map(r => `
          <li class="del-row" data-date="${r.date}">
            <span class="when">${esc(U.shortDate(r.date))}</span>
            <span class="t">${esc(r.headline)}</span>
            <span class="countdown mono">${esc(S.countdown(r))}</span>
            <span class="acts"><button class="pill read-btn sm" data-act="restore" type="button">Restore</button><button class="pill danger sm" data-act="purge" type="button">Delete forever</button></span>
          </li>`).join("")}</ul>`
        : `<div class="empty"><strong>Nothing here.</strong>You're all caught up.</div>`}
      </section>`;
    U.rollAll($("#main"));
    U.badge();
    U.revealLines($("#main"));
  }

  document.addEventListener("click", async e => {
    if (!active) return;
    const b = e.target.closest("#del-list [data-act]"); if (!b) return;
    const row = b.closest("[data-date]");
    await U.act(b.dataset.act, row.dataset.date, async phase => {
      if (phase !== "undo") await U.collapse(row);
      render();
    });
  });

  window.DE_VIEWS = window.DE_VIEWS || {};
  window.DE_VIEWS.deleted = {
    mount() { active = true; document.title = "Recently deleted · " + C.name; render(); },
    unmount() { active = false; },
    refresh: render,
    remote: render
  };
})();
