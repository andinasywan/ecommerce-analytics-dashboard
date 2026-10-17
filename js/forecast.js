/* Page 04: Forecast & warehouse stock. */
(function () {
  "use strict";
  const U = window.U, D = window.DASH;
  const { el, svgEl, num, pct, fmt, delta, isNum } = U;
  const $ = (s) => document.querySelector(s);
  if (!D || !D.fc) {
    $("#fc-lede").replaceWith(Object.assign(document.createElement("div"), { className: "error", textContent: "The forecast data did not load. Try reloading the page." }));
    return;
  }
  const FC = D.fc, TOL = FC.tolerance, WH = D.warehouses;
  const SKU = {};
  D.skus.forEach(([code, name, brand, cat, box, status]) => (SKU[code] = { code, name, brand, cat, box, status: status || "Active" }));
  const LAUNCH = D.launch || {};
  const st = { wh: "", sort: "err", sku: null, planWh: WH[0], stockWh: "", band: "", status: "", stockSort: "doi" };

  // product status from the monthly SKU review (Active / New / Slow moving / Phase-out)
  const STATUSES = ["Active", "New", "Slow moving", "Phase-out"];
  const CHIP = { New: "new", "Slow moving": "slow", "Phase-out": "phase" };
  function statusChip(code) {
    const s = SKU[code].status;
    if (!CHIP[s]) return document.createTextNode("");
    const c = el("span", "st-chip " + CHIP[s], s);
    c.title = s === "New" && LAUNCH[code] ? "Launched " + U.monthName(LAUNCH[code]) : s === "Phase-out" ? "Being discontinued: sell through, do not restock" : "Sells slowly against the stock held";
    return c;
  }
  const skuCell = (code, sub) => {
    const td = el("td");
    td.append(el("span", "code", code), document.createTextNode(" "), el("span", "t-name", short(code)), statusChip(code), el("span", "t-sub", sub || SKU[code].brand));
    return td;
  };

  // ---------- metrics ----------
  const rows = (m) => (FC.rows[m] || []).map(([sku, wh, f, a]) => ({ sku, wh, f, a }));
  function metrics(list) {
    let A = 0, F = 0, E = 0;
    for (const r of list) { A += r.a; F += r.f; E += Math.abs(r.f - r.a); }
    return { A, F, acc: A ? 1 - E / A : null, bias: A ? (F - A) / A : null };
  }
  const err = (r) => (r.a > 0 ? (r.f - r.a) / r.a : r.f > 0 ? 1 : 0);
  const outside = (r) => Math.abs(err(r)) > TOL;
  const short = (code) => SKU[code].name;
  const prevInShow = (m) => { const i = D.months.indexOf(m); return i > 0 ? D.months[i - 1] : null; };
  const month = (m) => U.monthOnly(m);
  const nextName = U.monthName(D.next);

  // ---------- lede & KPIs ----------
  function renderLede() {
    const m = U.state.month, list = rows(m), t = metrics(list);
    const lede = $("#fc-lede");
    lede.replaceChildren();
    const add = (txt, bold) => lede.appendChild(bold ? el("b", null, txt) : document.createTextNode(txt));
    add("The " + U.monthName(m) + " forecast was ");
    add(pct(t.acc) + " accurate", true);
    add(" with a bias of ");
    add(U.signedPct(t.bias), true);
    add(t.bias < -0.03 ? ": it ran below actual sales, as a 3-month average always lags while sales are climbing. "
      : t.bias > 0.03 ? ": it ran above actual sales, so stock risks piling up. " : ": forecast and sales were in balance. ");
    const byWh = WH.map((w) => ({ w, ...metrics(list.filter((r) => r.wh === w)) })).sort((a, b) => a.acc - b.acc);
    add("Least accurate warehouse: ");
    add(byWh[0].w + " (" + pct(byWh[0].acc, 0) + ")", true);
    const worst = list.slice().sort((a, b) => Math.abs(b.f - b.a) - Math.abs(a.f - a.a))[0];
    if (worst) {
      add(". The biggest miss in units was ");
      add(short(worst.sku) + " in " + worst.wh, true);
      add(" (forecast " + num(worst.f) + ", actual " + num(worst.a) + "). ");
    }
    const sl = stockRows(m);
    if (sl.length) {
      const low = sl.filter((r) => r.doi < SB[0]).length;
      add("At month end the warehouses held ");
      add(fmt(cover(sl), 0) + " days of stock", true);
      add(low ? ", but " : ", and no SKU was close to running out.");
      if (low) { add(num(low) + " SKU × warehouse " + (low === 1 ? "pair" : "pairs"), true); add(" had less than two weeks left."); }
    }
  }

  function renderKpis() {
    const m = U.state.month, list = rows(m), t = metrics(list);
    const pm = prevInShow(m), pt = pm && metrics(rows(pm));
    const box = $("#fc-kpis");
    box.replaceChildren();
    const accSub = pt ? U.sub([delta((t.acc - pt.acc) * 100, { points: true }), " vs " + month(pm)]) : U.sub(["first month tested"]);
    box.appendChild(U.kpi("Forecast accuracy", pct(t.acc), accSub, { meter: t.acc }));
    box.appendChild(U.kpi("Bias", U.signedPct(t.bias), U.sub([t.bias < 0 ? "forecast below actual" : "forecast above actual"])));
    box.appendChild(U.kpi("Actual SKU units", num(t.A), U.sub(["forecast ", el("b", null, num(t.F)), " units"])));
    const out = list.filter(outside).length;
    box.appendChild(U.kpi("SKU × warehouse misses", num(out), U.sub(["of ", el("b", null, num(list.length)), " pairs, tolerance ±" + fmt(TOL * 100, 0) + "%"]), { unit: "pairs" }));
    const sl = stockRows(m), low = sl.filter((r) => r.doi < SB[0]).length;
    if (sl.length) box.appendChild(U.kpi("Stock cover", fmt(cover(sl), 0), U.sub([el("b", null, num(low)), " pairs under " + SB[0] + " days"]), { unit: "days" }));
    const cartons = FC.plan.reduce((a, r) => a + r[3], 0);
    box.appendChild(U.kpi(month(D.next) + " shipment plan", num(cartons), U.sub(["to " + WH.length + " warehouses, " + fmt(FC.buffer * 100, 0) + "% safety stock"]), { unit: "cartons" }));
  }

  // ---------- warehouse network map ----------
  function netRows() {
    const m = U.state.month, list = rows(m);
    return WH.map((w) => {
      const plan = FC.plan.filter((r) => r[1] === w);
      return { name: w, cartons: plan.reduce((a, r) => a + r[3], 0), units: plan.reduce((a, r) => a + r[2], 0), ...metrics(list.filter((r) => r.wh === w)) };
    }).sort((a, b) => b.cartons - a.cartons);
  }
  function pickNet(w) {
    st.planWh = w || WH[0];
    st.wh = w;
    $("#heat-wh").value = w;
    renderNetList(); drawNetMap(); renderPlan(); renderWhTable(); renderHeat(); drawScatter();
  }
  function renderNetList() {
    const rs = netRows();
    $("#fc-map-sub").textContent = num(FC.plan.reduce((a, r) => a + r[3], 0)) + " cartons planned for " + nextName + " · accuracy for " + U.monthName(U.state.month);
    U.whList($("#wl-forecast"), rs.map((r) => ({ name: r.name, label: num(r.cartons) + " cartons", bar: r.cartons / rs[0].cartons,
      sub: pct(r.acc, 0) + " accurate · bias " + U.signedPct(r.bias, 0) })), st.wh, (w) => pickNet(w));
  }
  function drawNetMap() {
    const rs = netRows();
    U.drawMap($("#map-forecast"), rs.map((r) => ({ name: r.name, value: r.cartons, label2: num(r.cartons) + " cartons · " + pct(r.acc, 0), r })), {
      aria: "Map of Indonesia with the five warehouses sized by cartons to ship, ringed by forecast accuracy",
      selected: st.wh,
      ring: (p) => p.r.acc,
      onPick: (w) => pickNet(st.wh === w ? "" : w),
      tip: (p) => [{ label: month(D.next) + " cartons", value: num(p.r.cartons) }, { label: month(D.next) + " units", value: num(p.r.units) },
        { label: month(U.state.month) + " accuracy", value: pct(p.r.acc) }, { label: "Bias", value: U.signedPct(p.r.bias) }],
    });
  }

  // ---------- monthly forecast vs actual ----------
  function drawMonthly() {
    const box = $("#chart-fc-month");
    const W = box.clientWidth;
    if (!W) return;
    $("#fc-method").textContent = "Forecast for month M = 0.5 × actual M−1 + 0.3 × M−2 + 0.2 × M−3";
    const H = W < 520 ? 250 : 280;
    const ms = D.months.map((k) => ({ k, ...metrics(rows(k)) }));
    const ticks = U.niceTicks(Math.max(...ms.map((x) => Math.max(x.A, x.F))) * 1.12, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 22, r: 6, b: 28, l: U.labelWidth(box, ticks.map(U.axisNum)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / ms.length, bw = Math.min(54, band * 0.5);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Actual and forecast units per month" });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisNum(t)));
    }
    const gs = ms.map((x, i) => {
      const cx = m.l + (i + 0.5) * band, sel = x.k === U.state.month;
      if (sel) svg.appendChild(svgEl("rect", { x: cx - band / 2 + 4, y: m.t - 20, width: band - 8, height: ih + 20 + 22, rx: 10, fill: "var(--soft)" }));
      const g = svgEl("g");
      g.appendChild(svgEl("path", { d: U.barPath(cx - bw / 2, cx + bw / 2, y(x.A), y(0)), fill: sel ? "var(--one)" : "var(--one-soft)" }));
      g.appendChild(svgEl("rect", { x: cx - bw / 2 - 6, y: y(x.F) - 1.5, width: bw + 12, height: 3, rx: 1.5, fill: "var(--fg)" }));
      if (band >= 30 || sel) g.appendChild(svgEl("text", { x: cx, y: Math.min(y(x.A), y(x.F)) - 8, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, pct(x.acc, 0)));
      svg.appendChild(g);
      svg.appendChild(svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, U.monthShort(x.k)));
      return { g, sel, cx, x };
    });
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", style: "cursor:pointer" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const at = (ev) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(ms.length - 1, Math.floor((((ev.clientX - r.left) / r.width) * W - m.l) / band))); };
    hit.addEventListener("pointermove", (ev) => {
      const i = at(ev), x = ms[i];
      gs.forEach((g, j) => g.g.setAttribute("opacity", j === i || g.sel ? 1 : 0.8));
      const s = svg.getBoundingClientRect().width / W;
      U.showTip(box, gs[i].cx * s, y(Math.max(x.A, x.F)) * s, U.monthName(x.k), [
        { label: "Actual", value: num(x.A) + " units", color: "var(--one)" },
        { label: "Forecast", value: num(x.F) + " units", color: "var(--fg)" },
        { label: "Accuracy", value: pct(x.acc) },
        { label: "Bias", value: U.signedPct(x.bias) },
      ], x.k === U.state.month ? null : "Click to select this month");
    });
    hit.addEventListener("pointerleave", () => { gs.forEach((g) => g.g.setAttribute("opacity", 1)); U.hideTip(box); });
    hit.addEventListener("click", (ev) => { const k = ms[at(ev)].k; if (k !== U.state.month) { U.hideTip(box); U.setMonth(k); } });
  }

  // ---------- warehouse x month accuracy ----------
  function renderWhTable() {
    const t = $("#table-wh");
    t.replaceChildren();
    const thead = el("thead"), hr = el("tr");
    hr.appendChild(el("th", null, "Warehouse"));
    D.months.forEach((k) => { const th = el("th", null, U.monthShort(k)); if (k === U.state.month) th.style.color = "var(--fg)"; hr.appendChild(th); });
    thead.appendChild(hr);
    const tb = el("tbody");
    for (const L of [{ w: "", label: "All warehouses" }, ...WH.map((w) => ({ w, label: w }))]) {
      const tr = el("tr", "click-row" + (st.wh === L.w ? " sel" : ""));
      tr.tabIndex = 0;
      tr.appendChild(el("td", "k", L.label));
      for (const k of D.months) {
        const mt = metrics(rows(k).filter((r) => !L.w || r.wh === L.w));
        const td = el("td", "heat" + (k === U.state.month ? " sel" : ""), pct(mt.acc, 0));
        td.style.setProperty("--h", Math.round(Math.max(0, Math.min(1, (0.95 - mt.acc) / 0.2)) * 60) + "%");
        td.title = L.label + ", " + U.monthName(k) + ": accuracy " + pct(mt.acc) + ", bias " + U.signedPct(mt.bias);
        tr.appendChild(td);
      }
      const go = () => { st.wh = L.w; $("#heat-wh").value = L.w; renderWhTable(); renderHeat(); drawScatter(); renderNetList(); drawNetMap(); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      tb.appendChild(tr);
    }
    t.append(thead, tb);
  }

  // ---------- scatter forecast vs actual ----------
  function drawScatter() {
    const box = $("#chart-fc-scatter");
    const W = box.clientWidth;
    if (!W) return;
    const list = rows(U.state.month).filter((r) => r.a > 0 && r.f > 0);
    const H = Math.min(360, Math.max(270, W * 0.7));
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...list.map((r) => Math.min(r.a, r.f))))));
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...list.map((r) => Math.max(r.a, r.f))))));
    const decades = [];
    for (let v = lo; v <= hi + 1e-9; v *= 10) decades.push(v);
    const m = { t: 10, r: 14, b: 40, l: U.labelWidth(box, decades.map(U.axisNum)) + 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const L = (v) => (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
    const x = (v) => m.l + L(v) * iw, y = (v) => m.t + ih - L(v) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Forecast against actual per SKU and warehouse, log scale" });
    const defs = svgEl("defs"), cp = svgEl("clipPath", { id: "fcclip" });
    cp.appendChild(svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih })); defs.appendChild(cp); svg.appendChild(defs);
    for (const v of decades) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: "var(--grid)" }));
      svg.appendChild(svgEl("line", { x1: x(v), x2: x(v), y1: m.t, y2: m.t + ih, stroke: "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, U.axisNum(v)));
      svg.appendChild(svgEl("text", { x: x(v), y: m.t + ih + 16, "text-anchor": v === lo ? "start" : v === hi ? "end" : "middle" }, U.axisNum(v)));
    }
    svg.appendChild(svgEl("polygon", { points: [[lo, lo * (1 - TOL)], [hi, hi * (1 - TOL)], [hi, hi * (1 + TOL)], [lo, lo * (1 + TOL)]].map(([a, f]) => x(a) + "," + y(f)).join(" "),
      fill: "var(--soft)", "clip-path": "url(#fcclip)" }));
    svg.appendChild(svgEl("line", { x1: x(lo), y1: y(lo), x2: x(hi), y2: y(hi), stroke: "var(--axis)", "stroke-width": 1.5 }));
    svg.appendChild(svgEl("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle" }, "Actual (units) →"));
    svg.appendChild(svgEl("text", { x: 0, y: 0, "text-anchor": "middle", transform: `translate(11 ${m.t + ih / 2}) rotate(-90)` }, "Forecast (units) →"));
    const pts = [];
    const colorOf = (r) => { const e = err(r); return e > TOL ? "var(--over)" : e < -TOL ? "var(--under)" : "var(--axis)"; };
    const rank = (r) => (r.sku === st.sku ? 2 : outside(r) ? 1 : 0);
    for (const r of list.slice().sort((a, b) => rank(a) - rank(b))) {
      const active = !st.wh || r.wh === st.wh, on = r.sku === st.sku;
      svg.appendChild(svgEl("circle", { cx: x(r.a), cy: y(r.f), r: on ? 6.5 : 4.5, fill: colorOf(r), stroke: on ? "var(--fg)" : "var(--panel)", "stroke-width": on ? 2 : 1.5, opacity: active ? 1 : 0.18 }));
      pts.push({ r, cx: x(r.a), cy: y(r.f), active });
    }
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const nearest = (ev) => {
      const rr = svg.getBoundingClientRect(), s = rr.width / W;
      const sx = (ev.clientX - rr.left) / s, sy = (ev.clientY - rr.top) / s;
      let best = null, bd = 16 * 16;
      for (const p of pts) {
        if (!p.active) continue;
        const d = (p.cx - sx) ** 2 + (p.cy - sy) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    hit.addEventListener("pointermove", (ev) => {
      const p = nearest(ev);
      hit.style.cursor = p ? "pointer" : "default";
      if (!p) return U.hideTip(box);
      const s = svg.getBoundingClientRect().width / W;
      U.showTip(box, p.cx * s, p.cy * s, short(p.r.sku) + " · " + p.r.wh, [
        { label: "Forecast", value: num(p.r.f) }, { label: "Actual", value: num(p.r.a) },
        { label: "Error", value: U.signedPct(err(p.r)), color: colorOf(p.r) },
      ], "Click to open this SKU");
    });
    hit.addEventListener("pointerleave", () => U.hideTip(box));
    hit.addEventListener("click", (ev) => { const p = nearest(ev); if (p) { U.hideTip(box); pickSku(p.r.sku); } });
  }

  // ---------- SKU profile ----------
  function renderSkuSelect() {
    const sel = $("#sku-pick");
    if (!sel.options.length) {
      const groups = {};
      D.skus.forEach(([code, name, brand]) => (groups[brand] = groups[brand] || []).push(new Option(code + " · " + name, code)));
      for (const b of Object.keys(groups)) { const og = document.createElement("optgroup"); og.label = b; groups[b].forEach((o) => og.appendChild(o)); sel.appendChild(og); }
    }
    if (!st.sku) st.sku = rows(U.state.month).slice().sort((a, b) => Math.abs(b.f - b.a) - Math.abs(a.f - a.a))[0].sku;
    sel.value = st.sku;
  }

  function historyChart(code) {
    const am = D.allMonths;
    const act = am.map((k, i) => WH.reduce((s, w) => s + (FC.hist[code + "|" + w] || [])[i], 0));
    const fc = am.map((k) => { const l = rows(k).filter((r) => r.sku === code); return l.length ? metrics(l).F : null; });
    const W = Math.max(280, $("#sku-profile-body").clientWidth || 420), H = 140, m = { t: 12, r: 8, b: 20, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const ticks = U.niceTicks(Math.max(...act, ...fc.filter(isNum)) * 1.1, 3);
    const yMax = ticks[ticks.length - 1];
    const x = (i) => m.l + (i + 0.5) * (iw / am.length), y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Actual and forecast units over time for " + code });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 6, y: y(t) + 4, "text-anchor": "end" }, U.axisNum(t)));
    }
    const narrow = iw / am.length < 34;
    am.forEach((k, i) => svg.appendChild(svgEl("text", { x: x(i), y: H - 4, "text-anchor": "middle", class: k === U.state.month ? "lbl-strong" : "" }, narrow ? U.monthShort(k)[0] : U.monthShort(k))));
    am.forEach((k, i) => {   // year divider
      if (!i || k.slice(0, 4) === am[i - 1].slice(0, 4)) return;
      const x0 = m.l + i * (iw / am.length);
      svg.appendChild(svgEl("line", { x1: x0, x2: x0, y1: m.t, y2: m.t + ih, stroke: "var(--axis)", "stroke-dasharray": "3 3" }));
      svg.appendChild(svgEl("text", { x: x0 + 4, y: m.t + 8 }, k.slice(0, 4)));
    });
    const bw = Math.min(22, (iw / am.length) * 0.55);
    am.forEach((k, i) => {
      svg.appendChild(svgEl("path", { d: U.barPath(x(i) - bw / 2, x(i) + bw / 2, y(act[i]), y(0), 3), fill: "var(--one)", "fill-opacity": k === U.state.month ? 1 : FC.rows[k] ? 0.55 : 0.28 }));
      if (isNum(fc[i])) svg.appendChild(svgEl("rect", { x: x(i) - bw / 2 - 4, y: y(fc[i]) - 1.5, width: bw + 8, height: 3, rx: 1.5, fill: "var(--fg)" }));
    });
    const box = el("div", "chart");
    box.appendChild(svg);
    return box;
  }

  function skuNote(code) {
    const m = U.state.month, i = D.allMonths.indexOf(m);
    const tot = (j) => WH.reduce((s, w) => s + FC.hist[code + "|" + w][j], 0);
    const avg3 = (tot(i - 1) + tot(i - 2) + tot(i - 3)) / 3;
    const now = tot(i), mt = metrics(rows(m).filter((r) => r.sku === code));
    if (LAUNCH[code]) {
      const li = D.allMonths.indexOf(LAUNCH[code]);
      if (i < li) return "A new product that launches in " + U.monthName(LAUNCH[code]) + ", so there is nothing to forecast yet.";
      if (i - li < 3) return "New product, launched in " + U.monthName(LAUNCH[code]) + ". The 3-month average counts the months before the launch as zero, so the forecast trails far behind real demand (" + U.signedPct(mt.bias) + " this month). For the first three months a launch plan, based on a similar product, should replace the moving average.";
    }
    if (SKU[code].status === "Phase-out")
      return "Being phased out: demand drops month after month, so a 3-month average keeps forecasting too high (" + U.signedPct(mt.bias) + " this month). The remaining stock should be sold through rather than topped up.";
    for (const w of WH) {
      const h = FC.hist[code + "|" + w];
      const before = (h[i - 2] + h[i - 3]) / 2;
      if (before > 20 && h[i - 1] < before * 0.45)
        return "Sales in " + w + " last month were only " + num(h[i - 1]) + " units, far below the usual " + num(Math.round(before)) + ". That pattern points to a stock-out: demand did not disappear, it just was not recorded. Stock-out months should be corrected before they feed the forecast.";
      if (before > 20 && h[i] < before * 0.45)
        return "Sales in " + w + " this month were only " + num(h[i]) + " units against the usual " + num(Math.round(before)) + ". Probably a stock-out, which makes the forecast look far too high.";
    }
    if (now > avg3 * 1.3) return "Actual sales this month were " + fmt(now / avg3, 1) + "× the average of the previous three months. A moving average always reacts late to spikes such as viral content or affiliate pushes, so marketing should flag them ahead of time.";
    if (mt.bias > 0.15) return "The forecast ran " + U.signedPct(mt.bias) + " above actual. The 3-month history still carries a busy month while demand has already dropped, so stock may pile up.";
    if (mt.bias < -0.15) return "The forecast ran " + U.signedPct(mt.bias) + " below actual. Demand has been rising for several months and a 3-month average keeps lagging behind. A trend factor would help.";
    return "Demand is fairly steady, so a 3-month average works for this SKU: " + pct(mt.acc) + " accurate across all warehouses.";
  }

  function renderProfile() {
    const code = st.sku, s = SKU[code], m = U.state.month;
    const body = $("#sku-profile-body");
    body.replaceChildren();
    const list = rows(m).filter((r) => r.sku === code), mt = metrics(list);
    const head = el("div", "profile-head");
    const left = el("div");
    left.append(el("h3", null, s.name));
    const meta = el("div", "profile-meta");
    meta.append(el("span", null, s.brand + " · " + s.cat));
    if (CHIP[s.status]) meta.appendChild(statusChip(code));
    const mb = el("span"); mb.append("units per carton ", el("b", null, num(s.box))); meta.appendChild(mb);
    left.appendChild(meta);
    const score = el("div", "profile-score");
    score.append(el("div", "score-num", pct(mt.acc, 0)), el("small", null, month(m) + " accuracy"));
    head.append(left, score);
    body.appendChild(head);
    body.appendChild(historyChart(code));
    const tbx = el("div", "table-box flat");
    const t = el("table", "mini-table");
    const hr = el("tr");
    ["Warehouse", "Forecast", "Actual", "Error"].forEach((h, i) => hr.appendChild(el("th", i ? "r" : null, h)));
    const th = el("thead"); th.appendChild(hr);
    const tb = el("tbody");
    for (const w of WH) {
      const r = list.find((x) => x.wh === w);
      const tr = el("tr");
      tr.appendChild(el("td", null, w));
      if (!r) { const td = el("td", "r", "not sold"); td.colSpan = 3; td.style.color = "var(--muted)"; tr.appendChild(td); tb.appendChild(tr); continue; }
      const e = err(r);
      const d = el("td", "r", U.signedPct(e, 0));
      d.style.fontWeight = "700";
      if (Math.abs(e) > TOL) d.style.color = e > 0 ? "var(--over)" : "var(--under)";
      tr.append(el("td", "r", num(r.f)), el("td", "r", num(r.a)), d);
      tb.appendChild(tr);
    }
    t.append(th, tb);
    tbx.appendChild(t);
    body.appendChild(tbx);
    const c = el("div", "callout");
    c.append(el("h4", null, "Note"), el("p", null, skuNote(code)));
    body.appendChild(c);
  }

  function pickSku(code) {
    st.sku = code;
    $("#sku-pick").value = code;
    renderProfile();
    drawScatter();
    renderHeat();
  }

  // ---------- SKU x warehouse heat table ----------
  function renderHeat() {
    const m = U.state.month, list = rows(m);
    const sel = $("#heat-wh");
    if (!sel.options.length) sel.append(new Option("All warehouses", ""), ...WH.map((w) => new Option(w, w)));
    sel.value = st.wh;
    const by = {};
    for (const r of list) (by[r.sku] = by[r.sku] || {})[r.wh] = r;
    let skus = Object.keys(by).map((code) => {
      const cells = by[code];
      const scope = st.wh ? [cells[st.wh]].filter(Boolean) : Object.values(cells);
      return { code, cells, mt: metrics(scope), total: metrics(Object.values(cells)) };
    }).filter((x) => x.mt.A > 0 || x.mt.F > 0);
    if (st.sort === "err") skus.sort((a, b) => Math.abs(b.mt.F - b.mt.A) / Math.max(1, b.mt.A) - Math.abs(a.mt.F - a.mt.A) / Math.max(1, a.mt.A));
    else if (st.sort === "vol") skus.sort((a, b) => b.mt.A - a.mt.A);
    else skus.sort((a, b) => a.code.localeCompare(b.code));
    const scoped = list.filter((r) => !st.wh || r.wh === st.wh);
    $("#heat-count").textContent = scoped.filter(outside).length + " of " + scoped.length + " pairs outside tolerance";
    const thead = $("#table-heat thead"), tbody = $("#table-heat tbody");
    thead.replaceChildren(); tbody.replaceChildren();
    const hr = el("tr");
    hr.appendChild(el("th", null, "SKU"));
    [...WH, "All warehouses"].forEach((w) => { const th = el("th", null, w); if (st.wh === w) th.style.color = "var(--fg)"; hr.appendChild(th); });
    thead.appendChild(hr);
    const cell = (r) => {
      if (!r || (!r.a && !r.f)) return el("td", "err na", "–");
      const e = err(r);
      const td = el("td", "err");
      const h = Math.round(Math.min(1, Math.abs(e) / 0.6) * 72);
      td.style.setProperty("--hue", e > 0 ? "var(--over)" : "var(--under)");
      td.style.setProperty("--h", h + "%");
      if (h >= 45) td.classList.add("strong");
      td.append(U.signedPct(e, 0), el("small", null, num(r.f) + " / " + num(r.a)));
      td.title = "Forecast " + num(r.f) + ", actual " + num(r.a);
      return td;
    };
    for (const x of skus) {
      const tr = el("tr", "click-row" + (st.sku === x.code ? " sel" : ""));
      tr.tabIndex = 0;
      tr.appendChild(skuCell(x.code));
      for (const w of WH) {
        const td = cell(x.cells[w]);
        if (st.wh && w !== st.wh) td.style.opacity = 0.35;
        tr.appendChild(td);
      }
      tr.appendChild(cell({ f: x.total.F, a: x.total.A }));
      const go = () => { pickSku(x.code); $("#sku-profile").scrollIntoView({ behavior: U.reduceMotion ? "auto" : "smooth", block: "nearest" }); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      tbody.appendChild(tr);
    }
    const foot = el("tr");
    const fn = el("td"); fn.appendChild(el("span", "t-name", "Total"));
    foot.appendChild(fn);
    for (const w of WH) { const mt = metrics(list.filter((r) => r.wh === w)); foot.appendChild(cell({ f: mt.F, a: mt.A })); }
    const mt = metrics(list); foot.appendChild(cell({ f: mt.F, a: mt.A }));
    tbody.appendChild(foot);
  }

  // ---------- stock cover: stock on hand / daily run rate = days of inventory ----------
  const SB = (D.stock && D.stock.bands) || [14, 60];
  const BANDS = [
    { k: "out", label: "Out of stock", hint: "0 days", color: "var(--s-out)", test: (d) => d < 1 },
    { k: "risk", label: "At risk", hint: "under " + SB[0] + " days", color: "var(--s-risk)", test: (d) => d >= 1 && d < SB[0] },
    { k: "ok", label: "Healthy", hint: SB[0] + "–" + SB[1] + " days", color: "var(--s-ok)", test: (d) => d >= SB[0] && d <= SB[1] },
    { k: "over", label: "Overstock", hint: "over " + SB[1] + " days", color: "var(--s-over)", test: (d) => d > SB[1] },
  ];
  const bandOf = (d) => BANDS.find((b) => b.test(d));
  const daysIn = (m) => D.sell[m].daily.length;
  function stockRows(m) {
    const i = D.allMonths.indexOf(m), n = daysIn(m);
    return ((D.stock && D.stock.rows[m]) || []).map(([sku, wh, soh]) => {
      const rr = (FC.hist[sku + "|" + wh] || [])[i] / n;
      return { sku, wh, soh, rr, doi: rr > 0 ? soh / rr : Infinity };
    });
  }
  const cover = (list) => { const s = list.reduce((a, r) => a + r.soh, 0), rr = list.reduce((a, r) => a + r.rr, 0); return rr ? s / rr : null; };
  const days = (d) => (d < 1 ? "0 days" : fmt(d, 0) + " days");
  function runsOut(m, doi) {
    if (doi < 1) return null;
    if (doi > 365) return "over a year";
    const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, daysIn(m)) + Math.round(doi) * 864e5);
    return d.getUTCDate() + " " + U.MON3[d.getUTCMonth()] + (d.getUTCFullYear() !== +m.slice(0, 4) ? " " + d.getUTCFullYear() : "");
  }

  function renderStock() {
    const m = U.state.month, all = stockRows(m);
    if (!all.length) { $("#stock").hidden = true; return; }
    $("#stock-sub").textContent = "Stock on hand on " + daysIn(m) + " " + month(m) + " ÷ units sold per day in " + month(m) + " = days of inventory (DOI). Under " + SB[0] + " days needs a shipment now; over " + SB[1] + " days ties up cash and risks expiry.";
    const scoped = all.filter((r) => !st.stockWh || r.wh === st.stockWh);

    const strip = $("#band-strip");
    strip.replaceChildren();
    for (const b of BANDS) {
      const list = scoped.filter((r) => b.test(r.doi));
      const btn = el("button", "band-btn");
      btn.type = "button";
      btn.style.setProperty("--c", b.color);
      btn.setAttribute("aria-pressed", st.band === b.k ? "true" : "false");
      const name = el("span", "b-name", b.label); name.appendChild(el("small", null, b.hint));
      const val = el("span", "b-val", num(list.length)); val.appendChild(el("small", null, list.length === 1 ? "pair" : "pairs"));
      const oh = list.reduce((a, r) => a + r.soh, 0);
      btn.append(name, val, el("span", "b-sub", num(oh) + (oh === 1 ? " unit" : " units") + " on hand"));
      btn.addEventListener("click", () => { st.band = st.band === b.k ? "" : b.k; renderStock(); });
      strip.appendChild(btn);
    }

    const box = $("#doi-wh");
    box.replaceChildren();
    for (const w of ["", ...WH]) {
      const list = all.filter((r) => !w || r.wh === w);
      const row = el("button", "doi-row" + (w ? "" : " all") + (st.stockWh === w ? " sel" : ""));
      row.type = "button";
      const val = el("span", "doi-val", fmt(cover(list), 0)); val.appendChild(el("small", null, "days"));
      const stack = el("span", "stack");
      const counts = BANDS.map((b) => list.filter((r) => b.test(r.doi)).length);
      BANDS.forEach((b, j) => {
        if (!counts[j]) return;
        const seg = el("span");
        seg.style.flex = counts[j] + " 1 0";
        seg.style.background = b.color;
        seg.title = b.label + ": " + counts[j];
        stack.appendChild(seg);
      });
      const low = counts[0] + counts[1];
      row.append(el("span", "doi-name", w || "All warehouses"), val, stack,
        el("span", "doi-sub", new Set(list.map((r) => r.sku)).size + " SKUs · " + (low ? low + " under " + SB[0] + " days" : "none under " + SB[0] + " days") + (counts[3] ? " · " + counts[3] + " over " + SB[1] : "")));
      row.addEventListener("click", () => { st.stockWh = w; $("#stock-wh").value = w; renderStock(); });
      box.appendChild(row);
    }

    // stock by product status
    const t = $("#table-status");
    t.replaceChildren();
    const hr = el("tr");
    ["Status", "SKUs", "On hand", "Share of stock", "Share of sales", "Cover"].forEach((h, i) => hr.appendChild(el("th", i ? "r" + (i === 4 || i === 3 ? " opt" : "") : null, h)));
    const thd = el("thead"); thd.appendChild(hr);
    const tb = el("tbody");
    const SOH = scoped.reduce((a, r) => a + r.soh, 0), RR = scoped.reduce((a, r) => a + r.rr, 0);
    const byStatus = {};
    for (const s of STATUSES) {
      const list = scoped.filter((r) => SKU[r.sku].status === s);
      byStatus[s] = { list, soh: list.reduce((a, r) => a + r.soh, 0), rr: list.reduce((a, r) => a + r.rr, 0) };
      const tr = el("tr");
      const c = el("td");
      if (CHIP[s]) c.appendChild(el("span", "st-chip " + CHIP[s], s)); else c.textContent = s;
      if (CHIP[s]) c.firstChild.style.marginLeft = "0";
      if (!list.length) {
        const td = el("td", "r", s === "New" && Object.keys(LAUNCH).length ? "launches in " + month(Object.values(LAUNCH)[0]) : "–");
        td.colSpan = 5; td.style.color = "var(--muted)";
        tr.append(c, td); tb.appendChild(tr); continue;
      }
      const cv = cover(list), cvTd = el("td", "r"); cvTd.appendChild(el("b", null, days(cv)));
      cvTd.style.color = bandOf(cv).k === "ok" ? "" : bandOf(cv).color;
      tr.append(c, el("td", "r", num(new Set(list.map((r) => r.sku)).size)), el("td", "r", num(byStatus[s].soh)),
        el("td", "r opt", pct(byStatus[s].soh / SOH, 0)), el("td", "r opt", pct(byStatus[s].rr / RR, 0)), cvTd);
      tb.appendChild(tr);
    }
    t.append(thd, tb);
    const slow = ["Slow moving", "Phase-out"].map((s) => byStatus[s]);
    const sSoh = slow[0].soh + slow[1].soh, sRr = slow[0].rr + slow[1].rr;
    const note = $("#status-note");
    note.replaceChildren(el("h4", null, "Note"));
    const p = el("p");
    if (sSoh) {
      p.append("Slow movers and phase-outs hold ", el("b", null, pct(sSoh / SOH, 0) + " of the stock"), " but bring only ", el("b", null, pct(sRr / RR, 0) + " of daily sales"),
        ", enough for " + days(sSoh / sRr) + ". Stop topping up the phase-out and move the slow movers through bundles or campaign vouchers.");
    }
    const nw = byStatus.New;
    if (nw.list.length) {
      const code = nw.list[0].sku, li = D.allMonths.indexOf(LAUNCH[code]), mi = D.allMonths.indexOf(m);
      p.append(" The new " + short(code) + (mi === li ? " went out with launch stock for " : " has stock for ") + days(cover(nw.list)) + ".");
    }
    note.appendChild(p);
    drawRisk();

    // detail table
    const wsel = $("#stock-wh");
    if (!wsel.options.length) wsel.append(new Option("All warehouses", ""), ...WH.map((w) => new Option(w, w)));
    wsel.value = st.stockWh;
    const ssel = $("#stock-status");
    if (!ssel.options.length) ssel.append(new Option("All statuses", ""), ...STATUSES.map((s) => new Option(s, s)));
    ssel.value = st.status;
    let list = scoped.filter((r) => (!st.band || bandOf(r.doi).k === st.band) && (!st.status || SKU[r.sku].status === st.status));
    if (st.stockSort === "doi") list.sort((a, b) => a.doi - b.doi);
    else if (st.stockSort === "doi-desc") list.sort((a, b) => b.doi - a.doi);
    else list.sort((a, b) => b.soh - a.soh);
    $("#stock-count").textContent = list.length + " of " + all.length + " SKU × warehouse pairs";
    const body = $("#table-stock tbody");
    body.replaceChildren();
    if (!list.length) return U.emptyRow(body, 5, "No SKU in this selection.");
    const MAXD = 120;
    for (const r of list) {
      const b = bandOf(r.doi);
      const tr = el("tr", "click-row");
      tr.tabIndex = 0;
      tr.appendChild(skuCell(r.sku, SKU[r.sku].brand + " · " + r.wh));
      const d = el("td", "barcell doi-cell");
      const bar = U.bar(Math.min(r.doi, MAXD) / MAXD, b.color, days(r.doi));
      bar.classList.add("doi");
      bar.title = b.label + " (" + b.hint + ")";
      d.appendChild(bar);
      const ro = runsOut(m, r.doi);
      const roTd = el("td", "r" + (ro ? "" : " out"), ro || "out of stock");
      tr.append(el("td", "r opt", num(r.soh)), el("td", "r opt", fmt(r.rr, r.rr < 10 ? 1 : 0)), d, roTd);
      const go = () => { pickSku(r.sku); $("#sku-profile").scrollIntoView({ behavior: U.reduceMotion ? "auto" : "smooth", block: "nearest" }); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      body.appendChild(tr);
    }
  }

  // pairs under the risk threshold in every month: is the network getting tighter?
  function drawRisk() {
    const box = $("#chart-risk");
    const W = box.clientWidth;
    if (!W) return;
    $("#risk-title").textContent = "SKU × warehouse pairs under " + SB[0] + " days, by month" + (st.stockWh ? " (" + st.stockWh + ")" : "");
    const ms = D.months.map((k) => {
      const l = stockRows(k).filter((r) => !st.stockWh || r.wh === st.stockWh);
      return { k, out: l.filter((r) => r.doi < 1).length, risk: l.filter((r) => r.doi >= 1 && r.doi < SB[0]).length };
    });
    const H = 120, m = { t: 18, r: 4, b: 22, l: 4 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, band = iw / ms.length, bw = Math.min(30, band * 0.55);
    const max = Math.max(4, ...ms.map((x) => x.out + x.risk));
    const y = (v) => m.t + ih - (v / max) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Number of SKU and warehouse pairs with less than " + SB[0] + " days of stock, per month" });
    svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(0), y2: y(0), stroke: "var(--axis)" }));
    const gs = ms.map((x, i) => {
      const cx = m.l + (i + 0.5) * band, sel = x.k === U.state.month;
      const g = svgEl("g", { opacity: sel ? 1 : 0.5 });
      if (x.risk) g.appendChild(svgEl("path", { d: U.barPath(cx - bw / 2, cx + bw / 2, y(x.risk), y(0), x.out ? 0 : 3), fill: "var(--s-risk)" }));
      if (x.out) g.appendChild(svgEl("path", { d: U.barPath(cx - bw / 2, cx + bw / 2, y(x.risk + x.out), y(x.risk) - (x.risk ? 1.5 : 0), 3), fill: "var(--s-out)" }));
      svg.appendChild(g);
      svg.appendChild(svgEl("text", { x: cx, y: y(x.out + x.risk) - 5, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, String(x.out + x.risk)));
      svg.appendChild(svgEl("text", { x: cx, y: H - 5, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, U.monthShort(x.k)));
      return { cx, x };
    });
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih + m.b, fill: "transparent", style: "cursor:pointer" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const at = (ev) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(ms.length - 1, Math.floor((((ev.clientX - r.left) / r.width) * W - m.l) / band))); };
    hit.addEventListener("pointermove", (ev) => {
      const i = at(ev), s = svg.getBoundingClientRect().width / W, x = gs[i].x;
      U.showTip(box, gs[i].cx * s, y(x.out + x.risk) * s, U.monthName(x.k), [
        { label: "Out of stock", value: num(x.out), color: "var(--s-out)" }, { label: "Under " + SB[0] + " days", value: num(x.risk), color: "var(--s-risk)" },
      ], x.k === U.state.month ? null : "Click to select this month");
    });
    hit.addEventListener("pointerleave", () => U.hideTip(box));
    hit.addEventListener("click", (ev) => { const k = ms[at(ev)].k; if (k !== U.state.month) { U.hideTip(box); U.setMonth(k); } });
  }

  // ---------- shipment plan ----------
  function renderPlan() {
    $("#plan-title").textContent = "Shipment plan, " + nextName;
    const am = D.allMonths, l3 = am.slice(-3);
    $("#plan-sub").textContent = month(D.next) + " forecast from " + month(l3[0]) + "–" + month(l3[2]) + " sales, plus " + fmt(FC.buffer * 100, 0) + "% safety stock, rounded up to full cartons";
    const strip = $("#wh-strip");
    strip.replaceChildren();
    for (const w of WH) {
      const items = FC.plan.filter((r) => r[1] === w);
      const b = el("button", "wh-btn");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", st.planWh === w ? "true" : "false");
      const val = el("span", "wh-val", num(items.reduce((a, r) => a + r[3], 0)));
      val.appendChild(el("small", null, "cartons"));
      b.append(el("span", "wh-name", w + " warehouse"), val, el("span", "wh-sub", num(items.reduce((a, r) => a + r[2], 0)) + " units · " + items.length + " SKUs"));
      b.addEventListener("click", () => { st.planWh = w; renderPlan(); });
      strip.appendChild(b);
    }
    const n = D.allMonths.length;
    const tb = $("#table-plan tbody");
    tb.replaceChildren();
    const list = FC.plan.filter((r) => r[1] === st.planWh).sort((a, b) => b[3] - a[3]);
    if (!list.length) return U.emptyRow(tb, 6, "No shipment planned for this warehouse.");
    for (const [code, , f, cartons] of list) {
      const h = FC.hist[code + "|" + st.planWh];
      const avg = (h[n - 1] + h[n - 2] + h[n - 3]) / 3;
      const tr = el("tr");
      tr.append(skuCell(code), el("td", "r opt", num(Math.round(avg))), el("td", "r", num(f)), el("td", "r opt", num(Math.ceil(f * (1 + FC.buffer)))), el("td", "r opt", num(SKU[code].box)));
      const k = el("td", "r"); k.appendChild(el("b", null, num(cartons)));
      tr.appendChild(k);
      tb.appendChild(tr);
    }
  }

  // ---------- pipeline ----------
  function renderFlow() {
    const m = U.state.month, s = D.sell[m].stat, p = FC.pipe[m];
    $("#flow-sub").textContent = "Figures for " + U.monthName(m);
    const valid = s.raw_lines - s.cancelled - s.returned;
    const last = m === D.months[D.months.length - 1];
    const steps = [
      ["Order export", num(s.raw_lines) + " lines", num(s.raw_orders) + " orders from " + D.stores.length + " stores on " + D.platforms.length + " platforms"],
      ["Drop cancelled & returned", num(valid) + " lines", "−" + num(s.cancelled) + " cancelled, −" + num(s.returned) + " returned"],
      ["Map stores to warehouses", D.stores.length + " → " + WH.length, "each store ships from its own warehouse"],
      ["Explode bundles & multipacks", num(p.sku_units) + " units", num(p.pack_lines) + " pack lines · " + num(p.item_units) + " sellable units become " + num(p.sku_units) + " SKU units"],
      ["Pivot SKU × warehouse", D.skus.length + " × " + WH.length, "physical units per SKU, warehouse and month"],
      ["Forecast & cartons", last ? num(FC.plan.reduce((a, r) => a + r[3], 0)) + " cartons" : pct(metrics(rows(m)).acc, 0) + " accurate",
        last ? month(D.next) + " shipment plan" : month(m) + " forecast tested against actuals"],
    ];
    const ol = $("#flow");
    ol.replaceChildren();
    for (const [t, v, n] of steps) {
      const li = el("li");
      li.append(el("span", "f-title", t), el("span", "f-num", v), el("span", "f-note", n));
      ol.appendChild(li);
    }
  }

  function renderConvert() {
    const t = $("#table-convert");
    if (t.childNodes.length) return;
    const hr = el("tr"); hr.append(el("th", null, "Sellable item"), el("th", null, "Physical SKUs leaving the warehouse"));
    const th = el("thead"); th.appendChild(hr);
    const tb = el("tbody");
    const list = D.items.filter((it) => it.comp.length > 1 || it.comp[0][1] > 1).sort((a, b) => b.comp.length - a.comp.length).slice(0, 7);
    for (const it of list) {
      const tr = el("tr");
      const a = el("td"); a.append(el("span", "code", it.code), el("span", "t-sub", it.name));
      const b = el("td");
      it.comp.forEach(([code, q], i) => {
        const line = el("div");
        line.append(el("b", null, q + "× "), el("span", "code", code), document.createTextNode(" " + short(code)));
        if (i) line.style.marginTop = "3px";
        b.appendChild(line);
      });
      tr.append(a, b);
      tb.appendChild(tr);
    }
    t.append(th, tb);
  }

  function renderMethod() {
    const box = $("#method");
    if (box.childNodes.length) return;
    box.appendChild(el("div", "formula", "Forecast(M) = 0.5 × Actual(M−1) + 0.3 × Actual(M−2) + 0.2 × Actual(M−3)"));
    const dl = el("dl");
    const add = (k, v) => dl.append(el("dt", null, k), el("dd", null, v));
    add("Accuracy", "1 − Σ|forecast − actual| ÷ Σ actual (WAPE). Fast sellers weigh more.");
    add("Bias", "(Σ forecast − Σ actual) ÷ Σ actual. Negative means the forecast was too low.");
    add("Tolerance", "Errors beyond ±" + fmt(TOL * 100, 0) + "% count as a miss.");
    add("Cartons", "⌈forecast × " + fmt(1 + FC.buffer, 2) + " ÷ units per carton⌉");
    box.appendChild(dl);
    box.appendChild(el("p", null, "A weighted moving average is easy to explain to the warehouse team and works well for steady SKUs. Its weak spots show in months with a rising trend, viral content and stock-outs. Next steps: add a trend factor and the campaign calendar, and correct stock-out months before they enter the average."));
  }

  function redraw() { drawNetMap(); drawMonthly(); drawScatter(); renderProfile(); drawRisk(); }
  function renderAll() {
    renderLede(); renderKpis(); renderNetList(); renderWhTable(); renderSkuSelect(); renderProfile(); renderHeat(); renderStock(); renderPlan(); renderFlow(); renderConvert(); renderMethod();
    redraw();
  }

  $("#sku-pick").addEventListener("change", (e) => pickSku(e.target.value));
  $("#heat-wh").addEventListener("change", (e) => { st.wh = e.target.value; renderWhTable(); renderHeat(); drawScatter(); renderNetList(); drawNetMap(); });
  $("#heat-sort").addEventListener("change", (e) => { st.sort = e.target.value; renderHeat(); });
  $("#stock-wh").addEventListener("change", (e) => { st.stockWh = e.target.value; renderStock(); });
  $("#stock-status").addEventListener("change", (e) => { st.status = e.target.value; renderStock(); });
  $("#stock-sort").addEventListener("change", (e) => { st.stockSort = e.target.value; renderStock(); });

  U.onMonth(() => renderAll());
  window.FORECAST_PAGE = { render: renderAll, redraw };
})();
