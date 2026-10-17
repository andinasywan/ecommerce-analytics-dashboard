/* Shared helpers: formatting, DOM/SVG builders, tooltip, ticks, shared period state. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const fmt = (v, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Rupiah, short form: K (thousand), M (million), B (billion)
  function rp(v, d) {
    if (!isNum(v)) return "–";
    const a = Math.abs(v);
    if (a >= 1e9) return "Rp " + fmt(v / 1e9, d == null ? 2 : d) + "B";
    if (a >= 1e6) return "Rp " + fmt(v / 1e6, d == null ? (a >= 1e8 ? 0 : 1) : d) + "M";
    if (a >= 1e3) return "Rp " + fmt(v / 1e3, d == null ? 0 : d) + "K";
    return "Rp " + fmt(v, 0);
  }
  const rpFull = (v) => (isNum(v) ? "Rp " + fmt(v, 0) : "–");
  const num = (v) => (isNum(v) ? fmt(v, 0) : "–");
  const pct = (v, d = 1) => (isNum(v) ? fmt(v * 100, d) + "%" : "–");
  const signedPct = (v, d = 1) => (isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "±") + fmt(Math.abs(v) * 100, d) + "%" : "–");
  function axisRp(v) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e9) return fmt(v / 1e9, v % 1e9 ? 1 : 0) + "B";
    if (a >= 1e6) return fmt(v / 1e6, 0) + "M";
    if (a >= 1e3) return fmt(v / 1e3, 0) + "K";
    return fmt(v, 0);
  }
  function axisNum(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return fmt(v / 1e6, v % 1e6 ? 1 : 0) + "M";
    if (a >= 1e3) return fmt(v / 1e3, v % 1e3 ? 1 : 0) + "K";
    return fmt(v, 0);
  }
  const monthNo = (key) => +key.slice(5, 7);
  const monthName = (key) => MONTHS[monthNo(key) - 1] + " " + key.slice(0, 4);
  const monthOnly = (key) => MONTHS[monthNo(key) - 1];
  const monthShort = (key) => MON3[monthNo(key) - 1];
  function prevKey(key, k = 1) {
    let y = +key.slice(0, 4), m = monthNo(key) - k;
    while (m < 1) { m += 12; y -= 1; }
    return y + "-" + String(m).padStart(2, "0");
  }
  const growth = (now, before) => (isNum(now) && isNum(before) && before > 0 ? now / before - 1 : null);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function delta(v, opts = {}) {
    const s = el("span", "delta");
    if (!isNum(v)) { s.classList.add("flat"); s.textContent = opts.empty || "–"; return s; }
    const d = opts.d == null ? 1 : opts.d;
    if (Math.abs(v) < (opts.points ? 0.05 : 0.0005)) { s.classList.add("flat"); s.textContent = opts.points ? "no change" : "0%"; return s; }
    s.classList.add(v > 0 ? "up" : "down");
    s.textContent = fmt(Math.abs(v) * (opts.points ? 1 : 100), d) + (opts.points ? " pts" : "%");
    return s;
  }
  function bar(v, color, label) {
    const wrap = el("div", "bar");
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.background = color;
    fill.style.width = isNum(v) ? Math.max(0, Math.min(v, 1)) * 100 + "%" : "0";
    track.appendChild(fill);
    wrap.append(track, el("span", "val", label != null ? label : pct(v)));
    return wrap;
  }
  // bar with a rounded data end, anchored at the baseline
  function barPath(x0, x1, yTop, yBase, r = 4) {
    const h = yBase - yTop;
    if (h <= 0.5) return `M${x0},${yBase}H${x1}V${yBase - 0.5}H${x0}Z`;
    r = Math.min(r, (x1 - x0) / 2, h);
    return `M${x0},${yBase}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x1 - r}Q${x1},${yTop} ${x1},${yTop + r}V${yBase}Z`;
  }
  function rectPath(x0, x1, yTop, yBase) { return `M${x0},${yBase}V${yTop}H${x1}V${yBase}Z`; }

  // tooltip
  function tipFor(box) {
    let t = box.querySelector(".tip");
    if (!t) { t = el("div", "tip"); t.hidden = true; box.appendChild(t); }
    return t;
  }
  function showTip(box, x, y, title, rows, hint) {
    const t = tipFor(box);
    t.replaceChildren(el("div", "t", title));
    for (const r of rows) {
      const row = el("div", "r");
      const name = el("span");
      if (r.color) { const k = el("span", "key"); k.style.background = r.color; name.appendChild(k); }
      name.appendChild(document.createTextNode(r.label));
      row.append(name, el("b", null, r.value));
      t.appendChild(row);
    }
    if (hint) t.appendChild(el("div", "h", hint));
    t.hidden = false;
    const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
    let left = x + 14;
    if (left + tw > bw) left = x - tw - 14;
    left = Math.max(0, Math.min(left, bw - tw));
    let top = y - th - 10;
    if (top < 0) top = y + 14;
    t.style.left = left + "px";
    t.style.top = top + "px";
  }
  const hideTip = (box) => { const t = box.querySelector(".tip"); if (t) t.hidden = true; };

  function niceTicks(max, n) {
    if (!(max > 0)) return [0, 1];
    let step = Math.pow(10, Math.floor(Math.log10(max / n)));
    const err = max / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const out = [];
    for (let v = 0; v <= max + step * 0.999; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function labelWidth(box, labels) {
    const probe = svgEl("svg", { width: 0, height: 0, style: "position:absolute;visibility:hidden" });
    box.appendChild(probe);
    let w = 0;
    for (const s of labels) { const t = svgEl("text", {}, s); probe.appendChild(t); w = Math.max(w, t.getComputedTextLength()); }
    probe.remove();
    return Math.ceil(w);
  }
  function kpi(label, value, sub, opts = {}) {
    const k = el("div", "kpi");
    k.appendChild(el("div", "kpi-label", label));
    const v = el("div", "kpi-value");
    if (opts.cur) v.appendChild(el("span", "cur", opts.cur));
    v.appendChild(document.createTextNode(value));
    if (opts.unit) v.appendChild(el("span", "unit", opts.unit));
    if (opts.title) v.title = opts.title;
    k.appendChild(v);
    if (sub) k.appendChild(sub);
    if (opts.spark) k.appendChild(opts.spark);
    if (opts.meter != null) {
      const m = el("div", "meter"); const s = el("span");
      s.style.width = Math.max(0, Math.min(opts.meter, 1)) * 100 + "%";
      if (opts.meterColor) s.style.background = opts.meterColor;
      m.appendChild(s); k.appendChild(m);
    }
    return k;
  }
  function sub(parts) {
    const s = el("div", "kpi-sub");
    for (const p of parts) s.appendChild(typeof p === "string" ? document.createTextNode(p) : p);
    return s;
  }
  // sparkline: faint area + line, emphasised selected point
  function spark(values, selIdx, labels, fmtFn = axisNum) {
    const W = 200, H = 30, pad = 4;
    const max = Math.max(...values), min = Math.min(...values);
    const span = max - min || 1;
    const x = (i) => pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = (v) => H - 3 - ((v - min) / span) * (H - 8);
    const svg = svgEl("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img",
      "aria-label": "Trend " + labels.map((l, i) => l + " " + fmtFn(values[i])).join(", ") });
    const line = values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join("");
    svg.appendChild(svgEl("path", { d: line + `L${x(values.length - 1)},${H}L${x(0)},${H}Z`, fill: "var(--one)", "fill-opacity": 0.1 }));
    svg.appendChild(svgEl("path", { d: line, fill: "none", stroke: "var(--one)", "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
    const wrap = el("div");
    wrap.style.position = "relative";
    wrap.appendChild(svg);
    const dot = el("span");
    Object.assign(dot.style, { position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "var(--one)",
      boxShadow: "0 0 0 2px var(--panel)", left: `calc(${(x(selIdx) / W) * 100}% - 4px)`, top: `${y(values[selIdx])}px` });
    wrap.appendChild(dot);
    return wrap;
  }
  function emptyRow(tb, cols, text) {
    const tr = el("tr"); const td = el("td", "empty", text); td.colSpan = cols; tr.appendChild(td); tb.appendChild(tr);
  }
  // campaign days of a month: twin date, payday, and Independence Day in August
  function campaignDays(key, daysInMonth) {
    const mo = monthNo(key);
    const out = [{ day: mo, label: mo + "." + mo, kind: "twin" }, { day: 25, label: "Payday", kind: "payday" }];
    if (mo === 8) out.push({ day: 17, label: "Aug 17", kind: "holiday" });
    return out.filter((c) => !daysInMonth || c.day <= daysInMonth);
  }
  // segmented control
  function seg(box, options, value, onPick) {
    box.replaceChildren();
    for (const [val, label] of options) {
      const b = el("button", "seg-btn", label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", val === value ? "true" : "false");
      b.addEventListener("click", () => onPick(val));
      box.appendChild(b);
    }
  }


  // ---------- warehouse map ----------
  const WH_LL = { Jakarta: [106.8456, -6.2088], Surabaya: [112.7521, -7.2575], Medan: [98.6722, 3.5952], Makassar: [119.4327, -5.1477], Semarang: [110.4167, -6.9667] };
  // where each label sits relative to its bubble, so the three Java cities do not collide
  const LABEL_DIR = { Jakarta: [-1, 1], Semarang: [0, -1], Surabaya: [1, 1], Medan: [1, 0], Makassar: [1, 0] };
  function geoXY(lon, lat) {
    const G = window.GEO;
    const merc = (l) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360));
    return [(lon - G.lon0) * G.k, (merc(G.latTop) - merc(lat)) * G.k];
  }
  // pts: [{name, value, label2}], opts: {aria, selected, onPick, tip(p) -> rows, ring(p) -> 0..1 or null}
  function drawMap(box, pts, opts) {
    const G = window.GEO;
    const W = box.clientWidth;
    if (!G || !W) return;
    const s = W / G.w, H = Math.round(G.h * s);
    const narrow = W < 560;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": opts.aria, style: "overflow:hidden" });
    svg.appendChild(svgEl("rect", { x: 0, y: 0, width: W, height: H, rx: 10, fill: "var(--sea)" }));
    const g = svgEl("g", { transform: `scale(${s})` });
    g.appendChild(svgEl("path", { d: G.neighbours, fill: "var(--land-2)", stroke: "var(--sea)", "stroke-width": 1 / s, "stroke-linejoin": "round" }));
    g.appendChild(svgEl("path", { d: G.indonesia, fill: "var(--land)", stroke: "var(--sea)", "stroke-width": 1 / s, "stroke-linejoin": "round" }));
    svg.appendChild(g);
    const vmax = Math.max(...pts.map((p) => p.value), 1);
    const rMax = Math.max(12, Math.min(30, W * 0.034));
    const placed = pts.map((p) => {
      const [x, y] = geoXY(...WH_LL[p.name]);
      return { p, x: x * s, y: y * s, r: Math.max(5, rMax * Math.sqrt(p.value / vmax)) };
    }).sort((a, b) => b.r - a.r);
    const marks = [];
    for (const m of placed) {
      const on = opts.selected === m.p.name;
      const grp = svgEl("g", { style: "cursor:pointer", tabindex: "0", role: "button", "aria-label": m.p.name + ", " + m.p.label2 });
      grp.appendChild(svgEl("circle", { cx: m.x, cy: m.y, r: Math.max(m.r, 12), fill: "transparent" }));
      grp.appendChild(svgEl("circle", { cx: m.x, cy: m.y, r: m.r, fill: "var(--one)", "fill-opacity": opts.selected && !on ? 0.45 : 0.88, stroke: on ? "var(--fg)" : "var(--panel)", "stroke-width": on ? 2.5 : 1.5 }));
      const ring = opts.ring ? opts.ring(m.p) : null;
      if (isNum(ring)) {
        const rr = m.r + 5, c = 2 * Math.PI * rr;
        grp.appendChild(svgEl("circle", { cx: m.x, cy: m.y, r: rr, fill: "none", stroke: "var(--line)", "stroke-width": 3 }));
        grp.appendChild(svgEl("circle", { cx: m.x, cy: m.y, r: rr, fill: "none", stroke: "var(--fg)", "stroke-width": 3, "stroke-linecap": "round",
          "stroke-dasharray": `${(c * Math.max(0, Math.min(1, ring))).toFixed(1)} ${c.toFixed(1)}`, transform: `rotate(-90 ${m.x} ${m.y})` }));
      }
      if (!narrow) {
        const [dx, dy] = LABEL_DIR[m.p.name] || [1, 0];
        const off = m.r + (isNum(ring) ? 11 : 6);
        let lx, ly, anchor;
        if (dy < 0) { lx = m.x - 6; ly = m.y - off - 18; anchor = "start"; }          // above, running right
        else if (dy > 0) { lx = m.x + dx * off * 0.7; ly = m.y + off + 10; anchor = dx < 0 ? "end" : "start"; }  // below, to one side
        else { lx = m.x + dx * off; ly = m.y - 3; anchor = dx < 0 ? "end" : "start"; }
        grp.appendChild(svgEl("text", { x: lx, y: ly, "text-anchor": anchor, class: "map-name" }, m.p.name));
        grp.appendChild(svgEl("text", { x: lx, y: ly + 15, "text-anchor": anchor, class: "map-val" }, m.p.label2));
      }
      svg.appendChild(grp);
      marks.push({ m, grp });
    }
    box.replaceChildren(svg);
    for (const { m, grp } of marks) {
      const show = () => {
        const k = svg.getBoundingClientRect().width / W;
        showTip(box, m.x * k, (m.y - m.r) * k, m.p.name + " warehouse", opts.tip(m.p), opts.onPick ? "Click to filter by this warehouse" : null);
      };
      grp.addEventListener("pointerenter", show);
      grp.addEventListener("focus", show);
      grp.addEventListener("pointerleave", () => hideTip(box));
      grp.addEventListener("blur", () => hideTip(box));
      if (opts.onPick) {
        const pick = () => { hideTip(box); opts.onPick(m.p.name); };
        grp.addEventListener("click", pick);
        grp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      }
    }
  }
  // ranked list next to a map; rows: [{name, value, label, sub, bar, delta}]
  function whList(box, rows, selected, onPick) {
    box.replaceChildren();
    for (const r of rows) {
      const b = el("button", "wl-row" + (selected === r.name ? " sel" : ""));
      b.type = "button";
      const head = el("span", "wl-head");
      head.append(el("span", "wl-name", r.name), el("span", "wl-val", r.label));
      b.appendChild(head);
      const track = el("span", "wl-track"); const fill = el("span", "wl-fill");
      fill.style.width = Math.max(0, Math.min(1, r.bar)) * 100 + "%";
      track.appendChild(fill);
      b.appendChild(track);
      const sb = el("span", "wl-sub");
      sb.append(r.sub);
      if (r.delta) { sb.append(" "); sb.appendChild(r.delta); }
      b.appendChild(sb);
      if (onPick) b.addEventListener("click", () => onPick(selected === r.name ? "" : r.name));
      box.appendChild(b);
    }
  }

  const D = window.DASH;
  const state = { month: D ? D.months[D.months.length - 1] : null, listeners: [] };
  function setMonth(m) { state.month = m; state.listeners.forEach((f) => f(m)); }
  function onMonth(f) { state.listeners.push(f); }

  window.U = { NS, MONTHS, MON3, isNum, fmt, rp, rpFull, num, pct, signedPct, axisRp, axisNum, monthName, monthOnly, monthShort, monthNo, prevKey,
    growth, el, svgEl, delta, bar, barPath, rectPath, showTip, hideTip, niceTicks, labelWidth, kpi, sub, spark, emptyRow, campaignDays, seg, drawMap, whList,
    state, setMonth, onMonth,
    reduceMotion: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches };
})();
