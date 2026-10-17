/* Page 01: Sell-out. */
(function () {
  "use strict";
  const U = window.U, D = window.DASH;
  const { el, svgEl, rp, rpFull, num, pct, idn, delta, growth, isNum } = U;
  const $ = (s) => document.querySelector(s);
  if (!D || !D.sell) {
    $("#so-lede").replaceWith(Object.assign(document.createElement("div"), { className: "error", textContent: "Data dasbor belum termuat. Coba muat ulang halaman ini." }));
    return;
  }

  const PCOL = {};
  D.platforms.forEach((p, i) => (PCOL[p] = "var(--p" + (i + 1) + ")"));
  const STORE = {}; D.stores.forEach(([name, platform, wh]) => (STORE[name] = { platform, wh }));
  const ITEM = {}; D.items.forEach((it) => (ITEM[it.code] = it));
  const CAT = {}; D.brands.forEach(([b, c]) => (CAT[b] = c));
  const KIDS = "Anak & Keluarga";
  const st = { platform: "", tokoSort: "gmv", brand: "", itemSort: "gmv", q: "" };

  const S = (m) => D.sell[m];
  const prev = (m) => D.sell[U.prevKey(m)];
  const days = (m) => S(m).daily.length;
  const dayTotal = (m) => S(m).daily.map((r) => r.reduce((a, b) => a + b, 0));

  function campaignDays(m) {
    const mo = U.monthNo(m);
    const out = [{ day: mo, label: mo + "." + mo, kind: "twin" }, { day: 25, label: "Payday", kind: "payday" }];
    if (mo === 8) out.push({ day: 17, label: "17-an", kind: "hut" });
    return out.filter((c) => c.day <= days(m));
  }
  function itemKind(code) {
    const it = ITEM[code];
    if (!it) return "SKU tunggal";
    if (it.comp.length > 1) return "Bundle";
    if (it.comp[0][1] > 1) return "Multipack";
    return "SKU tunggal";
  }
  const skuUnitsPerItem = (code) => (ITEM[code] ? ITEM[code].comp.reduce((a, c) => a + c[1], 0) : 1);

  // ---------- lede, KPIs, notes ----------
  function renderLede() {
    const m = U.state.month, t = S(m).tot, p = prev(m);
    const lede = $("#so-lede");
    lede.replaceChildren();
    const add = (txt, bold) => lede.appendChild(bold ? el("b", null, txt) : document.createTextNode(txt));
    add("Sepanjang " + U.monthName(m) + ", GMV pesanan valid mencapai ");
    add(rp(t.gmv), true);
    add(" dari " + num(t.orders) + " pesanan");
    const g = p && growth(t.gmv, p.tot.gmv);
    if (isNum(g)) add(", " + (g >= 0 ? "naik " : "turun ") + idn(Math.abs(g) * 100, 1) + "% dari " + U.BULAN[U.monthNo(U.prevKey(m)) - 1]);
    add(". ");
    const plats = D.platforms.map((n) => ({ n, gmv: S(m).plat[n][0] })).sort((a, b) => b.gmv - a.gmv);
    add(plats[0].n + " menyumbang ");
    add(pct(plats[0].gmv / t.gmv, 0), true);
    add(" GMV. ");
    const tw = campaignDays(m)[0], tot = dayTotal(m);
    add("Hari kampanye " + tw.label + " sendiri menghasilkan ");
    add(rp(tot[tw.day - 1]), true);
    add(", atau " + pct(tot[tw.day - 1] / t.gmv) + " GMV sebulan.");
  }

  function renderKpis() {
    const m = U.state.month, t = S(m).tot, p = prev(m);
    const box = $("#so-kpis");
    box.replaceChildren();
    const idx = D.months.indexOf(m);
    const series = (f) => D.months.map((k) => f(D.sell[k]));
    const lbl = D.months.map(U.monthShort);
    const pn = U.BULAN[U.monthNo(U.prevKey(m)) - 1];
    const vs = (now, before) => U.sub([delta(growth(now, before)), " dari " + pn]);
    const gm = (v) => idn(v / 1e9, 2);
    box.appendChild(U.kpi("GMV", gm(t.gmv), vs(t.gmv, p && p.tot.gmv), { cur: "Rp", unit: "M", title: rpFull(t.gmv), spark: U.spark(series((s) => s.tot.gmv), idx, lbl) }));
    box.appendChild(U.kpi("Pesanan", num(t.orders), vs(t.orders, p && p.tot.orders), { spark: U.spark(series((s) => s.tot.orders), idx, lbl) }));
    box.appendChild(U.kpi("Unit terjual", num(t.units), vs(t.units, p && p.tot.units), { spark: U.spark(series((s) => s.tot.units), idx, lbl) }));
    const aov = (s) => s.tot.gmv / s.tot.orders;
    box.appendChild(U.kpi("Nilai rata-rata pesanan", num(Math.round(aov(S(m)))), vs(aov(S(m)), p && aov(p)), { cur: "Rp", spark: U.spark(series(aov), idx, lbl) }));
    const tot = dayTotal(m), camp = campaignDays(m);
    const cg = camp.reduce((a, c) => a + tot[c.day - 1], 0);
    box.appendChild(U.kpi("Porsi GMV hari kampanye", pct(cg / t.gmv), U.sub([el("b", null, camp.length + " hari"), " (" + camp.map((c) => c.label).join(", ") + ") dari " + days(m)]),
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
      f.append(el("div", "tag", tag), el("div", "big", big), el("p", null, text));
      box.appendChild(f);
    };
    card("Tanggal kembar", idn(tot[tw.day - 1] / avgNormal, 1) + "× hari biasa",
      "GMV tanggal " + tw.label + " dibanding rata-rata hari tanpa kampanye. Payday tanggal 25 ada di " + idn(tot[24] / avgNormal, 1) + "×. Stok gudang perlu disiapkan sebelum tanggal ini, bukan sesudahnya.");
    const h = s.hour, hs = h.reduce((a, b) => a + b, 0);
    const others = (hs - h[0]) / 23;
    card("Flash sale jam 00", pct(h[0] / hs) + " GMV",
      "Jam 00.00–00.59 menyumbang " + idn(h[0] / others, 1) + "× rata-rata jam lain, hampir semuanya dari pembukaan promo tengah malam di hari kampanye.");
    let skuAll = 0, skuPack = 0;
    for (const [code, , units] of s.item) {
      const k = skuUnitsPerItem(code) * units;
      skuAll += k;
      if (itemKind(code) !== "SKU tunggal") skuPack += k;
    }
    card("Bundle & multipack", pct(skuPack / skuAll, 0) + " unit SKU",
      "Unit fisik yang keluar gudang lewat paket. Karena itu stok dihitung setelah bundle dipecah ke SKU, bukan dari item jual (lihat halaman Forecast & stok gudang).");
  }

  // ---------- charts ----------
  function drawMonthly() {
    const box = $("#chart-bulanan");
    const W = box.clientWidth;
    if (!W) return;
    const narrow = W < 520;
    const H = narrow ? 250 : 280;
    const months = D.months;
    const totals = months.map((k) => D.sell[k].tot.gmv);
    const ticks = U.niceTicks(Math.max(...totals) * 1.08, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 22, r: 6, b: 28, l: U.labelWidth(box, ticks.map(U.axisRp)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / months.length;
    const bw = Math.min(56, band * 0.56);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafik batang bertumpuk GMV per platform per bulan" });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisRp(t)));
    }
    const groups = [];
    months.forEach((k, i) => {
      const cx = m.l + (i + 0.5) * band, x0 = cx - bw / 2, x1 = cx + bw / 2;
      const sel = k === U.state.month;
      const g = svgEl("g", { opacity: sel ? 1 : 0.5 });
      let acc = 0;
      const vals = D.platforms.map((p) => D.sell[k].plat[p][0]);
      vals.forEach((v, j) => {
        if (v <= 0) return;
        const yb = y(acc), yt = y(acc + v);
        const last = j === vals.length - 1 || vals.slice(j + 1).every((x) => x <= 0);
        const gap = j > 0 ? 2 : 0; // 2px surface gap between stacked segments
        const d = last ? U.barPath(x0, x1, yt, yb - gap) : U.rectPath(x0, x1, yt, yb - gap);
        g.appendChild(svgEl("path", { d, fill: PCOL[D.platforms[j]] }));
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
      const sx = ((ev.clientX - r.left) / r.width) * W;
      return Math.max(0, Math.min(months.length - 1, Math.floor((sx - m.l) / band)));
    };
    const move = (ev) => {
      const i = idxAt(ev), k = months[i];
      groups.forEach((g, j) => g.g.setAttribute("opacity", j === i || g.sel ? 1 : 0.5));
      const r = svg.getBoundingClientRect(), s = r.width / W;
      const rows = D.platforms.slice().reverse().map((p) => ({ label: p, value: rp(D.sell[k].plat[p][0]), color: PCOL[p] }));
      rows.push({ label: "Total", value: rp(totals[i]) });
      U.showTip(box, groups[i].cx * s, y(totals[i]) * s, U.monthName(k), rows, k === U.state.month ? null : "Klik untuk memilih bulan ini");
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => { groups.forEach((g) => g.g.setAttribute("opacity", g.sel ? 1 : 0.5)); U.hideTip(box); });
    hit.addEventListener("click", (ev) => { const k = months[idxAt(ev)]; if (k !== U.state.month) { U.hideTip(box); U.setMonth(k); } });
  }

  function drawDaily() {
    const box = $("#chart-harian");
    const W = box.clientWidth;
    if (!W) return;
    const mo = U.state.month;
    $("#harian-title").textContent = "GMV harian, " + U.monthName(mo);
    const narrow = W < 520;
    const H = narrow ? 250 : 280;
    const vals = dayTotal(mo), n = vals.length;
    const camp = campaignDays(mo), cmap = {};
    camp.forEach((c) => (cmap[c.day] = c));
    const ticks = U.niceTicks(Math.max(...vals) * 1.1, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 18, r: 6, b: 28, l: U.labelWidth(box, ticks.map(U.axisRp)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / n;
    const bw = Math.max(2, band - 2);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafik batang GMV per hari, " + U.monthName(mo) });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisRp(t)));
    }
    const bars = [];
    vals.forEach((v, i) => {
      const x0 = m.l + i * band + 1, d = i + 1;
      const c = cmap[d];
      const p = svgEl("path", { d: U.barPath(x0, x0 + bw, y(v), y(0), Math.min(3, bw / 2)), fill: c ? "var(--camp)" : "var(--one-soft)" });
      svg.appendChild(p);
      bars.push(p);
      if (c && c.kind !== "hut") svg.appendChild(svgEl("text", { x: x0 + bw / 2, y: y(v) - 6, "text-anchor": c.kind === "payday" && narrow ? "end" : "middle", class: "lbl-camp" }, c.label));
    });
    const avg = vals.reduce((a, b) => a + b, 0) / n;
    svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(avg), y2: y(avg), stroke: "var(--fg)", "stroke-width": 1.2, "stroke-opacity": 0.7 }));
    // average label sits mid-month (days 11-22 carry no labelled campaign), clear of the 9.9 and payday labels
    const avgLbl = "rata-rata " + U.rp(avg);
    const lw = U.labelWidth(box, [avgLbl]);
    const lx = Math.min(m.l + iw - lw - 4, Math.max(m.l + 4, m.l + 16.5 * band - lw / 2));
    svg.appendChild(svgEl("rect", { x: lx - 3, y: y(avg) - 17, width: lw + 6, height: 14, fill: "var(--panel)", "fill-opacity": 0.88, rx: 3 }));
    svg.appendChild(svgEl("text", { x: lx, y: y(avg) - 6, "text-anchor": "start", class: "lbl-strong" }, avgLbl));
    [1, 5, 10, 15, 20, 25, 30].filter((d) => d <= n).forEach((d) => {
      svg.appendChild(svgEl("text", { x: m.l + (d - 0.5) * band, y: H - 8, "text-anchor": "middle" }, String(d)));
    });
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const sx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.floor((sx - m.l) / band)));
      bars.forEach((b, j) => b.setAttribute("fill-opacity", j === i ? 1 : 0.55));
      const s = r.width / W, d = i + 1;
      const row = S(mo).daily[i];
      const top = D.platforms.map((p, j) => [p, row[j]]).sort((a, b) => b[1] - a[1])[0];
      const date = new Date(+mo.slice(0, 4), U.monthNo(mo) - 1, d);
      const title = date.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }) + (cmap[d] ? " · " + (cmap[d].kind === "twin" ? "kampanye " + cmap[d].label : cmap[d].kind === "payday" ? "payday" : "HUT RI") : "");
      U.showTip(box, (m.l + (i + 0.5) * band) * s, y(vals[i]) * s, title, [
        { label: "GMV", value: rp(vals[i]) },
        { label: "Pesanan", value: num(S(mo).dailyOrders[i]) },
        { label: "vs rata-rata", value: idn(vals[i] / avg, 1) + "×" },
        { label: "Platform teratas", value: top[0], color: PCOL[top[0]] },
      ]);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { bars.forEach((b) => b.setAttribute("fill-opacity", 1)); U.hideTip(box); });
  }

  function drawHours() {
    const box = $("#chart-jam");
    const W = box.clientWidth;
    if (!W) return;
    const h = S(U.state.month).hour, hs = h.reduce((a, b) => a + b, 0);
    const vals = h.map((v) => v / hs);
    const narrow = W < 520;
    const H = narrow ? 210 : 230;
    const ticks = U.niceTicks(Math.max(...vals) * 1.12, 4);
    const yMax = ticks[ticks.length - 1];
    const tl = ticks.map((t) => idn(t * 100, 0) + "%");
    const m = { t: 18, r: 6, b: 28, l: U.labelWidth(box, tl) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / 24, bw = Math.max(3, band - 3);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafik batang porsi GMV per jam" });
    ticks.forEach((t, i) => {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, tl[i]));
    });
    const peak = vals.indexOf(Math.max(...vals));
    const bars = vals.map((v, i) => {
      const x0 = m.l + i * band + 1.5;
      const p = svgEl("path", { d: U.barPath(x0, x0 + bw, y(v), y(0), 3), fill: "var(--one)", "fill-opacity": i === peak || i === 0 ? 1 : 0.6 });
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
      const sx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(23, Math.floor((sx - m.l) / band)));
      bars.forEach((b, j) => b.setAttribute("fill-opacity", j === i || j === peak || j === 0 ? 1 : 0.6));
      const s = r.width / W;
      U.showTip(box, (m.l + (i + 0.5) * band) * s, y(vals[i]) * s, "Jam " + String(i).padStart(2, "0") + ".00–" + String(i).padStart(2, "0") + ".59",
        [{ label: "Porsi GMV", value: pct(vals[i]) }, { label: "GMV", value: rp(h[i]) }]);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { bars.forEach((b, j) => b.setAttribute("fill-opacity", j === peak || j === 0 ? 1 : 0.6)); U.hideTip(box); });
  }

  // ---------- platform list & store table ----------
  function renderPlatforms() {
    const m = U.state.month, s = S(m), p = prev(m);
    $("#platform-pos").textContent = U.monthName(m) + " · dibanding " + U.BULAN[U.monthNo(U.prevKey(m)) - 1];
    const box = $("#plat-list");
    box.replaceChildren();
    const leg = $("#leg-platform");
    leg.replaceChildren();
    for (const name of D.platforms) {
      const span = el("span"); const k = el("span", "key"); k.style.background = PCOL[name];
      span.append(k, name); leg.appendChild(span);
    }
    const rows = D.platforms.map((n) => ({ n, gmv: s.plat[n][0], orders: s.plat[n][1], before: p ? p.plat[n][0] : null }))
      .sort((a, b) => b.gmv - a.gmv);
    for (const r of rows) {
      const row = el("div", "plat-row");
      const name = el("div", "plat-name");
      const k = el("span", "pkey"); k.style.background = PCOL[r.n];
      name.append(k, r.n, el("small", null, num(r.orders) + " pesanan"));
      const g = el("div", "plat-gmv", rp(r.gmv)); g.title = rpFull(r.gmv);
      row.append(name, g, delta(growth(r.gmv, r.before)), U.bar(r.gmv / s.tot.gmv, PCOL[r.n]));
      box.appendChild(row);
    }
  }

  function renderStores() {
    const m = U.state.month, s = S(m), p = prev(m);
    const sel = $("#toko-platform");
    if (!sel.options.length) {
      sel.append(new Option("Semua platform", ""), ...D.platforms.map((x) => new Option(x, x)));
    }
    sel.value = st.platform;
    const before = {};
    if (p) p.store.forEach(([n, g]) => (before[n] = g));
    let rows = s.store.map(([name, gmv, orders]) => ({ name, gmv, orders, aov: orders ? gmv / orders : null, mom: growth(gmv, before[name]), ...STORE[name] }))
      .filter((r) => !st.platform || r.platform === st.platform);
    const key = { gmv: ["gmv", -1], mom: ["mom", -1], "mom-low": ["mom", 1], aov: ["aov", -1] }[st.tokoSort];
    rows.sort((a, b) => key[1] * ((a[key[0]] ?? -1e9) - (b[key[0]] ?? -1e9)));
    $("#toko-count").textContent = rows.length + " toko · " + D.warehouses.length + " gudang";
    const tb = $("#tabel-toko tbody");
    tb.replaceChildren();
    if (!rows.length) return U.emptyRow(tb, 7, "Tidak ada toko untuk platform ini.");
    const max = Math.max(...rows.map((r) => r.gmv / s.tot.gmv));
    for (const r of rows) {
      const tr = el("tr");
      const n = el("td");
      const k = el("span", "pkey"); k.style.background = PCOL[r.platform];
      const nm = el("span", "t-name"); nm.append(k, r.name);
      n.append(nm, el("span", "t-sub", r.platform));
      const g = el("td", "r", rp(r.gmv)); g.title = rpFull(r.gmv);
      const share = el("td", "barcell opt");
      const b = U.bar(r.gmv / s.tot.gmv / max, PCOL[r.platform], pct(r.gmv / s.tot.gmv));
      share.appendChild(b);
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
    const box = $("#chart-brand-sebar");
    const W = box.clientWidth;
    if (!W) return;
    const rows = brandRows(U.state.month);
    const H = Math.min(330, Math.max(250, W * 0.62));
    const maxX = Math.ceil(Math.max(...rows.map((r) => r.share)) * 20) / 20 + 0.0001;
    const ext = Math.max(0.1, ...rows.map((r) => Math.abs(r.mom || 0)));
    const yExt = Math.ceil(ext * 20) / 20;
    const yt = [];
    for (let v = -yExt; v <= yExt + 1e-9; v += yExt / 2) yt.push(+v.toFixed(4));
    const ylab = yt.map((v) => U.signedPct(v, 0).replace("±", ""));
    const m = { t: 12, r: 16, b: 40, l: U.labelWidth(box, ylab) + 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (v) => m.l + (v / maxX) * iw;
    const y = (v) => m.t + ih / 2 - (v / yExt) * (ih / 2);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Sebaran brand menurut porsi GMV dan pertumbuhan" });
    yt.forEach((v, i) => {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), stroke: Math.abs(v) < 1e-9 ? "var(--axis)" : "var(--grid)", "stroke-width": Math.abs(v) < 1e-9 ? 1.5 : 1 }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, ylab[i]));
    });
    for (let v = 0; v <= maxX + 1e-9; v += 0.05) {
      svg.appendChild(svgEl("line", { x1: x(v), x2: x(v), y1: m.t, y2: m.t + ih, stroke: "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: x(v), y: m.t + ih + 16, "text-anchor": v === 0 ? "start" : "middle" }, idn(v * 100, 0) + "%"));
    }
    svg.appendChild(svgEl("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle" }, "Porsi GMV bulan ini →"));
    svg.appendChild(svgEl("text", { x: 0, y: 0, "text-anchor": "middle", transform: `translate(11 ${m.t + ih / 2}) rotate(-90)` }, "Pertumbuhan vs bulan lalu →"));
    const labelled = new Set(rows.slice(0, 3).map((r) => r.b));
    const byMom = rows.filter((r) => isNum(r.mom)).sort((a, b) => b.mom - a.mom);
    if (byMom.length) { labelled.add(byMom[0].b); labelled.add(byMom[byMom.length - 1].b); }
    if (st.brand) labelled.add(st.brand);
    const dots = [];
    for (const r of rows) {
      if (!isNum(r.mom)) continue;
      const active = !st.brand || st.brand === r.b;
      const cx = x(r.share), cy = y(Math.max(-yExt, Math.min(yExt, r.mom)));
      const g = svgEl("g", { style: "cursor:pointer", tabindex: "0", role: "button", "aria-label": r.b + ", porsi " + pct(r.share) + ", pertumbuhan " + U.signedPct(r.mom) });
      g.appendChild(svgEl("circle", { cx, cy, r: 13, fill: "transparent" }));
      const big = st.brand === r.b;
      g.appendChild(svgEl("circle", { cx, cy, r: big ? 7.5 : 6, fill: r.kids ? "var(--one)" : "var(--panel)", stroke: r.kids ? "var(--panel)" : "var(--one)", "stroke-width": r.kids ? 2 : 2.2, opacity: active ? 1 : 0.3 }));
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
        const rr = svg.getBoundingClientRect(), k = rr.width / W;
        U.showTip(box, cx * k, cy * k, r.b, [
          { label: "GMV", value: rp(r.gmv) },
          { label: "Porsi GMV", value: pct(r.share) },
          { label: "vs bulan lalu", value: U.signedPct(r.mom) },
          { label: "Kategori", value: r.kids ? "Anak & Keluarga" : "Dewasa & Spesialis" },
        ], "Klik untuk melihat item brand ini");
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
      sel.append(new Option("Semua brand", ""), ...brands.map((b) => new Option(b, b)));
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
    $("#item-count").textContent = rows.length === all.length ? all.length + " item" : "Menampilkan " + rows.length + " dari " + all.length + " item";
    const tb = $("#tabel-item tbody");
    tb.replaceChildren();
    if (!rows.length) return U.emptyRow(tb, 7, "Tidak ada item yang cocok. Ubah kata kunci atau pilih Semua brand.");
    for (const r of rows) {
      const tr = el("tr");
      const c = el("td", "opt"); c.appendChild(el("span", "code", r.code));
      const n = el("td"); n.append(el("span", "t-name", r.name));
      const sb = el("span", "t-sub"); sb.append(el("span", "only-narrow", r.code + " · " + r.kind + " · "), r.brand + " · " + (CAT[r.brand] || ""));
      n.appendChild(sb);
      const k = el("td", "opt"); k.appendChild(el("span", "kind" + (r.kind === "SKU tunggal" ? "" : " bundle"), r.kind));
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
    if (scroll && b) $("#rincian-item").scrollIntoView({ behavior: U.reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function redraw() { drawMonthly(); drawDaily(); drawHours(); drawBrandScatter(); }
  function renderAll() {
    renderLede(); renderKpis(); renderNotes(); renderPlatforms(); renderStores();
    renderBrandBars(); renderItemBrandSelect(); renderItems();
    redraw();
  }

  $("#toko-platform").addEventListener("change", (e) => { st.platform = e.target.value; renderStores(); });
  $("#toko-urut").addEventListener("change", (e) => { st.tokoSort = e.target.value; renderStores(); });
  $("#item-brand").addEventListener("change", (e) => pickBrand(e.target.value, false));
  $("#item-urut").addEventListener("change", (e) => { st.itemSort = e.target.value; renderItems(); });
  $("#item-cari").addEventListener("input", (e) => { st.q = e.target.value; renderItems(); });

  U.onMonth(() => renderAll());
  window.SELLOUT_PAGE = { render: renderAll, redraw, campaignDays, dayTotal };
})();
