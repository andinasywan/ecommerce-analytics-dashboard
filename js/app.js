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
  const am = D.allMonths, first = am[0], last = am[am.length - 1];
  const short = (k) => U.monthShort(k) + " " + k.slice(0, 4);
  $("#data-chip").replaceChildren("Dummy data: " + U.num(lines) + " order lines", U.el("span", "hide-narrow", ", " + short(first) + " to " + short(last)));
  // period labels in headings: "January–September", "since October 2025"
  const m0 = D.months[0], m1 = D.months[D.months.length - 1];
  document.querySelectorAll("[data-range]").forEach((e) => (e.textContent = U.monthOnly(m0) + "–" + U.monthOnly(m1)));
  document.querySelectorAll("[data-since]").forEach((e) => (e.textContent = U.monthName(first)));
  const seed = am.filter((k) => !D.months.includes(k));
  const gen = new Date(D.generated);
  $("#stamp").textContent = "Data generated " + (isNaN(gen) ? D.generated : gen.toLocaleDateString("en-US", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })) +
    " from " + am.length + " monthly order exports, a daily traffic report, month-end stock on hand, voucher setups and platform rebates." +
    (seed.length ? " " + U.monthOnly(seed[0]) + "–" + U.monthName(seed[seed.length - 1]) + " only seed the forecast and campaign history." : "");

  // hero skyline: daily GMV of the chosen month; campaign days burn orange and carry their date in big type
  function drawHero() {
    const box = $("#hero-art");
    const W = 760, H = 200;
    const m = U.state.month, vals = window.SELLOUT_PAGE.dayTotal(m), n = vals.length;
    const camp = {};
    window.SELLOUT_PAGE.campaignDays(m).forEach((c) => { if (c.kind !== "holiday") camp[c.day] = c; });
    const max = Math.max(...vals), band = W / n;
    const svg = U.svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
    const defs = U.svgEl("defs");
    const grad = (id, color, top, bottom) => {
      const g = U.svgEl("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
      g.appendChild(U.svgEl("stop", { offset: "0", style: `stop-color:${color};stop-opacity:${top}` }));
      g.appendChild(U.svgEl("stop", { offset: "1", style: `stop-color:${color};stop-opacity:${bottom}` }));
      defs.appendChild(g);
    };
    grad("hero-day", "var(--hero-art)", 0.42, 0.04);
    grad("hero-camp", "var(--camp)", 0.95, 0.25);
    svg.appendChild(defs);
    vals.forEach((v, i) => {
      const h = (v / max) * (H - 8);
      svg.appendChild(U.svgEl("rect", { x: i * band + 2.5, y: H - h, width: band - 5, height: h, rx: 3, fill: camp[i + 1] ? "url(#hero-camp)" : "url(#hero-day)" }));
    });
    box.replaceChildren(svg);
    const svgH = svg.getBoundingClientRect().height || box.clientHeight * 0.7;
    for (const d in camp) {
      const h = (vals[d - 1] / max) * (H - 8);
      const t = U.el("span", "peak " + (camp[d].kind === "twin" ? "big" : "small"), camp[d].label);
      const at = ((d - 0.5) / n) * 100;
      t.style.left = at + "%";
      if (at < 8) t.style.transform = "translateX(-" + Math.round(at * 4) + "%)";   // 1.1 sits on the left edge
      t.style.bottom = (h / H) * svgH + 6 + "px";
      box.appendChild(t);
    }
    box.appendChild(U.el("span", "art-cap", "Daily GMV, " + U.monthName(m)));
  }

  // faint archipelago behind the hero title
  function drawHeroBg() {
    const G = window.GEO, box = $("#hero-bg");
    if (!G || !box) return;
    const svg = U.svgEl("svg", { viewBox: `0 0 ${G.w} ${G.h}` });
    svg.appendChild(U.svgEl("path", { d: G.indonesia, fill: "var(--hero-fg)" }));
    box.replaceChildren(svg);
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
  drawHeroBg();
  window.addEventListener("hashchange", fromHash);
  fromHash();

  let raf = 0, lastW = 0;
  new ResizeObserver(() => {
    const w = document.documentElement.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { drawHero(); const o = PAGES[document.body.dataset.page].obj(); if (o) o.redraw(); });
  }).observe(document.body);
})();
