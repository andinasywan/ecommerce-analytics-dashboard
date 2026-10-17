/* Page 01: Sell-out. */
(function () {
  "use strict";
  const U = window.U, D = window.DASH;
  const { el, svgEl, rp, rpFull, num, pct, fmt, delta, growth, isNum } = U;
  const $ = (s) => document.querySelector(s);
  if (!D || !D.sell) {
    $("#so-lede").replaceWith(Object.assign(document.createElement("div"), { className: "error", textContent: "The dashboard data did not load. Try reloading the page." }));
    return;
  }

  const PCOL = {};
  D.platforms.forEach((p, i) => (PCOL[p] = "var(--p" + (i + 1) + ")"));
  const STORE = {}; D.stores.forEach(([name, platform, channel, wh]) => (STORE[name] = { platform, channel, wh }));
  const ITEM = {}; D.items.forEach((it) => (ITEM[it.code] = it));
  const CAT = {}; D.brands.forEach(([b, c]) => (CAT[b] = c));
  const KIDS = "Kids & Family";
  const st = { platform: "", wh: "", storeSort: "gmv", brand: "", itemSort: "gmv", q: "" };

  const S = (m) => D.sell[m];
  const prev = (m) => D.sell[U.prevKey(m)];
  const days = (m) => S(m).daily.length;
  const dayTotal = (m) => S(m).daily.map((r) => r.reduce((a, b) => a + b, 0));
  const campaignDays = (m) => U.campaignDays(m, days(m));
  const prevName = (m) => U.monthOnly(U.prevKey(m));

  function itemKind(code) {
    const it = ITEM[code];
    if (!it) return "Single SKU";
    if (it.comp.length > 1) return "Bundle";
    if (it.comp[0][1] > 1) return "Multipack";
    return "Single SKU";
  }
  const skuUnitsPerItem = (code) => (ITEM[code] ? ITEM[code].comp.reduce((a, c) => a + c[1], 0) : 1);

  // ---------- lede, KPIs, notes ----------
  function renderLede() {
    const m = U.state.month, t = S(m).tot, p = prev(m);
    const lede = $("#so-lede");
    lede.replaceChildren();
    const add = (txt, bold) => lede.appendChild(bold ? el("b", null, txt) : document.createTextNode(txt));
    add("In " + U.monthName(m) + ", valid orders brought in ");
    add(rp(t.gmv), true);
    add(" of GMV from " + num(t.orders) + " orders");
    const g = p && growth(t.gmv, p.tot.gmv);
    if (isNum(g)) add(", " + (g >= 0 ? "up " : "down ") + fmt(Math.abs(g) * 100, 1) + "% on " + prevName(m));
    add(". ");
    const plats = D.platforms.map((n) => ({ n, gmv: S(m).plat[n][0] })).sort((a, b) => b.gmv - a.gmv);
    add(plats[0].n + " accounted for ");
    add(pct(plats[0].gmv / t.gmv, 0), true);
    add(" of it. ");
    const tw = campaignDays(m)[0], tot = dayTotal(m);
    add("The " + tw.label + " campaign alone made ");
    add(rp(tot[tw.day - 1]), true);
    add(", or " + pct(tot[tw.day - 1] / t.gmv) + " of the month.");
  }

  function renderKpis() {
    const m = U.state.month, t = S(m).tot, p = prev(m);
    const box = $("#so-kpis");
    box.replaceChildren();
    const idx = D.months.indexOf(m);
    const series = (f) => D.months.map((k) => f(D.sell[k]));
    const lbl = D.months.map(U.monthShort);
    const vs = (now, before) => U.sub([delta(growth(now, before)), " vs " + prevName(m)]);
    box.appendChild(U.kpi("GMV", fmt(t.gmv / 1e9, 2), vs(t.gmv, p && p.tot.gmv), { cur: "Rp", unit: "B", title: rpFull(t.gmv), spark: U.spark(series((s) => s.tot.gmv), idx, lbl) }));
    box.appendChild(U.kpi("Orders", num(t.orders), vs(t.orders, p && p.tot.orders), { spark: U.spark(series((s) => s.tot.orders), idx, lbl) }));
    box.appendChild(U.kpi("Units sold", num(t.units), vs(t.units, p && p.tot.units), { spark: U.spark(series((s) => s.tot.units), idx, lbl) }));
    const aov = (s) => s.tot.gmv / s.tot.orders;
    box.appendChild(U.kpi("Average order value", num(Math.round(aov(S(m)))), vs(aov(S(m)), p && aov(p)), { cur: "Rp", spark: U.spark(series(aov), idx, lbl) }));
    const tot = dayTotal(m), camp = campaignDays(m).filter((c) => c.kind !== "holiday");
    const cg = camp.reduce((a, c) => a + tot[c.day - 1], 0);
    box.appendChild(U.kpi("GMV share of campaign days", pct(cg / t.gmv), U.sub([el("b", null, camp.length + " days"), " (" + camp.map((c) => c.label).join(", ") + ") out of " + days(m)]),
      { meter: cg / t.gmv, meterColor: "var(--camp)" }));
  }

  function renderNotes() {
    const m = U.state.month, s = S(m), tot = dayTotal(m);
    const box = $("#so-notes");
    box.replaceChildren();
    const camp = campaignDays(m), campSet = new Set(camp.map((c) => c.day));
    const normal = tot.filter((_, i) => !campSet.has(i + 1));
    const avgNormal = normal.reduce((a, b) => a + b, 0) / normal.length;
    const tw = camp[0];
    const card = (tag, big, text) => {
      const f = el("figure", "note-card");
      const p = el("p");
      p.append(el("b", null, tag + ". "), text);
      f.append(el("div", "big", big), p);
      box.appendChild(f);
    };
    card("Twin date", fmt(tot[tw.day - 1] / avgNormal, 1) + "× an ordinary day",
      "GMV on " + tw.label + " against the average day without a campaign. Payday on the 25th ran at " + fmt(tot[24] / avgNormal, 1) + "×. Stock has to be in place before these dates, not after.");
    const h = s.hour, hs = h.reduce((a, b) => a + b, 0);
    const others = (hs - h[0]) / 23;
    card("Midnight flash sale", pct(h[0] / hs) + " of GMV",
      "Hour 00:00–00:59 brings " + fmt(h[0] / others, 1) + "× the average of the other hours, almost all of it from promotions that open at midnight on campaign days.");
    let skuAll = 0, skuPack = 0;
    for (const [code, , units] of s.item) {
      const k = skuUnitsPerItem(code) * units;
      skuAll += k;
      if (itemKind(code) !== "Single SKU") skuPack += k;
    }
    card("Bundles & multipacks", pct(skuPack / skuAll, 0) + " of SKU units",
      "Physical units that leave the warehouse inside a pack. That is why stock is counted after bundles are split into SKUs, not from sellable items (see the Forecast page).");
  }

  // ---------- charts ----------
  function drawMonthly() {
    const box = $("#chart-monthly");
    const W = box.clientWidth;
    if (!W) return;
    const H = W < 520 ? 250 : 280;
    const months = D.months;
    const totals = months.map((k) => D.sell[k].tot.gmv);
    const ticks = U.niceTicks(Math.max(...totals) * 1.08, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 22, r: 6, b: 28, l: U.labelWidth(box, ticks.map(U.axisRp)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / months.length;
    const bw = Math.min(56, band * 0.56);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Stacked bar chart of GMV by platform per month" });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisRp(t)));
    }
    const groups = [];
    months.forEach((k, i) => {
      const cx = m.l + (i + 0.5) * band, x0 = cx - bw / 2, x1 = cx + bw / 2;
      const sel = k === U.state.month;
      if (sel) svg.appendChild(svgEl("rect", { x: cx - band / 2 + 4, y: m.t - 18, width: band - 8, height: ih + 18 + 22, rx: 10, fill: "var(--soft)" }));
      const g = svgEl("g");
      let acc = 0;
      const vals = D.platforms.map((p) => D.sell[k].plat[p][0]);
      vals.forEach((v, j) => {
        if (v <= 0) return;
        const yb = y(acc), yt = y(acc + v);
        const last = vals.slice(j + 1).every((x) => x <= 0);
        const gap = j > 0 ? 2 : 0;
        g.appendChild(svgEl("path", { d: last ? U.barPath(x0, x1, yt, yb - gap) : U.rectPath(x0, x1, yt, yb - gap), fill: PCOL[D.platforms[j]] }));
        acc += v;
      });
      svg.appendChild(g);
      svg.appendChild(svgEl("text", { x: cx, y: y(totals[i]) - 7, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, rp(totals[i]).replace("Rp ", "")));
      svg.appendChild(svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, U.monthShort(k)));
      groups.push({ k, g, sel, cx });
    });
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", style: "cursor:pointer" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const idxAt = (ev) => {
      const r = svg.getBoundingClientRect();
      return Math.max(0, Math.min(months.length - 1, Math.floor((((ev.clientX - r.left) / r.width) * W - m.l) / band)));
    };
    hit.addEventListener("pointermove", (ev) => {
      const i = idxAt(ev), k = months[i];
      groups.forEach((g, j) => g.g.setAttribute("opacity", j === i || g.sel ? 1 : 0.75));
      const s = svg.getBoundingClientRect().width / W;
      const rows = D.platforms.slice().reverse().map((p) => ({ label: p, value: rp(D.sell[k].plat[p][0]), color: PCOL[p] }));
      rows.push({ label: "Total", value: rp(totals[i]) });
      U.showTip(box, groups[i].cx * s, y(totals[i]) * s, U.monthName(k), rows, k === U.state.month ? null : "Click to select this month");
    });
    hit.addEventListener("pointerleave", () => { groups.forEach((g) => g.g.setAttribute("opacity", 1)); U.hideTip(box); });
    hit.addEventListener("click", (ev) => { const k = months[idxAt(ev)]; if (k !== U.state.month) { U.hideTip(box); U.setMonth(k); } });
  }

  function drawDaily() {
    const box = $("#chart-daily");
    const W = box.clientWidth;
    if (!W) return;
    const mo = U.state.month;
    $("#daily-title").textContent = "Daily GMV, " + U.monthName(mo);
    const narrow = W < 520;
    const H = narrow ? 250 : 280;
    const vals = dayTotal(mo), n = vals.length;
    const cmap = {};
    campaignDays(mo).forEach((c) => (cmap[c.day] = c));
    const ticks = U.niceTicks(Math.max(...vals) * 1.1, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 18, r: 6, b: 28, l: U.labelWidth(box, ticks.map(U.axisRp)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / n, bw = Math.max(2, band - 2);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Bar chart of GMV per day, " + U.monthName(mo) });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisRp(t)));
    }
    const bars = [];
    vals.forEach((v, i) => {
      const x0 = m.l + i * band + 1, c = cmap[i + 1];
      const camp = c && c.kind !== "holiday";
      const p = svgEl("path", { d: U.barPath(x0, x0 + bw, y(v), y(0), Math.min(3, bw / 2)), fill: camp ? "var(--camp)" : "var(--one-soft)" });
      svg.appendChild(p);
      bars.push(p);
      if (camp) svg.appendChild(svgEl("text", { x: x0 + bw / 2, y: y(v) - 6, "text-anchor": c.kind === "payday" && narrow ? "end" : "middle", class: "lbl-camp" }, c.label));
    });
    const avg = vals.reduce((a, b) => a + b, 0) / n;
    svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(avg), y2: y(avg), stroke: "var(--fg)", "stroke-width": 1.2, "stroke-opacity": 0.7 }));
    const avgLbl = "average " + rp(avg);
    const lw = U.labelWidth(box, [avgLbl]);
    const lx = Math.min(m.l + iw - lw - 4, Math.max(m.l + 4, m.l + 16.5 * band - lw / 2));
    svg.appendChild(svgEl("rect", { x: lx - 3, y: y(avg) - 17, width: lw + 6, height: 14, fill: "var(--panel)", "fill-opacity": 0.88, rx: 3 }));
    svg.appendChild(svgEl("text", { x: lx, y: y(avg) - 6, "text-anchor": "start", class: "lbl-strong" }, avgLbl));
    [1, 5, 10, 15, 20, 25, 30].filter((d) => d <= n).forEach((d) => svg.appendChild(svgEl("text", { x: m.l + (d - 0.5) * band, y: H - 8, "text-anchor": "middle" }, String(d))));
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.floor((((ev.clientX - r.left) / r.width) * W - m.l) / band)));
      bars.forEach((b, j) => b.setAttribute("fill-opacity", j === i ? 1 : 0.55));
      const s = r.width / W, d = i + 1;
      const row = S(mo).daily[i];
      const top = D.platforms.map((p, j) => [p, row[j]]).sort((a, b) => b[1] - a[1])[0];
      const date = new Date(+mo.slice(0, 4), U.monthNo(mo) - 1, d);
      const c = cmap[d];
      const title = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + (c ? " · " + (c.kind === "twin" ? c.label + " campaign" : c.kind === "payday" ? "payday" : "Independence Day") : "");
      U.showTip(box, (m.l + (i + 0.5) * band) * s, y(vals[i]) * s, title, [
        { label: "GMV", value: rp(vals[i]) },
        { label: "Orders", value: num(S(mo).dailyOrders[i]) },
        { label: "vs average", value: fmt(vals[i] / avg, 1) + "×" },
        { label: "Top platform", value: top[0], color: PCOL[top[0]] },
      ]);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { bars.forEach((b) => b.setAttribute("fill-opacity", 1)); U.hideTip(box); });
  }

  function drawHours() {
    const box = $("#chart-hours");
    const W = box.clientWidth;
    if (!W) return;
    const h = S(U.state.month).hour, hs = h.reduce((a, b) => a + b, 0);
    const vals = h.map((v) => v / hs);
    const H = W < 520 ? 210 : 230;
    const ticks = U.niceTicks(Math.max(...vals) * 1.12, 4);
    const yMax = ticks[ticks.length - 1];
    const tl = ticks.map((t) => fmt(t * 100, 0) + "%");
    const m = { t: 18, r: 6, b: 28, l: U.labelWidth(box, tl) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / 24, bw = Math.max(3, band - 3);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Bar chart of GMV share by hour" });
    ticks.forEach((t, i) => {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, tl[i]));
    });
    const peak = vals.indexOf(Math.max(...vals));
    const strong = (i) => i === peak || i === 0;
    const bars = vals.map((v, i) => {
      const x0 = m.l + i * band + 1.5;
      const p = svgEl("path", { d: U.barPath(x0, x0 + bw, y(v), y(0), 3), fill: "var(--one)", "fill-opacity": strong(i) ? 1 : 0.6 });
      svg.appendChild(p);
      return p;
    });
    svg.appendChild(svgEl("text", { x: m.l + (peak + 0.5) * band, y: y(vals[peak]) - 6, "text-anchor": peak < 2 ? "start" : "middle", class: "lbl-strong" }, pct(vals[peak])));
    if (peak !== 0) svg.appendChild(svgEl("text", { x: m.l + 1.5, y: y(vals[0]) - 6, "text-anchor": "start", class: "lbl-strong" }, pct(vals[0])));
    for (let i = 0; i < 24; i += 3) svg.appendChild(svgEl("text", { x: m.l + (i + 0.5) * band, y: H - 8, "text-anchor": "middle" }, String(i).padStart(2, "0")));
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(23, Math.floor((((ev.clientX - r.left) / r.width) * W - m.l) / band)));
      bars.forEach((b, j) => b.setAttribute("fill-opacity", j === i || strong(j) ? 1 : 0.6));
      const s = r.width / W, hh = String(i).padStart(2, "0");
      U.showTip(box, (m.l + (i + 0.5) * band) * s, y(vals[i]) * s, hh + ":00–" + hh + ":59", [{ label: "GMV share", value: pct(vals[i]) }, { label: "GMV", value: rp(h[i]) }]);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { bars.forEach((b, j) => b.setAttribute("fill-opacity", strong(j) ? 1 : 0.6)); U.hideTip(box); });
  }

  // ---------- warehouse map ----------
  function whRows(m) {
    const s = S(m), p = prev(m), out = {};
    for (const w of D.warehouses) out[w] = { name: w, gmv: 0, orders: 0, stores: 0, before: 0, plat: {} };
    s.store.forEach(([name, gmv, orders]) => {
      const r = out[STORE[name].wh];
      r.gmv += gmv; r.orders += orders; r.stores += 1;
      r.plat[STORE[name].platform] = (r.plat[STORE[name].platform] || 0) + gmv;
    });
    if (p) p.store.forEach(([name, gmv]) => (out[STORE[name].wh].before += gmv));
    return D.warehouses.map((w) => out[w]).sort((a, b) => b.gmv - a.gmv);
  }
  function pickWh(w, scroll) {
    st.wh = w;
    $("#store-wh").value = w;
    renderStores();
    renderWhList();
    drawWhMap();
    if (scroll && w) $("#store-wh").scrollIntoView({ behavior: U.reduceMotion ? "auto" : "smooth", block: "center" });
  }
  function renderWhList() {
    const m = U.state.month, rows = whRows(m), tot = S(m).tot.gmv;
    $("#so-map-sub").textContent = D.stores.length + " stores ship from " + D.warehouses.length + " warehouses · " + U.monthName(m);
    U.whList($("#wl-sellout"), rows.map((r) => ({ name: r.name, label: rp(r.gmv), bar: r.gmv / rows[0].gmv,
      sub: pct(r.gmv / tot, 0) + " of GMV · " + r.stores + (r.stores === 1 ? " store" : " stores"), delta: delta(growth(r.gmv, r.before)) })), st.wh, (w) => pickWh(w, true));
  }
  function drawWhMap() {
    const m = U.state.month, rows = whRows(m), tot = S(m).tot.gmv;
    U.drawMap($("#map-sellout"), rows.map((r) => ({ name: r.name, value: r.gmv, label2: rp(r.gmv), r })), {
      aria: "Map of Indonesia with the five warehouses sized by GMV shipped",
      selected: st.wh,
      onPick: (w) => pickWh(st.wh === w ? "" : w, true),
      tip: (p) => {
        const top = Object.entries(p.r.plat).sort((a, b) => b[1] - a[1])[0];
        return [{ label: "GMV", value: rp(p.r.gmv) }, { label: "Share of GMV", value: pct(p.r.gmv / tot) }, { label: "Orders", value: num(p.r.orders) },
          { label: "Stores", value: String(p.r.stores) }, { label: "Top platform", value: top[0], color: PCOL[top[0]] }, { label: "vs last month", value: U.signedPct(growth(p.r.gmv, p.r.before)) }];
      },
    });
  }

  // ---------- platform list & store table ----------
  function renderPlatforms() {
    const m = U.state.month, s = S(m), p = prev(m);
    $("#platform-pos").textContent = U.monthName(m) + " · compared with " + prevName(m);
    const box = $("#plat-list");
    box.replaceChildren();
    const leg = $("#leg-platform");
    leg.replaceChildren();
    for (const name of D.platforms) {
      const span = el("span"); const k = el("span", "key"); k.style.background = PCOL[name];
      span.append(k, name); leg.appendChild(span);
    }
    const rows = D.platforms.map((n) => ({ n, gmv: s.plat[n][0], orders: s.plat[n][1], before: p ? p.plat[n][0] : null })).sort((a, b) => b.gmv - a.gmv);
    for (const r of rows) {
      const row = el("div", "plat-row");
      const name = el("div", "plat-name");
      const k = el("span", "pkey"); k.style.background = PCOL[r.n];
      name.append(k, r.n, el("small", null, num(r.orders) + " orders"));
      const g = el("div", "plat-gmv", rp(r.gmv)); g.title = rpFull(r.gmv);
      row.append(name, g, delta(growth(r.gmv, r.before)), U.bar(r.gmv / s.tot.gmv, PCOL[r.n]));
      box.appendChild(row);
    }
  }

  function renderStores() {
    const m = U.state.month, s = S(m), p = prev(m);
    const sel = $("#store-platform");
    if (!sel.options.length) sel.append(new Option("All platforms", ""), ...D.platforms.map((x) => new Option(x, x)));
    sel.value = st.platform;
    const whSel = $("#store-wh");
    if (!whSel.options.length) whSel.append(new Option("All warehouses", ""), ...D.warehouses.map((x) => new Option(x, x)));
    whSel.value = st.wh;
    const before = {};
    if (p) p.store.forEach(([n, g]) => (before[n] = g));
    let rows = s.store.map(([name, gmv, orders]) => ({ name, gmv, orders, aov: orders ? gmv / orders : null, mom: growth(gmv, before[name]), ...STORE[name] }))
      .filter((r) => (!st.platform || r.platform === st.platform) && (!st.wh || r.wh === st.wh));
    const key = { gmv: ["gmv", -1], mom: ["mom", -1], "mom-low": ["mom", 1], aov: ["aov", -1] }[st.storeSort];
    rows.sort((a, b) => key[1] * ((a[key[0]] ?? -1e9) - (b[key[0]] ?? -1e9)));
    $("#store-count").textContent = rows.length + " stores · " + D.warehouses.length + " warehouses";
    const tb = $("#table-store tbody");
    tb.replaceChildren();
    if (!rows.length) return U.emptyRow(tb, 7, "No stores match this platform and warehouse.");
    const max = Math.max(...rows.map((r) => r.gmv / s.tot.gmv));
    for (const r of rows) {
      const tr = el("tr");
      const n = el("td");
      const k = el("span", "pkey"); k.style.background = PCOL[r.platform];
      const nm = el("span", "t-name"); nm.append(k, r.name);
      n.append(nm, el("span", "t-sub", r.platform));
      const g = el("td", "r", rp(r.gmv)); g.title = rpFull(r.gmv);
      const share = el("td", "barcell opt");
      share.appendChild(U.bar(r.gmv / s.tot.gmv / max, PCOL[r.platform], pct(r.gmv / s.tot.gmv)));
      const dm = el("td", "r"); dm.appendChild(delta(r.mom));
      tr.append(n, el("td", "opt", r.wh), g, el("td", "r opt", num(r.orders)), el("td", "r opt", rp(r.aov, 1)), share, dm);
      tb.appendChild(tr);
    }
  }

  // ---------- brands ----------
  function brandRows(m) {
    const s = S(m), p = prev(m), before = {};
    if (p) p.brand.forEach(([b, g]) => (before[b] = g));
    return s.brand.map(([b, gmv, orders, units]) => ({ b, gmv, orders, units, share: gmv / s.tot.gmv, mom: growth(gmv, before[b]), kids: CAT[b] === KIDS }))
      .sort((a, b) => b.gmv - a.gmv);
  }

  function drawBrandScatter() {
    const box = $("#chart-brand-scatter");
    const W = box.clientWidth;
    if (!W) return;
    const rows = brandRows(U.state.month);
    const H = Math.min(330, Math.max(250, W * 0.62));
    const maxX = Math.ceil(Math.max(...rows.map((r) => r.share)) * 20) / 20 + 0.0001;
    const yExt = Math.ceil(Math.max(0.1, ...rows.map((r) => Math.abs(r.mom || 0))) * 20) / 20;
    const yt = [];
    for (let v = -yExt; v <= yExt + 1e-9; v += yExt / 2) yt.push(+v.toFixed(4));
    const ylab = yt.map((v) => U.signedPct(v, 0).replace("±", ""));
    const m = { t: 12, r: 16, b: 40, l: U.labelWidth(box, ylab) + 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (v) => m.l + (v / maxX) * iw;
    const y = (v) => m.t + ih / 2 - (v / yExt) * (ih / 2);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Brands by GMV share and growth" });
    yt.forEach((v, i) => {
      const zero = Math.abs(v) < 1e-9;
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: zero ? "var(--axis)" : "var(--grid)", "stroke-width": zero ? 1.5 : 1 }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, ylab[i]));
    });
    for (let v = 0; v <= maxX + 1e-9; v += 0.05) {
      svg.appendChild(svgEl("line", { x1: x(v), x2: x(v), y1: m.t, y2: m.t + ih, stroke: "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: x(v), y: m.t + ih + 16, "text-anchor": v === 0 ? "start" : "middle" }, fmt(v * 100, 0) + "%"));
    }
    svg.appendChild(svgEl("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle" }, "Share of GMV this month →"));
    svg.appendChild(svgEl("text", { x: 0, y: 0, "text-anchor": "middle", transform: `translate(11 ${m.t + ih / 2}) rotate(-90)` }, "Growth vs last month →"));
    const labelled = new Set(rows.slice(0, 3).map((r) => r.b));
    const byMom = rows.filter((r) => isNum(r.mom)).sort((a, b) => b.mom - a.mom);
    if (byMom.length) { labelled.add(byMom[0].b); labelled.add(byMom[byMom.length - 1].b); }
    if (st.brand) labelled.add(st.brand);
    const dots = [];
    for (const r of rows) {
      if (!isNum(r.mom)) continue;
      const active = !st.brand || st.brand === r.b;
      const cx = x(r.share), cy = y(Math.max(-yExt, Math.min(yExt, r.mom)));
      const g = svgEl("g", { style: "cursor:pointer", tabindex: "0", role: "button", "aria-label": r.b + ", share " + pct(r.share) + ", growth " + U.signedPct(r.mom) });
      g.appendChild(svgEl("circle", { cx, cy, r: 13, fill: "transparent" }));
      g.appendChild(svgEl("circle", { cx, cy, r: st.brand === r.b ? 7.5 : 6, fill: r.kids ? "var(--one)" : "var(--panel)", stroke: r.kids ? "var(--panel)" : "var(--one)", "stroke-width": r.kids ? 2 : 2.2, opacity: active ? 1 : 0.3 }));
      if (labelled.has(r.b)) {
        const right = cx < m.l + iw * 0.7;
        g.appendChild(svgEl("text", { x: cx + (right ? 10 : -10), y: cy + 4, "text-anchor": right ? "start" : "end", class: "lbl-strong", opacity: active ? 1 : 0.4 }, r.b));
      }
      svg.appendChild(g);
      dots.push({ r, g, cx, cy });
    }
    box.replaceChildren(svg);
    for (const { r, g, cx, cy } of dots) {
      const show = () => {
        const k = svg.getBoundingClientRect().width / W;
        U.showTip(box, cx * k, cy * k, r.b, [
          { label: "GMV", value: rp(r.gmv) },
          { label: "GMV share", value: pct(r.share) },
          { label: "vs last month", value: U.signedPct(r.mom) },
          { label: "Category", value: r.kids ? "Kids & Family" : "Adult & Specialty" },
        ], "Click to see this brand's items");
      };
      g.addEventListener("pointerenter", show);
      g.addEventListener("focus", show);
      g.addEventListener("pointerleave", () => U.hideTip(box));
      g.addEventListener("blur", () => U.hideTip(box));
      const pick = () => { U.hideTip(box); pickBrand(st.brand === r.b ? "" : r.b, true); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    }
  }

  function renderBrandBars() {
    const rows = brandRows(U.state.month);
    const box = $("#brand-bars");
    box.replaceChildren();
    const max = rows[0].gmv;
    for (const r of rows) {
      const b = el("button", "bb-row" + (r.kids ? "" : " ring") + (st.brand === r.b ? " sel" : ""));
      b.type = "button";
      b.title = r.b + ": " + rpFull(r.gmv);
      const tr = el("div", "bb-track"); const f = el("div", "bb-fill");
      f.style.width = (r.gmv / max) * 100 + "%"; tr.appendChild(f);
      b.append(el("span", "bb-name", r.b), tr, el("span", "bb-val", rp(r.gmv)), delta(r.mom));
      b.addEventListener("click", () => pickBrand(st.brand === r.b ? "" : r.b, true));
      box.appendChild(b);
    }
  }

  // ---------- item table ----------
  function renderItemBrandSelect() {
    const sel = $("#item-brand");
    if (!sel.options.length) {
      const brands = D.brands.map((b) => b[0]).sort((a, b) => a.localeCompare(b));
      sel.append(new Option("All brands", ""), ...brands.map((b) => new Option(b, b)));
    }
    sel.value = st.brand;
  }
  function renderItems() {
    const m = U.state.month, s = S(m), p = prev(m);
    const before = {};
    if (p) p.item.forEach(([c, g]) => (before[c] = g));
    const all = s.item.map(([code, gmv, units, orders]) => {
      const it = ITEM[code] || { name: code, brand: "" };
      return { code, gmv, units, orders, name: it.name, brand: it.brand, kind: itemKind(code), price: units ? gmv / units : null, mom: growth(gmv, before[code]) };
    });
    const q = st.q.trim().toLowerCase();
    let rows = all.filter((r) => (!st.brand || r.brand === st.brand) && (!q || (r.code + " " + r.name).toLowerCase().includes(q)));
    const key = { gmv: ["gmv", -1], units: ["units", -1], mom: ["mom", -1], "mom-low": ["mom", 1], price: ["price", -1] }[st.itemSort];
    rows.sort((a, b) => key[1] * ((a[key[0]] ?? -1e9) - (b[key[0]] ?? -1e9)));
    $("#item-count").textContent = rows.length === all.length ? all.length + " items" : "Showing " + rows.length + " of " + all.length + " items";
    const tb = $("#table-item tbody");
    tb.replaceChildren();
    if (!rows.length) return U.emptyRow(tb, 7, "No matching items. Change the search or pick All brands.");
    for (const r of rows) {
      const tr = el("tr");
      const c = el("td", "opt"); c.appendChild(el("span", "code", r.code));
      const n = el("td"); n.append(el("span", "t-name", r.name));
      const sb = el("span", "t-sub"); sb.append(el("span", "only-narrow", r.code + " · " + r.kind + " · "), r.brand + " · " + (CAT[r.brand] || ""));
      n.appendChild(sb);
      const k = el("td", "opt"); k.appendChild(el("span", "kind" + (r.kind === "Single SKU" ? "" : " bundle"), r.kind));
      const g = el("td", "r", rp(r.gmv)); g.title = rpFull(r.gmv);
      const dm = el("td", "r"); dm.appendChild(delta(r.mom));
      tr.append(c, n, k, el("td", "r opt", num(r.units)), g, el("td", "r opt", rp(r.price, 1)), dm);
      tb.appendChild(tr);
    }
  }

  function pickBrand(b, scroll) {
    st.brand = b;
    $("#item-brand").value = b;
    drawBrandScatter();
    renderBrandBars();
    renderItems();
    if (scroll && b) $("#items").scrollIntoView({ behavior: U.reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function redraw() { drawWhMap(); drawMonthly(); drawDaily(); drawHours(); drawBrandScatter(); }
  function renderAll() {
    renderLede(); renderKpis(); renderNotes(); renderWhList(); renderPlatforms(); renderStores();
    renderBrandBars(); renderItemBrandSelect(); renderItems();
    redraw();
  }

  $("#store-platform").addEventListener("change", (e) => { st.platform = e.target.value; renderStores(); });
  $("#store-sort").addEventListener("change", (e) => { st.storeSort = e.target.value; renderStores(); });
  $("#store-wh").addEventListener("change", (e) => pickWh(e.target.value, false));
  $("#item-brand").addEventListener("change", (e) => pickBrand(e.target.value, false));
  $("#item-sort").addEventListener("change", (e) => { st.itemSort = e.target.value; renderItems(); });
  $("#item-search").addEventListener("input", (e) => { st.q = e.target.value; renderItems(); });

  U.onMonth(() => renderAll());
  window.SELLOUT_PAGE = { render: renderAll, redraw, campaignDays, dayTotal, PCOL };
})();
