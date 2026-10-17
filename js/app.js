/* Page switching (#sellout / #traffic / #campaigns / #forecast), shared period picker, hero skyline, resize handling. */
(function () {
  "use strict";
  const U = window.U, D = window.DASH;
  const $ = (s) => document.querySelector(s);
  if (!D) { $("#data-chip").textContent = "Data not available"; return; }

  const PAGES = {
    sellout: { title: "E-commerce Sell-out 2026", obj: () => window.SELLOUT_PAGE },
    traffic: { title: "Store Traffic 2026", obj: () => window.TRAFFIC_PAGE },
    campaigns: { title: "Campaign Days 2026", obj: () => window.CAMPAIGN_PAGE },
    forecast: { title: "Forecast & Warehouse Stock 2026", obj: () => window.FORECAST_PAGE },
  };

  const sel = $("#period");
  for (const k of D.months.slice().reverse()) sel.appendChild(new Option(U.monthName(k), k));
  sel.value = U.state.month;
  sel.addEventListener("change", (e) => U.setMonth(e.target.value));
  U.onMonth((m) => { sel.value = m; drawHero(); });

  const lines = D.allMonths.reduce((a, k) => a + D.sell[k].stat.raw_lines, 0);
  $("#data-chip").textContent = "Dummy data · " + U.num(lines) + " order lines, Feb–Sep 2026";
  const gen = new Date(D.generated);
  $("#stamp").textContent = "Data generated " + (isNaN(gen) ? D.generated : gen.toLocaleDateString("en-US", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })) +
    " from " + D.allMonths.length + " monthly order exports, a daily traffic report, voucher setups and platform rebates. February–April only seed the forecast history.";

  // hero skyline: daily GMV of the chosen month, campaign days brighter
  function drawHero() {
    const box = $("#hero-art");
    const W = 720, H = 220;
    const m = U.state.month, vals = window.SELLOUT_PAGE.dayTotal(m), n = vals.length;
    const camp = {};
    window.SELLOUT_PAGE.campaignDays(m).forEach((c) => (camp[c.day] = c));
    const max = Math.max(...vals), band = W / n;
    const svg = U.svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
    vals.forEach((v, i) => {
      const h = (v / max) * (H - 34), c = camp[i + 1];
      svg.appendChild(U.svgEl("rect", { x: i * band + 2, y: H - h, width: band - 4, height: h, rx: 2, fill: "var(--hero-art)", "fill-opacity": c && c.kind !== "holiday" ? 0.55 : 0.16 }));
    });
    box.replaceChildren(svg);
    for (const d in camp) {
      if (camp[d].kind === "holiday") continue;
      const h = (vals[d - 1] / max) * (H - 34);
      const t = U.el("span", null, camp[d].label);
      Object.assign(t.style, { position: "absolute", left: `calc(${((d - 0.5) / n) * 100}% - 3em)`, width: "6em", textAlign: "center",
        bottom: `calc(${(h / H) * 88}% + 6px)`, fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "85%", fontSize: "13px", color: "var(--hero-fg)", opacity: ".8" });
      box.appendChild(t);
    }
  }

  function show(name) {
    if (!PAGES[name]) name = "sellout";
    document.body.dataset.page = name;
    for (const key of Object.keys(PAGES)) {
      const on = key === name;
      document.getElementById("page-" + key).hidden = !on;
      document.getElementById("tab-" + key).setAttribute("aria-selected", on ? "true" : "false");
    }
    $("#page-title").textContent = PAGES[name].title;
    const o = PAGES[name].obj();
    if (o) o.redraw();
  }
  function fromHash() {
    const h = location.hash.slice(1);
    if (PAGES[h]) return show(h);
    const target = h && document.getElementById(h);
    const page = target && target.closest(".page");
    show(page ? page.id.replace("page-", "") : "sellout");
    if (target) target.scrollIntoView();
  }

  for (const k of Object.keys(PAGES)) { const o = PAGES[k].obj(); if (o) o.render(); }
  drawHero();
  window.addEventListener("hashchange", fromHash);
  fromHash();

  let raf = 0, lastW = 0;
  new ResizeObserver(() => {
    const w = document.documentElement.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { const o = PAGES[document.body.dataset.page].obj(); if (o) o.redraw(); });
  }).observe(document.body);
})();
