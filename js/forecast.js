/* Page 02: Forecast & stok gudang. */
(function () {
  "use strict";
  const U = window.U, D = window.DASH;
  const { el, svgEl, rp, num, pct, idn, delta, isNum } = U;
  const $ = (s) => document.querySelector(s);
  if (!D || !D.fc) {
    $("#fc-lede").replaceWith(Object.assign(document.createElement("div"), { className: "error", textContent: "Data forecast belum termuat. Coba muat ulang halaman ini." }));
    return;
  }
  const FC = D.fc, TOL = FC.tolerance, WH = D.warehouses;
  const SKU = {};
  D.skus.forEach(([code, name, brand, cat, box]) => (SKU[code] = { code, name, brand, cat, box }));
  const ITEM = {}; D.items.forEach((it) => (ITEM[it.code] = it));
  const st = { wh: "", sort: "err", sku: null, planWh: WH[0] };

  // ---------- metrics ----------
  const rows = (m) => (FC.rows[m] || []).map(([sku, wh, f, a]) => ({ sku, wh, f, a }));
  function metrics(list) {
    let A = 0, F = 0, E = 0;
    for (const r of list) { A += r.a; F += r.f; E += Math.abs(r.f - r.a); }
    return { A, F, acc: A ? 1 - E / A : null, bias: A ? (F - A) / A : null };
  }
  const err = (r) => (r.a > 0 ? (r.f - r.a) / r.a : r.f > 0 ? 1 : 0);
  const outside = (r) => Math.abs(err(r)) > TOL;
  const short = (code) => SKU[code].name.replace(/ isi \d+$/, "").replace(/ Daya Tahan Tubuh/, "");
  const prevInShow = (m) => { const i = D.months.indexOf(m); return i > 0 ? D.months[i - 1] : null; };
  const bulan = (m) => U.BULAN[U.monthNo(m) - 1];
  const nextName = U.monthName(D.next);

  // ---------- lede & KPIs ----------
  function renderLede() {
    const m = U.state.month, list = rows(m), t = metrics(list);
    const lede = $("#fc-lede");
    lede.replaceChildren();
    const add = (txt, bold) => lede.appendChild(bold ? el("b", null, txt) : document.createTextNode(txt));
    add("Forecast " + U.monthName(m) + " mencapai akurasi ");
    add(pct(t.acc), true);
    add(" dengan bias ");
    add(U.signedPct(t.bias), true);
    add(t.bias < -0.03 ? ": forecast cenderung di bawah penjualan, wajar karena rata-rata 3 bulan tertinggal saat penjualan sedang naik. "
      : t.bias > 0.03 ? ": forecast cenderung di atas penjualan, jadi ada risiko stok menumpuk. " : ": forecast dan penjualan seimbang. ");
    const byWh = WH.map((w) => ({ w, ...metrics(list.filter((r) => r.wh === w)) })).sort((a, b) => a.acc - b.acc);
    add("Gudang paling meleset: ");
    add(byWh[0].w + " (" + pct(byWh[0].acc, 0) + ")", true);
    const worst = list.slice().sort((a, b) => Math.abs(b.f - b.a) - Math.abs(a.f - a.a))[0];
    if (worst) {
      add(". Selisih unit terbesar ada di ");
      add(short(worst.sku) + ", " + worst.wh, true);
      add(" (forecast " + num(worst.f) + ", aktual " + num(worst.a) + ").");
    }
  }

  function renderKpis() {
    const m = U.state.month, list = rows(m), t = metrics(list);
    const pm = prevInShow(m), pt = pm && metrics(rows(pm));
    const box = $("#fc-kpis");
    box.replaceChildren();
    const accSub = pt ? U.sub([delta((t.acc - pt.acc) * 100, { points: true }), " dari " + bulan(pm)]) : U.sub(["bulan pertama yang diuji"]);
    box.appendChild(U.kpi("Akurasi forecast", pct(t.acc), accSub, { meter: t.acc }));
    box.appendChild(U.kpi("Bias", U.signedPct(t.bias), U.sub([t.bias < 0 ? "forecast di bawah aktual" : "forecast di atas aktual"])));
    box.appendChild(U.kpi("Unit aktual (SKU fisik)", num(t.A), U.sub(["forecast ", el("b", null, num(t.F)), " unit"])));
    const out = list.filter(outside).length;
    box.appendChild(U.kpi("SKU × gudang meleset", num(out), U.sub(["dari ", el("b", null, num(list.length)), " kombinasi, toleransi ±" + idn(TOL * 100, 0) + "%"]), { unit: "kombinasi" }));
    const cartons = FC.plan.reduce((a, r) => a + r[3], 0);
    box.appendChild(U.kpi("Rencana kirim " + bulan(D.next), num(cartons), U.sub(["ke " + WH.length + " gudang, stok pengaman " + idn(FC.buffer * 100, 0) + "%"]), { unit: "karton" }));
  }

  // ---------- monthly forecast vs actual ----------
  function drawMonthly() {
    const box = $("#chart-fc-bulan");
    const W = box.clientWidth;
    if (!W) return;
    $("#fc-metode").textContent = "Forecast bulan M = 0,5 × aktual M−1 + 0,3 × M−2 + 0,2 × M−3";
    const narrow = W < 520;
    const H = narrow ? 250 : 280;
    const ms = D.months.map((k) => ({ k, ...metrics(rows(k)) }));
    const ticks = U.niceTicks(Math.max(...ms.map((x) => Math.max(x.A, x.F))) * 1.12, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 22, r: 6, b: 28, l: U.labelWidth(box, ticks.map(U.axisNum)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / ms.length, bw = Math.min(54, band * 0.5);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafik unit aktual dan forecast per bulan" });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisNum(t)));
    }
    const gs = ms.map((x, i) => {
      const cx = m.l + (i + 0.5) * band, sel = x.k === U.state.month;
      const g = svgEl("g", { opacity: sel ? 1 : 0.5 });
      g.appendChild(svgEl("path", { d: U.barPath(cx - bw / 2, cx + bw / 2, y(x.A), y(0)), fill: "var(--one)" }));
      g.appendChild(svgEl("rect", { x: cx - bw / 2 - 6, y: y(x.F) - 1.5, width: bw + 12, height: 3, rx: 1.5, fill: "var(--fg)" }));
      g.appendChild(svgEl("text", { x: cx, y: Math.min(y(x.A), y(x.F)) - 8, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, pct(x.acc, 0)));
      svg.appendChild(g);
      svg.appendChild(svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, U.monthShort(x.k)));
      return { g, sel, cx, x };
    });
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", style: "cursor:pointer" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const at = (ev) => { const r = svg.getBoundingClientRect(); const sx = ((ev.clientX - r.left) / r.width) * W; return Math.max(0, Math.min(ms.length - 1, Math.floor((sx - m.l) / band))); };
    hit.addEventListener("pointermove", (ev) => {
      const i = at(ev), x = ms[i];
      gs.forEach((g, j) => g.g.setAttribute("opacity", j === i || g.sel ? 1 : 0.5));
      const r = svg.getBoundingClientRect(), s = r.width / W;
      U.showTip(box, gs[i].cx * s, y(Math.max(x.A, x.F)) * s, U.monthName(x.k), [
        { label: "Aktual", value: num(x.A) + " unit", color: "var(--one)" },
        { label: "Forecast", value: num(x.F) + " unit", color: "var(--fg)" },
        { label: "Akurasi", value: pct(x.acc) },
        { label: "Bias", value: U.signedPct(x.bias) },
      ], x.k === U.state.month ? null : "Klik untuk memilih bulan ini");
    });
    hit.addEventListener("pointerleave", () => { gs.forEach((g) => g.g.setAttribute("opacity", g.sel ? 1 : 0.5)); U.hideTip(box); });
    hit.addEventListener("click", (ev) => { const k = ms[at(ev)].k; if (k !== U.state.month) { U.hideTip(box); U.setMonth(k); } });
  }

  // ---------- warehouse x month accuracy ----------
  function renderWhTable() {
    const t = $("#tabel-gudang");
    t.replaceChildren();
    const thead = el("thead"), hr = el("tr");
    hr.appendChild(el("th", null, "Gudang"));
    D.months.forEach((k) => { const th = el("th", null, U.monthShort(k)); if (k === U.state.month) th.style.color = "var(--fg)"; hr.appendChild(th); });
    thead.appendChild(hr);
    const tb = el("tbody");
    const lines = [{ w: "", label: "Semua gudang" }, ...WH.map((w) => ({ w, label: w }))];
    for (const L of lines) {
      const tr = el("tr", "click-row" + (st.wh === L.w ? " sel" : ""));
      tr.tabIndex = 0;
      tr.appendChild(el("td", "k", L.label));
      for (const k of D.months) {
        const mt = metrics(rows(k).filter((r) => !L.w || r.wh === L.w));
        const td = el("td", "heat" + (k === U.state.month ? " sel" : ""), pct(mt.acc, 0));
        td.style.setProperty("--h", Math.round(Math.max(0, Math.min(1, (0.95 - mt.acc) / 0.2)) * 60) + "%");
        td.title = L.label + ", " + U.monthName(k) + ": akurasi " + pct(mt.acc) + ", bias " + U.signedPct(mt.bias);
        tr.appendChild(td);
      }
      const go = () => { st.wh = L.w; $("#heat-gudang").value = L.w; renderWhTable(); renderHeat(); drawScatter(); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      tb.appendChild(tr);
    }
    t.append(thead, tb);
  }

  // ---------- scatter forecast vs actual ----------
  function drawScatter() {
    const box = $("#chart-fc-sebar");
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
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Sebaran forecast terhadap aktual per SKU dan gudang, skala logaritmik" });
    const clip = "fcclip";
    const defs = svgEl("defs"); const cp = svgEl("clipPath", { id: clip }); cp.appendChild(svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih })); defs.appendChild(cp); svg.appendChild(defs);
    for (const v of decades) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: "var(--grid)" }));
      svg.appendChild(svgEl("line", { x1: x(v), x2: x(v), y1: m.t, y2: m.t + ih, stroke: "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, U.axisNum(v)));
      svg.appendChild(svgEl("text", { x: x(v), y: m.t + ih + 16, "text-anchor": v === lo ? "start" : v === hi ? "end" : "middle" }, U.axisNum(v)));
    }
    // tolerance band: forecast within ±25% of actual
    const band = svgEl("polygon", { points: [[lo, lo * (1 - TOL)], [hi, hi * (1 - TOL)], [hi, hi * (1 + TOL)], [lo, lo * (1 + TOL)]].map(([a, f]) => x(a) + "," + y(f)).join(" "),
      fill: "var(--soft)", "clip-path": `url(#${clip})` });
    svg.appendChild(band);
    svg.appendChild(svgEl("line", { x1: x(lo), y1: y(lo), x2: x(hi), y2: y(hi), stroke: "var(--axis)", "stroke-width": 1.5 }));
    svg.appendChild(svgEl("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle" }, "Aktual (unit) →"));
    svg.appendChild(svgEl("text", { x: 0, y: 0, "text-anchor": "middle", transform: `translate(11 ${m.t + ih / 2}) rotate(-90)` }, "Forecast (unit) →"));
    const pts = [];
    const colorOf = (r) => { const e = err(r); return e > TOL ? "var(--over)" : e < -TOL ? "var(--under)" : "var(--axis)"; };
    // draw in-tolerance first so misses sit on top
    // selected SKU drawn last with an ink ring so it stays findable without hiding the rest
    const rank = (r) => (r.sku === st.sku ? 2 : outside(r) ? 1 : 0);
    const ordered = list.slice().sort((a, b) => rank(a) - rank(b));
    for (const r of ordered) {
      const active = !st.wh || r.wh === st.wh;
      const on = r.sku === st.sku;
      const c = svgEl("circle", { cx: x(r.a), cy: y(r.f), r: on ? 6.5 : 4.5, fill: colorOf(r), stroke: on ? "var(--fg)" : "var(--panel)", "stroke-width": on ? 2 : 1.5, opacity: active ? 1 : 0.18 });
      svg.appendChild(c);
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
        { label: "Forecast", value: num(p.r.f) },
        { label: "Aktual", value: num(p.r.a) },
        { label: "Selisih", value: U.signedPct(err(p.r)), color: colorOf(p.r) },
      ], "Klik untuk membuka profil SKU");
    });
    hit.addEventListener("pointerleave", () => U.hideTip(box));
    hit.addEventListener("click", (ev) => { const p = nearest(ev); if (p) { U.hideTip(box); pickSku(p.r.sku); } });
  }

  // ---------- SKU profile ----------
  function renderSkuSelect() {
    const sel = $("#sku-pilih");
    if (!sel.options.length) {
      const groups = {};
      D.skus.forEach(([code, name, brand]) => (groups[brand] = groups[brand] || []).push(new Option(code + " · " + name, code)));
      for (const b of Object.keys(groups)) { const og = document.createElement("optgroup"); og.label = b; groups[b].forEach((o) => og.appendChild(o)); sel.appendChild(og); }
    }
    if (!st.sku) {
      const list = rows(U.state.month);
      st.sku = list.slice().sort((a, b) => Math.abs(b.f - b.a) - Math.abs(a.f - a.a))[0].sku;
    }
    sel.value = st.sku;
  }

  function historyChart(code) {
    // total across warehouses: actual Feb..Sep, forecast for evaluated months
    const am = D.allMonths;
    const act = am.map((k, i) => WH.reduce((s, w) => s + (FC.hist[code + "|" + w] || [])[i], 0));
    const fc = am.map((k) => (FC.rows[k] ? metrics(rows(k).filter((r) => r.sku === code)).F : null));
    const W = Math.max(280, $("#sku-profile-body").clientWidth || 420), H = 140, m = { t: 12, r: 8, b: 20, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const ticks = U.niceTicks(Math.max(...act, ...fc.filter(isNum)) * 1.1, 3);
    const yMax = ticks[ticks.length - 1];
    const x = (i) => m.l + (i + 0.5) * (iw / am.length), y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Riwayat unit aktual dan forecast " + code });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 6, y: y(t) + 4, "text-anchor": "end" }, U.axisNum(t)));
    }
    am.forEach((k, i) => svg.appendChild(svgEl("text", { x: x(i), y: H - 4, "text-anchor": "middle", class: k === U.state.month ? "lbl-strong" : "" }, U.monthShort(k))));
    const bw = Math.min(22, (iw / am.length) * 0.55);
    am.forEach((k, i) => {
      const sel = k === U.state.month;
      svg.appendChild(svgEl("path", { d: U.barPath(x(i) - bw / 2, x(i) + bw / 2, y(act[i]), y(0), 3), fill: "var(--one)", "fill-opacity": sel ? 1 : FC.rows[k] ? 0.55 : 0.28 }));
      if (isNum(fc[i])) svg.appendChild(svgEl("rect", { x: x(i) - bw / 2 - 4, y: y(fc[i]) - 1.5, width: bw + 8, height: 3, rx: 1.5, fill: "var(--fg)" }));
    });
    const box = el("div", "chart");
    box.appendChild(svg);
    return box;
  }

  function skuNote(code) {
    const m = U.state.month, am = D.allMonths, i = am.indexOf(m);
    const tot = (j) => WH.reduce((s, w) => s + FC.hist[code + "|" + w][j], 0);
    const avg3 = (tot(i - 1) + tot(i - 2) + tot(i - 3)) / 3;
    const now = tot(i), mt = metrics(rows(m).filter((r) => r.sku === code));
    // a warehouse whose last month collapsed (stock-out) drags this month's forecast down
    for (const w of WH) {
      const h = FC.hist[code + "|" + w];
      const before = (h[i - 2] + h[i - 3]) / 2;
      if (before > 20 && h[i - 1] < before * 0.45) {
        return "Penjualan di " + w + " bulan lalu hanya " + num(h[i - 1]) + " unit, jauh di bawah biasanya (" + num(Math.round(before)) + "). Pola ini khas stok kosong: permintaan tidak hilang, hanya tidak tercatat. Bulan stok kosong sebaiknya dikoreksi dulu sebelum masuk forecast.";
      }
      if (before > 20 && h[i] < before * 0.45) {
        return "Penjualan di " + w + " bulan ini hanya " + num(h[i]) + " unit dari biasanya " + num(Math.round(before)) + ". Kemungkinan stok kosong, sehingga forecast terlihat jauh di atas aktual.";
      }
    }
    if (now > avg3 * 1.3) return "Aktual bulan ini " + idn(now / avg3, 1) + "× rata-rata 3 bulan sebelumnya. Rata-rata bergerak selalu terlambat menangkap lonjakan seperti konten viral atau program affiliate, jadi lonjakan perlu ditandai manual oleh tim marketing.";
    if (mt.bias > 0.15) return "Forecast " + U.signedPct(mt.bias) + " di atas aktual. Riwayat 3 bulan masih membawa angka bulan yang ramai, sementara permintaan sudah turun. Risiko stok menumpuk di gudang.";
    if (mt.bias < -0.15) return "Forecast " + U.signedPct(mt.bias) + " di bawah aktual. Permintaan naik terus beberapa bulan, sehingga rata-rata 3 bulan selalu tertinggal. Perlu faktor tren.";
    return "Permintaan relatif stabil, jadi rata-rata 3 bulan cukup untuk SKU ini. Akurasi " + pct(mt.acc) + " di semua gudang.";
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
    const mb = el("span"); mb.append("isi per karton ", el("b", null, num(s.box))); meta.appendChild(mb);
    left.appendChild(meta);
    const score = el("div", "profile-score");
    score.append(el("div", "score-num", pct(mt.acc, 0)), el("small", null, "akurasi " + bulan(m)));
    head.append(left, score);
    body.appendChild(head);
    body.appendChild(historyChart(code));
    const tbx = el("div", "table-box flat");
    const t = el("table", "mini-table");
    const hr = el("tr");
    ["Gudang", "Forecast", "Aktual", "Selisih"].forEach((h, i) => hr.appendChild(el("th", i ? "r" : null, h)));
    const th = el("thead"); th.appendChild(hr);
    const tb = el("tbody");
    for (const w of WH) {
      const r = list.find((x) => x.wh === w);
      const tr = el("tr");
      tr.appendChild(el("td", null, w));
      if (!r) { const td = el("td", "r", "tidak dijual"); td.colSpan = 3; td.style.color = "var(--muted)"; tr.appendChild(td); tb.appendChild(tr); continue; }
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
    c.append(el("h4", null, "Catatan"), el("p", null, skuNote(code)));
    body.appendChild(c);
  }

  function pickSku(code) {
    st.sku = code;
    $("#sku-pilih").value = code;
    renderProfile();
    drawScatter();
    renderHeat();
  }

  // ---------- SKU x warehouse heat table ----------
  function renderHeat() {
    const m = U.state.month, list = rows(m);
    const sel = $("#heat-gudang");
    if (!sel.options.length) sel.append(new Option("Semua gudang", ""), ...WH.map((w) => new Option(w, w)));
    sel.value = st.wh;
    const by = {};
    for (const r of list) (by[r.sku] = by[r.sku] || {})[r.wh] = r;
    let skus = Object.keys(by).map((code) => {
      const cells = by[code];
      const scope = st.wh ? [cells[st.wh]].filter(Boolean) : Object.values(cells);
      const mt = metrics(scope);
      return { code, cells, mt, total: metrics(Object.values(cells)) };
    }).filter((x) => x.mt.A > 0 || x.mt.F > 0);
    if (st.sort === "err") skus.sort((a, b) => Math.abs(b.mt.F - b.mt.A) / Math.max(1, b.mt.A) - Math.abs(a.mt.F - a.mt.A) / Math.max(1, a.mt.A));
    else if (st.sort === "vol") skus.sort((a, b) => b.mt.A - a.mt.A);
    else skus.sort((a, b) => a.code.localeCompare(b.code));
    const out = list.filter((r) => (!st.wh || r.wh === st.wh) && outside(r)).length;
    const all = list.filter((r) => !st.wh || r.wh === st.wh).length;
    $("#heat-count").textContent = out + " dari " + all + " kombinasi di luar toleransi";
    const thead = $("#tabel-heat thead"), tbody = $("#tabel-heat tbody");
    thead.replaceChildren(); tbody.replaceChildren();
    const hr = el("tr");
    hr.appendChild(el("th", null, "SKU"));
    [...WH, "Semua gudang"].forEach((w) => { const th = el("th", null, w); if (st.wh === w) th.style.color = "var(--fg)"; hr.appendChild(th); });
    thead.appendChild(hr);
    const cell = (r) => {
      if (!r || (!r.a && !r.f)) { return el("td", "err na", "–"); }
      const e = err(r);
      const td = el("td", "err");
      const h = Math.round(Math.min(1, Math.abs(e) / 0.6) * 72);
      td.style.setProperty("--hue", e > 0 ? "var(--over)" : "var(--under)");
      td.style.setProperty("--h", h + "%");
      if (h >= 45) td.classList.add("strong");
      td.append(U.signedPct(e, 0), el("small", null, num(r.f) + " / " + num(r.a)));
      td.title = "Forecast " + num(r.f) + ", aktual " + num(r.a);
      return td;
    };
    for (const x of skus) {
      const tr = el("tr", "click-row" + (st.sku === x.code ? " sel" : ""));
      tr.tabIndex = 0;
      const n = el("td");
      n.append(el("span", "code", x.code), document.createTextNode(" "), el("span", "t-name", short(x.code)), el("span", "t-sub", SKU[x.code].brand));
      tr.appendChild(n);
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

  // ---------- shipment plan ----------
  function renderPlan() {
    $("#rencana-title").textContent = "Rencana kirim " + nextName;
    $("#rencana-sub").textContent = "Forecast " + bulan(D.next) + " dari penjualan Juli–September, ditambah stok pengaman " + idn(FC.buffer * 100, 0) + "%, dibulatkan ke atas per karton";
    const strip = $("#wh-strip");
    strip.replaceChildren();
    for (const w of WH) {
      const items = FC.plan.filter((r) => r[1] === w);
      const b = el("button", "wh-btn");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", st.planWh === w ? "true" : "false");
      const val = el("span", "wh-val", num(items.reduce((a, r) => a + r[3], 0)));
      val.appendChild(el("small", null, "karton"));
      b.append(el("span", "wh-name", "Gudang " + w), val, el("span", "wh-sub", num(items.reduce((a, r) => a + r[2], 0)) + " unit · " + items.length + " SKU"));
      b.addEventListener("click", () => { st.planWh = w; renderPlan(); });
      strip.appendChild(b);
    }
    const am = D.allMonths, n = am.length;
    const tb = $("#tabel-rencana tbody");
    tb.replaceChildren();
    const list = FC.plan.filter((r) => r[1] === st.planWh).sort((a, b) => b[3] - a[3]);
    if (!list.length) return U.emptyRow(tb, 6, "Belum ada rencana kirim untuk gudang ini.");
    for (const [code, , f, cartons] of list) {
      const h = FC.hist[code + "|" + st.planWh];
      const avg = (h[n - 1] + h[n - 2] + h[n - 3]) / 3;
      const tr = el("tr");
      const c = el("td");
      c.append(el("span", "code", code), document.createTextNode(" "), el("span", "t-name", short(code)), el("span", "t-sub", SKU[code].brand));
      tr.append(c, el("td", "r opt", num(Math.round(avg))), el("td", "r", num(f)), el("td", "r opt", num(Math.ceil(f * (1 + FC.buffer)))), el("td", "r opt", num(SKU[code].box)));
      const k = el("td", "r"); k.appendChild(el("b", null, num(cartons)));
      tr.appendChild(k);
      tb.appendChild(tr);
    }
  }

  // ---------- pipeline ----------
  function renderFlow() {
    const m = U.state.month, s = D.sell[m].stat, p = FC.pipe[m];
    $("#alur-sub").textContent = "Angka untuk " + U.monthName(m);
    const valid = s.raw_lines - s.Batal - s.Retur;
    const steps = [
      ["Ekspor pesanan", num(s.raw_lines) + " baris", num(s.raw_orders) + " pesanan dari " + D.stores.length + " toko di " + D.platforms.length + " platform"],
      ["Buang batal & retur", num(valid) + " baris", "−" + num(s.Batal) + " batal, −" + num(s.Retur) + " retur"],
      ["Petakan toko ke gudang", D.stores.length + " → " + WH.length, "tiap toko punya gudang pengirim sendiri"],
      ["Pecah bundle & multipack", num(p.sku_units) + " unit", num(p.pack_lines) + " baris paket · " + num(p.item_units) + " unit item jual jadi " + num(p.sku_units) + " unit SKU"],
      ["Pivot SKU × gudang", D.skus.length + " × " + WH.length, "unit fisik per SKU per gudang per bulan"],
      ["Forecast & karton", m === D.months[D.months.length - 1] ? num(FC.plan.reduce((a, r) => a + r[3], 0)) + " karton" : pct(metrics(rows(m)).acc, 0) + " akurat",
        m === D.months[D.months.length - 1] ? "rencana kirim " + bulan(D.next) : "forecast " + bulan(m) + " diuji terhadap aktual"],
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
    const t = $("#tabel-convert");
    if (t.childNodes.length) return;
    const hr = el("tr"); hr.append(el("th", null, "Item jual"), el("th", null, "SKU fisik yang keluar gudang"));
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
    box.appendChild(el("div", "formula", "Forecast(M) = 0,5 × Aktual(M−1) + 0,3 × Aktual(M−2) + 0,2 × Aktual(M−3)"));
    const dl = el("dl");
    const add = (k, v) => dl.append(el("dt", null, k), el("dd", null, v));
    add("Akurasi", "1 − Σ|forecast − aktual| ÷ Σ aktual (WAPE). SKU laris berbobot lebih besar.");
    add("Bias", "(Σ forecast − Σ aktual) ÷ Σ aktual. Negatif berarti forecast kurang.");
    add("Toleransi", "Selisih lebih dari ±" + idn(TOL * 100, 0) + "% ditandai meleset.");
    add("Karton", "⌈forecast × " + idn(1 + FC.buffer, 2) + " ÷ isi per karton⌉");
    box.appendChild(dl);
    box.appendChild(el("p", null, "Rata-rata bergerak tertimbang dipilih karena mudah dijelaskan ke tim gudang dan cukup akurat untuk SKU yang stabil. Kelemahannya terlihat di bulan dengan tren naik, konten viral, dan bulan stok kosong. Langkah berikutnya: tambah faktor tren dan kalender kampanye, lalu koreksi bulan stok kosong sebelum dihitung."));
  }

  function redraw() { drawMonthly(); drawScatter(); renderProfile(); }
  function renderAll() {
    renderLede(); renderKpis(); renderWhTable(); renderSkuSelect(); renderProfile(); renderHeat(); renderPlan(); renderFlow(); renderConvert(); renderMethod();
    redraw();
  }

  $("#sku-pilih").addEventListener("change", (e) => pickSku(e.target.value));
  $("#heat-gudang").addEventListener("change", (e) => { st.wh = e.target.value; renderWhTable(); renderHeat(); drawScatter(); });
  $("#heat-urut").addEventListener("change", (e) => { st.sort = e.target.value; renderHeat(); });

  U.onMonth(() => renderAll());
  window.FORECAST_PAGE = { render: renderAll, redraw };
})();
