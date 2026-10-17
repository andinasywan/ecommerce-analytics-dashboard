/* Page 03: Campaign days (twin dates and payday). */
(function () {
  "use strict";
  const U = window.U, D = window.DASH;
  const { el, svgEl, rp, rpFull, num, pct, fmt, delta, growth, isNum } = U;
  const $ = (s) => document.querySelector(s);
  if (!D || !D.campaigns) return;

  const PCOL = {};
  D.platforms.forEach((p, i) => (PCOL[p] = "var(--p" + (i + 1) + ")"));
  const CH_PLATFORM = {};
  D.stores.forEach(([, platform, channel]) => (CH_PLATFORM[channel] = platform));
  const chColor = (ch) => PCOL[CH_PLATFORM[ch]];
  const CHECKPOINTS = [2, 10, 14, 18, 24];
  const byKey = {};
  D.campaigns.forEach((c) => (byKey[c.key] = c));
  const st = { kind: "twin", channel: "", checkpoint: 10 };

  const current = () => D.campaigns.find((c) => c.month === U.state.month && c.kind === st.kind);
  const prevOf = (c) => (c && c.prev ? byKey[c.prev] : null);
  // cumulative GMV / orders at the end of each hour: index h = total of hours 0..h-1 (index 0 = 0)
  function cum(c, ch, idx = 0) {
    const out = new Array(25).fill(0);
    const chans = ch ? [ch] : D.channels;
    for (let h = 0; h < 24; h++) out[h + 1] = out[h] + chans.reduce((a, k) => a + (c.hourly[k] ? c.hourly[k][idx][h] : 0), 0);
    return out;
  }
  const full = (c, ch) => cum(c, ch)[24];
  const hh = (h) => (h === 24 ? "24:00" : String(h).padStart(2, "0") + ":00");
  const cpLabel = (h) => (h === 24 ? "Full day" : hh(h));
  const voucherCost = (c) => c.vouchers.reduce((a, v) => a + v[7], 0);
  const rebateTot = (c) => Object.values(c.rebates).reduce((a, b) => a + b, 0);

  function renderKindSwitch() {
    const m = U.state.month, mo = U.monthNo(m);
    U.seg($("#camp-kind"), [["twin", "Twin date · " + mo + "." + mo], ["payday", "Payday · 25 " + U.monthShort(m)]], st.kind, (k) => { st.kind = k; renderAll(); });
  }

  // ---------- lede & KPIs ----------
  function renderLede() {
    const c = current(), p = prevOf(c);
    const lede = $("#cp-lede");
    lede.replaceChildren();
    const add = (txt, bold) => lede.appendChild(bold ? el("b", null, txt) : document.createTextNode(txt));
    const f = full(c), pf = full(p);
    add(c.label + " closed at ");
    add(rp(f), true);
    const g = growth(f, pf);
    add(", " + (g >= 0 ? "up " : "down ") + fmt(Math.abs(g) * 100, 1) + "% on " + p.label + " and ");
    add(fmt(f / c.avgDay, 1) + "×", true);
    add(" an ordinary " + U.monthOnly(c.month) + " day. ");
    const at10 = cum(c)[10];
    add("By 10:00 it had already reached " + pct(at10 / pf, 0) + " of " + p.label + "'s full day");
    const cross = cum(c).findIndex((v) => v >= pf);
    add(cross > 0 ? ", and it passed that total at " + hh(cross) + ". " : ". ");
    const vc = voucherCost(c), rb = rebateTot(c);
    add("Store vouchers cost " + rp(vc) + " (" + pct(vc / f) + " of GMV); platforms paid back " + pct(rb / vc, 0) + " of it.");
  }

  function renderKpis() {
    const c = current(), p = prevOf(c);
    const box = $("#cp-kpis");
    box.replaceChildren();
    const f = full(c), pf = full(p);
    const ord = cum(c, "", 1)[24], pord = cum(p, "", 1)[24];
    box.appendChild(U.kpi("Campaign GMV", rp(f).replace("Rp ", ""), U.sub([delta(growth(f, pf)), " vs " + p.label]), { cur: "Rp", title: rpFull(f) }));
    box.appendChild(U.kpi("Orders", num(ord), U.sub([delta(growth(ord, pord)), " vs " + p.label])));
    box.appendChild(U.kpi("vs an ordinary day", fmt(f / c.avgDay, 1) + "×", U.sub(["ordinary day ", el("b", null, rp(c.avgDay))])));
    const vc = voucherCost(c), rb = rebateTot(c);
    box.appendChild(U.kpi("Voucher cost", rp(vc).replace("Rp ", ""), U.sub([el("b", null, pct(vc / f)), " of campaign GMV"]), { cur: "Rp" }));
    box.appendChild(U.kpi("Net cost after rebates", rp(vc - rb).replace("Rp ", ""), U.sub(["platforms paid back ", el("b", null, pct(rb / vc, 0))]), { cur: "Rp", meter: rb / vc, meterColor: "var(--one)" }));
  }

  // ---------- pacing chart ----------
  function drawPacing() {
    const box = $("#chart-pacing");
    const W = box.clientWidth;
    if (!W) return;
    const c = current(), p = prevOf(c), ch = st.channel;
    const sel = $("#pace-channel");
    if (!sel.options.length) sel.append(new Option("All channels", ""), ...D.channels.map((x) => new Option(x, x)));
    sel.value = ch;
    $("#pace-title").textContent = "Pacing, " + c.label + " vs " + p.label;
    const leg = $("#pace-legend");
    leg.replaceChildren();
    const legItem = (color, text) => { const s = el("span"); const k = el("span", "key line"); k.style.borderTopColor = color; k.style.borderTopWidth = "2.5px"; s.append(k, text); leg.appendChild(s); };
    legItem("var(--camp)", c.label);
    legItem("var(--muted)", p.label);
    const cur = cum(c, ch), old = cum(p, ch), pf = old[24];
    const H = W < 520 ? 260 : 300;
    const ticks = U.niceTicks(Math.max(cur[24], pf) * 1.1, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 16, r: 14, b: 28, l: U.labelWidth(box, ticks.map(U.axisRp)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (h) => m.l + (h / 24) * iw, y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Cumulative GMV by hour, " + c.label + " against " + p.label });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisRp(t)));
    }
    for (let h = 0; h <= 24; h += W < 520 ? 6 : 4) svg.appendChild(svgEl("text", { x: x(h), y: H - 8, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle" }, hh(h)));
    // previous campaign's full day as a reference line
    svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(pf), y2: y(pf), stroke: "var(--muted)", "stroke-width": 1 }));
    const refLbl = p.label + " full day " + rp(pf);
    svg.appendChild(svgEl("text", { x: m.l + 4, y: y(pf) - 5, class: "lbl-strong" }, refLbl));
    const path = (arr) => arr.map((v, h) => (h ? "L" : "M") + x(h).toFixed(1) + "," + y(v).toFixed(1)).join("");
    svg.appendChild(svgEl("path", { d: path(old), fill: "none", stroke: "var(--muted)", "stroke-width": 2, "stroke-linejoin": "round" }));
    svg.appendChild(svgEl("path", { d: path(cur), fill: "none", stroke: "var(--camp)", "stroke-width": 2.5, "stroke-linejoin": "round" }));
    for (const h of CHECKPOINTS) {
      const on = h === st.checkpoint;
      svg.appendChild(svgEl("circle", { cx: x(h), cy: y(cur[h]), r: on ? 6 : 4.5, fill: "var(--camp)", stroke: on ? "var(--fg)" : "var(--panel)", "stroke-width": 2 }));
      if (on || h === 24) {
        const lbl = pct(cur[h] / pf, 0) + " of " + p.label;
        svg.appendChild(svgEl("text", { x: h === 24 ? x(h) - 8 : x(h) + 8, y: y(cur[h]) + (h === 24 ? 18 : 16), "text-anchor": h === 24 ? "end" : "start", class: "lbl-strong" }, lbl));
      }
    }
    const cross = svgEl("line", { y1: m.t, y2: m.t + ih, stroke: "var(--fg)", "stroke-opacity": 0.35, visibility: "hidden" });
    svg.appendChild(cross);
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect(), s = r.width / W;
      const h = Math.max(1, Math.min(24, Math.round((((ev.clientX - r.left) / r.width) * W - m.l) / iw * 24)));
      cross.setAttribute("x1", x(h)); cross.setAttribute("x2", x(h)); cross.setAttribute("visibility", "visible");
      U.showTip(box, x(h) * s, y(cur[h]) * s, "By " + hh(h) + (ch ? " · " + ch : ""), [
        { label: c.label, value: rp(cur[h]), color: "var(--camp)" },
        { label: p.label + ", same hour", value: rp(old[h]), color: "var(--muted)" },
        { label: "Growth", value: U.signedPct(growth(cur[h], old[h])) },
        { label: "Of " + p.label + " full day", value: pct(cur[h] / pf, 0) },
      ]);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); U.hideTip(box); });
  }

  // ---------- checkpoint table ----------
  function renderCheckpoint() {
    const c = current(), p = prevOf(c), h = st.checkpoint;
    U.seg($("#checkpoints"), CHECKPOINTS.map((x) => [x, cpLabel(x)]), h, (x) => { st.checkpoint = x; renderCheckpoint(); drawPacing(); });
    const t = $("#table-checkpoint");
    t.replaceChildren();
    const thead = el("thead"), hr = el("tr");
    ["Channel", "GMV so far", "Orders", p.label + " same hour", "Growth", "Of " + p.label + " full day"].forEach((x, i) =>
      hr.appendChild(el("th", i ? "r" + (i === 3 || i === 2 ? " opt" : "") : null, x)));
    thead.appendChild(hr);
    const tb = el("tbody");
    const line = (label, ch, strong) => {
      const now = cum(c, ch)[h], ord = cum(c, ch, 1)[h], then = cum(p, ch)[h], pf = full(p, ch);
      const tr = el("tr");
      if (strong) tr.className = "tot";
      const n = el("td");
      if (ch) { const k = el("span", "pkey"); k.style.background = chColor(ch); n.appendChild(k); }
      n.appendChild(document.createTextNode(label));
      const g = el("td", "r"); g.appendChild(delta(growth(now, then)));
      const share = el("td", "r", pf ? pct(now / pf, 0) : "–");
      tr.append(n, el("td", "r", rp(now)), el("td", "r opt", num(ord)), el("td", "r opt", rp(then)), g, share);
      tb.appendChild(tr);
    };
    D.channels.slice().sort((a, b) => full(c, b) - full(c, a)).forEach((ch) => line(ch, ch, false));
    line("All channels", "", true);
    t.append(thead, tb);
  }

  // ---------- history ----------
  function drawHistory() {
    const box = $("#chart-history");
    const W = box.clientWidth;
    if (!W) return;
    const ms = D.allMonths;
    const get = (k, kind) => D.campaigns.find((c) => c.month === k && c.kind === kind);
    const rows = ms.map((k) => ({ k, twin: get(k, "twin"), pay: get(k, "payday") }));
    const vals = rows.flatMap((r) => [full(r.twin), full(r.pay)]);
    const H = W < 520 ? 240 : 270;
    const ticks = U.niceTicks(Math.max(...vals) * 1.12, 4);
    const yMax = ticks[ticks.length - 1];
    const m = { t: 30, r: 6, b: 28, l: U.labelWidth(box, ticks.map(U.axisRp)) + 12 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / ms.length, bw = Math.min(26, band * 0.3);
    const y = (v) => m.t + ih - (v / yMax) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Full-day GMV of each twin date and payday per month" });
    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), stroke: t === 0 ? "var(--axis)" : "var(--grid)" }));
      svg.appendChild(svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end" }, U.axisRp(t)));
    }
    const groups = rows.map((r, i) => {
      const cx = m.l + (i + 0.5) * band, sel = r.k === U.state.month;
      if (sel) svg.appendChild(svgEl("rect", { x: cx - band / 2 + 4, y: m.t - 18, width: band - 8, height: ih + 18 + 22, rx: 10, fill: "var(--soft)" }));
      const g = svgEl("g");
      const tv = full(r.twin), pv = full(r.pay);
      g.appendChild(svgEl("path", { d: U.barPath(cx - bw - 1, cx - 1, y(tv), y(0)), fill: "var(--camp)" }));
      g.appendChild(svgEl("path", { d: U.barPath(cx + 1, cx + bw + 1, y(pv), y(0)), fill: "var(--one)" }));
      const ext = Math.max(2, Math.min(5, (band - 2 * bw) / 2 - 3));
      g.appendChild(svgEl("rect", { x: cx - bw - ext, y: y(r.twin.avgDay) - 1.5, width: 2 * bw + 2 * ext + 2, height: 3, rx: 1.5, fill: "var(--fg)" }));
      svg.appendChild(g);
      if (sel) {
        const v = st.kind === "twin" ? tv : pv, xx = st.kind === "twin" ? cx - bw / 2 - 1 : cx + bw / 2 + 1;
        svg.appendChild(svgEl("text", { x: xx, y: y(v) - 6, "text-anchor": "middle", class: "lbl-strong" }, rp(v).replace("Rp ", "")));
      }
      // narrow screens: one letter per month (J F M ...), the tooltip carries the full name
      svg.appendChild(svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", class: sel ? "lbl-strong" : "" }, band < 34 ? U.monthShort(r.k)[0] : U.monthShort(r.k)));
      return { g, sel, cx, r };
    });
    // year divider when the history spans two years
    ms.forEach((k, i) => {
      if (i && k.slice(0, 4) === ms[i - 1].slice(0, 4)) return;
      const x0 = m.l + i * band;
      if (i) svg.appendChild(svgEl("line", { x1: x0, x2: x0, y1: m.t - 24, y2: m.t + ih, stroke: "var(--axis)", "stroke-dasharray": "3 3" }));
      svg.appendChild(svgEl("text", { x: x0 + (i ? 6 : 0), y: m.t - 14, class: "lbl-strong" }, k.slice(0, 4)));
    });
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", style: "cursor:pointer" });
    svg.appendChild(hit);
    box.replaceChildren(svg);
    const at = (ev) => { const r = svg.getBoundingClientRect(); return Math.max(0, Math.min(ms.length - 1, Math.floor((((ev.clientX - r.left) / r.width) * W - m.l) / band))); };
    hit.addEventListener("pointermove", (ev) => {
      const i = at(ev), g = groups[i], s = svg.getBoundingClientRect().width / W;
      groups.forEach((x, j) => x.g.setAttribute("opacity", j === i || x.sel ? 1 : 0.8));
      U.showTip(box, g.cx * s, y(Math.max(full(g.r.twin), full(g.r.pay))) * s, U.monthName(g.r.k), [
        { label: g.r.twin.label, value: rp(full(g.r.twin)), color: "var(--camp)" },
        { label: g.r.pay.label, value: rp(full(g.r.pay)), color: "var(--one)" },
        { label: "Ordinary day", value: rp(g.r.twin.avgDay), color: "var(--fg)" },
      ], D.months.includes(g.r.k) && g.r.k !== U.state.month ? "Click to select this month" : null);
    });
    hit.addEventListener("pointerleave", () => { groups.forEach((x) => x.g.setAttribute("opacity", 1)); U.hideTip(box); });
    hit.addEventListener("click", (ev) => { const k = ms[at(ev)]; if (D.months.includes(k) && k !== U.state.month) { U.hideTip(box); U.setMonth(k); } });
  }

  // ---------- vouchers & rebates ----------
  function renderVouchers() {
    const c = current();
    $("#voucher-sub").textContent = c.label + " · " + c.vouchers.length + " vouchers on " + new Set(c.vouchers.map((v) => v[1])).size + " channels";
    const tb = $("#table-voucher tbody");
    tb.replaceChildren();
    const rows = c.vouchers.slice().sort((a, b) => D.channels.indexOf(a[1]) - D.channels.indexOf(b[1]) || a[4] - b[4]);
    for (const [code, ch, name, minSpend, disc, quota, used, cost, gmv, soldOut] of rows) {
      const tr = el("tr");
      const v = el("td");
      v.append(el("span", "code", code), el("span", "t-sub hide-narrow", name.replace(/^(Store|LIVE) voucher [^-]+- /, "$1 voucher · ")));
      const chTd = el("td", "opt");
      const k = el("span", "pkey"); k.style.background = chColor(ch);
      chTd.append(k, ch);
      const u = el("td", "barcell");
      const ub = U.bar(used / quota, used >= quota ? "var(--camp)" : "var(--one)", num(used) + " / " + num(quota));
      ub.classList.add("wide");
      u.appendChild(ub);
      const so = el("td", "r opt");
      if (soldOut) so.appendChild(el("span", "kind bundle", soldOut)); else so.textContent = "–";
      tr.append(v, chTd, el("td", "r opt", minSpend ? rp(minSpend) : "none"), el("td", "r", U.rpFull(disc)), u, so,
        el("td", "r opt", rp(cost)), el("td", "r", cost ? fmt(gmv / cost, 1) + "×" : "–"));
      tb.appendChild(tr);
    }
    const rt = $("#table-rebate");
    rt.replaceChildren();
    const hr = el("tr");
    ["Channel", "Voucher cost", "Platform rebate", "Net cost", "Paid back"].forEach((x, i) => hr.appendChild(el("th", i ? "r" + (i < 3 ? " opt" : "") : null, x)));
    const th = el("thead"); th.appendChild(hr);
    const body = el("tbody");
    const chans = [...new Set(c.vouchers.map((v) => v[1]))];
    let tc = 0, tr_ = 0;
    const line = (label, cost, rb, total, color) => {
      const tr = el("tr");
      if (total) tr.className = "tot";
      const n = el("td");
      if (color) { const k = el("span", "pkey"); k.style.background = color; n.appendChild(k); }
      n.appendChild(document.createTextNode(label));
      tr.append(n, el("td", "r opt", rp(cost)), el("td", "r opt", rp(rb)), el("td", "r", rp(cost - rb)), el("td", "r", pct(rb / cost, 0)));
      body.appendChild(tr);
    };
    for (const ch of chans) {
      const cost = c.vouchers.filter((v) => v[1] === ch).reduce((a, v) => a + v[7], 0), rb = c.rebates[ch] || 0;
      tc += cost; tr_ += rb;
      line(ch, cost, rb, false, chColor(ch));
    }
    line("All channels", tc, tr_, true);
    rt.append(th, body);
  }

  function redraw() { drawPacing(); drawHistory(); }
  function renderAll() { renderKindSwitch(); renderLede(); renderKpis(); renderCheckpoint(); renderVouchers(); redraw(); }

  $("#pace-channel").addEventListener("change", (e) => { st.channel = e.target.value; drawPacing(); });
  U.onMonth(() => renderAll());
  window.CAMPAIGN_PAGE = { render: renderAll, redraw };
})();
