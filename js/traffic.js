/* Page 02: Traffic. */
(function () {
  "use strict";
  const U = window.U, D = window.DASH;
  const { el, svgEl, rp, num, pct, fmt, delta, growth, isNum } = U;
  const $ = (s) => document.querySelector(s);
  if (!D || !D.traffic) return;

  const PCOL = {};
  D.platforms.forEach((p, i) => (PCOL[p] = "var(--p" + (i + 1) + ")"));
  const STORE = {}; D.stores.forEach(([name, platform, channel, wh]) => (STORE[name] = { platform, channel, wh }));
  const st = { platform: "", sort: "visitors" };
  const T = (m) => D.traffic[m];
  const prevName = (m) => U.monthOnly(U.prevKey(m));

  // store rows -> objects
  function storeRows(m) {
    return (T(m) ? T(m).store : []).map(([name, organic, clicks, visitors, orders, impr, adClicks]) =>
      ({ name, organic, clicks, visitors, orders, impr, adClicks, ...STORE[name] }));
  }
  function totals(rows) {
    const t = { organic: 0, clicks: 0, visitors: 0, orders: 0, impr: 0, adClicks: 0 };
    for (const r of rows) for (const k in t) t[k] += r[k];
    t.cvr = t.visitors ? t.orders / t.visitors : null;
    t.ctr = t.impr ? t.adClicks / t.impr : null;
    t.adShare = t.visitors ? t.adClicks / t.visitors : null;
    t.clickRate = t.visitors ? t.clicks / t.visitors : null;
    return t;
  }
  const monthTot = (m) => totals(storeRows(m));
  const platTot = (m, p) => totals(storeRows(m).filter((r) => r.platform === p));

  // ---------- lede & KPIs ----------
  function renderLede() {
    const m = U.state.month, t = monthTot(m);
    const lede = $("#tr-lede");
    lede.replaceChildren();
    const add = (txt, bold) => lede.appendChild(bold ? el("b", null, txt) : document.createTextNode(txt));
    add("In " + U.monthName(m) + ", the " + D.stores.length + " stores had ");
    add(U.axisNum(Math.round(t.visitors / 1e3) * 1e3) + " visitors", true);
    add(" and turned ");
    add(pct(t.cvr, 1), true);
    add(" of them into orders. ");
    const tt = platTot(m, "TikTok Shop"), sh = platTot(m, "Shopee");
    add("TikTok Shop brought " + pct(tt.visitors / t.visitors, 0) + " of all visitors but converted only " + pct(tt.cvr) + ", against " + pct(sh.cvr) + " on Shopee. ");
    const days = T(m).daily.visitors.length;
    const tw = U.campaignDays(m, days)[0];
    const v = T(m).daily.visitors[tw.day - 1].reduce((a, b) => a + b, 0), o = T(m).daily.orders[tw.day - 1].reduce((a, b) => a + b, 0);
    add("On " + tw.label + ", conversion rose to " + pct(o / v) + ".");
  }

  function renderKpis() {
    const m = U.state.month, t = monthTot(m), pk = U.prevKey(m), p = T(pk) ? monthTot(pk) : null;
    const box = $("#tr-kpis");
    box.replaceChildren();
    const idx = D.months.indexOf(m), lbl = D.months.map(U.monthShort);
    const ser = (f) => D.months.map((k) => f(monthTot(k)));
    const vs = (now, before) => U.sub([delta(growth(now, before)), " vs " + prevName(m)]);
    const vsPts = (now, before) => U.sub([p ? delta((now - before) * 100, { points: true }) : "", " vs " + prevName(m)]);
    box.appendChild(U.kpi("Visitors", U.axisNum(Math.round(t.visitors / 1e3) * 1e3), vs(t.visitors, p && p.visitors), { title: num(t.visitors), spark: U.spark(ser((x) => x.visitors), idx, lbl) }));
    box.appendChild(U.kpi("Orders (platform reports)", num(t.orders), vs(t.orders, p && p.orders), { spark: U.spark(ser((x) => x.orders), idx, lbl) }));
    box.appendChild(U.kpi("Conversion rate", pct(t.cvr, 2), vsPts(t.cvr, p && p.cvr), { spark: U.spark(ser((x) => x.cvr), idx, lbl, (v) => pct(v, 2)) }));
    box.appendChild(U.kpi("Ad click-through rate", pct(t.ctr, 2), vsPts(t.ctr, p && p.ctr), { spark: U.spark(ser((x) => x.ctr), idx, lbl, (v) => pct(v, 2)) }));
    box.appendChild(U.kpi("Visits from ads", pct(t.adShare, 0), U.sub(["ad clicks ÷ visitors"]), { meter: t.adShare, meterColor: "var(--one)" }));
  }

  // ---------- funnel ----------
  function renderFunnel() {
    const m = U.state.month, t = monthTot(m);
    $("#tr-funnel-pos").textContent = U.monthName(m);
    const box = $("#tr-funnel");
    box.replaceChildren();
    const row = (label, value, max, note, color) => {
      const r = el("div", "fn-row");
      const head = el("div", "fn-head");
      head.append(el("span", "fn-label", label), el("span", "fn-val", U.axisNum(value)));
      const track = el("div", "fn-track");
      const fill = el("div", "fn-fill");
      fill.style.width = Math.max(0.6, (value / max) * 100) + "%";
      if (color) fill.style.background = color;
      track.appendChild(fill);
      r.append(head, track);
      if (note) r.appendChild(el("div", "fn-note", note));
      box.appendChild(r);
    };
    row("Visitors", t.visitors, t.visitors);
    row("Product clicks", t.clicks, t.visitors, pct(t.clickRate, 0) + " of visitors clicked a product");
    row("Orders", t.orders, t.visitors, pct(t.orders / t.clicks, 1) + " of clicks · " + pct(t.cvr, 2) + " of visitors");
    box.appendChild(el("div", "fn-group", "Ads"));
    row("Ad impressions", t.impr, t.impr, null, "var(--one-soft)");
    row("Ad clicks", t.adClicks, t.impr, pct(t.ctr, 2) + " click-through · " + pct(t.adShare, 0) + " of all visits", "var(--one-soft)");
  }

  // ---------- conversion by platform (lines) ----------
  function drawCvr() {
    const box = $("#chart-cvr");
    const W = box.clientWidth;
    if (!W) return;
    const leg = $("#leg-platform-tr");
    leg.replaceChildren();
    for (const p of D.platforms) { const s = el("span"); const k = el("span", "key"); k.style.background = PCOL[p]; s.append(k, p); leg.appendChild(s); }
    const ms = D.months;
    const series = D.platforms.map((p) => ({ p, v: ms.map((k) => platTot(k, p).cvr) }));
    const max = Math.max(...series.flatMap((s) => s.v));
    const ticks = U.niceTicks(max * 1.1, 4);
    const yMax = ticks[ticks.length - 1];
    const tl = ticks.map((t) => fmt(t * 100, 0) + "%");
    const H = W < 520 ? 240 : 270;
    const endW = U.labelWidth(box, ["Tokopedia 3.1%"]);
    const m = { t: 12, r: endW + 18, b: 28, l: U.labelWidth(box, tl) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / ms.length;
    const x = (i) => m.l + (i + 0.5) * band, y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Line chart of conversion rate by platform per month" });
    ticks.forEach((t, i) => {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, tl[i]));
    });
    ms.forEach((k, i) => svg.appendChild(svgEl("text", { x: x(i), y: H - 8, "text-anchor": "middle", class: k === U.state.month ? "lbl-strong" : "" }, U.monthShort(k))));
    const si = ms.indexOf(U.state.month);
    svg.appendChild(svgEl("line", { x1: x(si), x2: x(si), y1: m.t, y2: m.t + ih, stroke: "var(--axis)" }));
    const ends = [];
    for (const s of series) {
      svg.appendChild(svgEl("path", { d: s.v.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join(""), fill: "none", stroke: PCOL[s.p], "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      svg.appendChild(svgEl("circle", { cx: x(si), cy: y(s.v[si]), r: 4.5, fill: PCOL[s.p], stroke: "var(--panel)", "stroke-width": 2 }));
      ends.push({ y: y(s.v[s.v.length - 1]), text: s.p + " " + pct(s.v[s.v.length - 1]), color: PCOL[s.p] });
    }
    // keep end labels at least 13px apart
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    const overflow = ends[ends.length - 1].y - (m.t + ih);
    if (overflow > 0) ends.forEach((e) => (e.y -= overflow));
    for (const e of ends) {
      svg.appendChild(svgEl("rect", { x: m.l + iw + 6, y: e.y - 4, width: 8, height: 8, rx: 2, fill: e.color }));
      svg.appendChild(svgEl("text", { x: m.l + iw + 18, y: e.y + 4, class: "lbl-strong" }, e.text));
    }
    const cross = svgEl("line", { y1: m.t, y2: m.t + ih, stroke: "var(--fg)", "stroke-opacity": 0.35, visibility: "hidden" });
    svg.appendChild(cross);
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", style: "cursor:pointer" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const at = (ev) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(ms.length - 1, Math.floor((((ev.clientX - r.left) / r.width) * W - m.l) / band))); };
    hit.addEventListener("pointermove", (ev) => {
      const i = at(ev), s = svg.getBoundingClientRect().width / W;
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      U.showTip(box, x(i) * s, m.t * s + 20, U.monthName(ms[i]),
        series.slice().sort((a, b) => b.v[i] - a.v[i]).map((q) => ({ label: q.p, value: pct(q.v[i], 2), color: PCOL[q.p] })), ms[i] === U.state.month ? null : "Click to select this month");
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); U.hideTip(box); });
    hit.addEventListener("click", (ev) => { const k = ms[at(ev)]; if (k !== U.state.month) { U.hideTip(box); U.setMonth(k); } });
  }

  // ---------- daily visitors + conversion (two aligned charts) ----------
  function drawDaily() {
    const m = U.state.month, dv = T(m).daily.visitors, dor = T(m).daily.orders;
    const vis = dv.map((r) => r.reduce((a, b) => a + b, 0)), ord = dor.map((r) => r.reduce((a, b) => a + b, 0));
    const cvr = vis.map((v, i) => (v ? ord[i] / v : 0));
    const n = vis.length;
    $("#tr-daily-title").textContent = "Daily visitors and conversion, " + U.monthName(m);
    const cmap = {};
    U.campaignDays(m, n).forEach((c) => (cmap[c.day] = c));
    const draw = (box, vals, isBar, H, fmtAxis, fmtVal, label) => {
      const W = box.clientWidth;
      if (!W) return;
      const ticks = U.niceTicks(Math.max(...vals) * 1.12, 3);
      const yMax = ticks[ticks.length - 1];
      const tl = ticks.map(fmtAxis);
      const lw = Math.max(U.labelWidth(box, tl), U.labelWidth(box, ["100K"]));
      const mm = { t: 16, r: 6, b: isBar ? 6 : 24, l: lw + 12 };
      const iw = W - mm.l - mm.r, ih = H - mm.t - mm.b;
      const band = iw / n, bw = Math.max(2, band - 2);
      const y = (v) => mm.t + ih - (v / yMax) * ih;
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": label });
      ticks.forEach((t, i) => {
        svg.appendChild(svgEl("line", { x1: mm.l, x2: mm.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
        svg.appendChild(svgEl("text", { x: mm.l - 8, y: y(t) + 4, "text-anchor": "end" }, tl[i]));
      });
      svg.appendChild(svgEl("text", { x: mm.l, y: 10, class: "lbl-strong" }, isBar ? "Visitors" : "Conversion rate"));
      if (isBar) {
        vals.forEach((v, i) => {
          const c = cmap[i + 1], camp = c && c.kind !== "holiday", x0 = mm.l + i * band + 1;
          svg.appendChild(svgEl("path", { d: U.barPath(x0, x0 + bw, y(v), y(0), Math.min(3, bw / 2)), fill: camp ? "var(--camp)" : "var(--one-soft)" }));
        });
      } else {
        svg.appendChild(svgEl("path", { d: vals.map((v, i) => (i ? "L" : "M") + (mm.l + (i + 0.5) * band).toFixed(1) + "," + y(v).toFixed(1)).join(""), fill: "none", stroke: "var(--one)", "stroke-width": 2, "stroke-linejoin": "round" }));
        vals.forEach((v, i) => {
          const c = cmap[i + 1];
          if (c && c.kind !== "holiday") svg.appendChild(svgEl("circle", { cx: mm.l + (i + 0.5) * band, cy: y(v), r: 4.5, fill: "var(--camp)", stroke: "var(--panel)", "stroke-width": 2 }));
        });
        [1, 5, 10, 15, 20, 25, 30].filter((d) => d <= n).forEach((d) => svg.appendChild(svgEl("text", { x: mm.l + (d - 0.5) * band, y: H - 6, "text-anchor": "middle" }, String(d))));
      }
      const hit = svgEl("rect", { x: mm.l, y: mm.t, width: iw, height: ih, fill: "transparent" });
      svg.appendChild(hit);
      box.replaceChildren(svg);
      const move = (ev) => {
        const r = svg.getBoundingClientRect();
        const i = Math.max(0, Math.min(n - 1, Math.floor((((ev.clientX - r.left) / r.width) * W - mm.l) / band)));
        const s = r.width / W, c = cmap[i + 1];
        const date = new Date(+m.slice(0, 4), U.monthNo(m) - 1, i + 1).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        U.showTip(box, (mm.l + (i + 0.5) * band) * s, y(vals[i]) * s, date + (c && c.kind !== "holiday" ? " · " + c.label : ""), [
          { label: "Visitors", value: num(vis[i]) }, { label: "Orders", value: num(ord[i]) }, { label: "Conversion", value: pct(cvr[i], 2) }]);
      };
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerdown", move);
      hit.addEventListener("pointerleave", () => U.hideTip(box));
    };
    draw($("#chart-visitors"), vis, true, 170, U.axisNum, num, "Bar chart of visitors per day");
    draw($("#chart-daily-cvr"), cvr, false, 130, (t) => fmt(t * 100, 0) + "%", pct, "Line chart of conversion rate per day");
  }

  // ---------- TikTok content source ----------
  function renderTtSource() {
    const m = U.state.month, s = D.sell[m].ttSource, p = D.sell[U.prevKey(m)] && D.sell[U.prevKey(m)].ttSource;
    const tot = s.reduce((a, b) => a + b, 0);
    const box = $("#tt-source");
    box.replaceChildren();
    D.ttSources.forEach((name, i) => {
      const row = el("div", "plat-row");
      row.append(el("div", "plat-name", name), el("div", "plat-gmv", rp(s[i])), delta(growth(s[i], p && p[i])), U.bar(s[i] / tot, "var(--p1)"));
      box.appendChild(row);
    });
    // LIVE share across months
    const chart = $("#chart-live-share");
    const W = chart.clientWidth;
    if (!W) return;
    const ms = D.allMonths, vals = ms.map((k) => { const a = D.sell[k].ttSource; return a[0] / a.reduce((x, y) => x + y, 0); });
    const H = 120, mm = { t: 22, r: 10, b: 22, l: 10 };
    const iw = W - mm.l - mm.r, ih = H - mm.t - mm.b;
    const lo = Math.floor(Math.min(...vals) * 20) / 20, hi = Math.ceil(Math.max(...vals) * 20) / 20;
    const x = (i) => mm.l + (i / (ms.length - 1)) * iw, y = (v) => mm.t + ih - ((v - lo) / (hi - lo)) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "LIVE share of TikTok Shop GMV by month: " + ms.map((k, i) => U.monthShort(k) + " " + pct(vals[i], 0)).join(", ") });
    svg.appendChild(svgEl("text", { x: mm.l, y: 12, class: "lbl-strong" }, "LIVE share of TikTok Shop GMV"));
    const line = vals.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join("");
    svg.appendChild(svgEl("path", { d: line + `L${x(ms.length - 1)},${mm.t + ih}L${x(0)},${mm.t + ih}Z`, fill: "var(--p1)", "fill-opacity": 0.1 }));
    svg.appendChild(svgEl("path", { d: line, fill: "none", stroke: "var(--p1)", "stroke-width": 2 }));
    ms.forEach((k, i) => {
      const sel = k === m;
      if (sel || i === 0 || i === ms.length - 1) {
        svg.appendChild(svgEl("circle", { cx: x(i), cy: y(vals[i]), r: sel ? 5 : 3.5, fill: "var(--p1)", stroke: "var(--panel)", "stroke-width": 2 }));
        svg.appendChild(svgEl("text", { x: x(i), y: y(vals[i]) - 9, "text-anchor": i === 0 ? "start" : i === ms.length - 1 ? "end" : "middle", class: "lbl-strong" }, pct(vals[i], 0)));
      }
      svg.appendChild(svgEl("text", { x: x(i), y: H - 5, "text-anchor": i === 0 ? "start" : i === ms.length - 1 ? "end" : "middle", class: sel ? "lbl-strong" : "" }, U.monthShort(k)));
    });
    chart.replaceChildren(svg);
  }

  // ---------- store table ----------
  function renderStores() {
    const m = U.state.month, pk = U.prevKey(m);
    const sel = $("#trs-platform");
    if (!sel.options.length) sel.append(new Option("All platforms", ""), ...D.platforms.map((x) => new Option(x, x)));
    sel.value = st.platform;
    const before = {};
    if (T(pk)) storeRows(pk).forEach((r) => (before[r.name] = r.visitors));
    let rows = storeRows(m).map((r) => ({ ...r, cvr: r.visitors ? r.orders / r.visitors : null, ctr: r.impr ? r.adClicks / r.impr : null,
      ads: r.visitors ? r.adClicks / r.visitors : null, mom: growth(r.visitors, before[r.name]) })).filter((r) => !st.platform || r.platform === st.platform);
    const key = { visitors: ["visitors", -1], cvr: ["cvr", -1], "cvr-low": ["cvr", 1], ads: ["ads", -1] }[st.sort];
    rows.sort((a, b) => key[1] * ((a[key[0]] ?? -1e9) - (b[key[0]] ?? -1e9)));
    $("#trs-count").textContent = rows.length + " stores";
    const tb = $("#table-traffic tbody");
    tb.replaceChildren();
    if (!rows.length) return U.emptyRow(tb, 8, "No stores on this platform.");
    const maxCvr = Math.max(...rows.map((r) => r.cvr || 0));
    for (const r of rows) {
      const tr = el("tr");
      const n = el("td");
      const k = el("span", "pkey"); k.style.background = PCOL[r.platform];
      const nm = el("span", "t-name"); nm.append(k, r.name);
      const sb = el("span", "t-sub"); sb.append(r.platform, el("span", "only-narrow", " · " + pct(r.cvr, 1) + " conversion"));
      n.append(nm, sb);
      const c = el("td", "barcell opt"); c.appendChild(U.bar(r.cvr / maxCvr, PCOL[r.platform], pct(r.cvr, 1)));
      const dm = el("td", "r"); dm.appendChild(delta(r.mom));
      tr.append(n, el("td", "r", num(r.visitors)), el("td", "r opt", num(r.clicks)), el("td", "r opt", num(r.orders)), c,
        el("td", "r opt", pct(r.ctr, 1)), el("td", "r opt", pct(r.ads, 0)), dm);
      tb.appendChild(tr);
    }
  }

  function redraw() { drawCvr(); drawDaily(); renderTtSource(); }
  function renderAll() { renderLede(); renderKpis(); renderFunnel(); renderStores(); redraw(); }

  $("#trs-platform").addEventListener("change", (e) => { st.platform = e.target.value; renderStores(); });
  $("#trs-sort").addEventListener("change", (e) => { st.sort = e.target.value; renderStores(); });
  U.onMonth(() => renderAll());
  window.TRAFFIC_PAGE = { render: renderAll, redraw };
})();
