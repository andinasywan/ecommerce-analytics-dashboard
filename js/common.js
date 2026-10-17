/* Shared helpers: formatting, DOM/SVG builders, tooltip, ticks, shared state. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const BLN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const idn = (v, d = 0) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Rupiah, short form: rb (ribu), jt (juta), M (miliar)
  function rp(v, d) {
    if (!isNum(v)) return "–";
    const a = Math.abs(v);
    if (a >= 1e9) return "Rp " + idn(v / 1e9, d == null ? 2 : d) + " M";
    if (a >= 1e6) return "Rp " + idn(v / 1e6, d == null ? (a >= 1e8 ? 0 : 1) : d) + " jt";
    if (a >= 1e3) return "Rp " + idn(v / 1e3, d == null ? 0 : d) + " rb";
    return "Rp " + idn(v, 0);
  }
  const rpFull = (v) => (isNum(v) ? "Rp " + idn(v, 0) : "–");
  const num = (v) => (isNum(v) ? idn(v, 0) : "–");
  const pct = (v, d = 1) => (isNum(v) ? idn(v * 100, d) + "%" : "–");
  const signedPct = (v, d = 1) => (isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "±") + idn(Math.abs(v) * 100, d) + "%" : "–");
  function axisRp(v) {
    if (v === 0) return "0";
    if (Math.abs(v) >= 1e9) return idn(v / 1e9, v % 1e9 ? 1 : 0) + " M";
    if (Math.abs(v) >= 1e6) return idn(v / 1e6, 0) + " jt";
    if (Math.abs(v) >= 1e3) return idn(v / 1e3, 0) + " rb";
    return idn(v, 0);
  }
  function axisNum(v) {
    if (Math.abs(v) >= 1e6) return idn(v / 1e6, 1) + " jt";
    if (Math.abs(v) >= 1e3) return idn(v / 1e3, v % 1e3 ? 1 : 0) + " rb";
    return idn(v, 0);
  }
  const monthNo = (key) => +key.slice(5, 7);
  const monthName = (key) => BULAN[monthNo(key) - 1] + " " + key.slice(0, 4);
  const monthShort = (key) => BLN3[monthNo(key) - 1];
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
    if (Math.abs(v) < 0.0005) { s.classList.add("flat"); s.textContent = "0%"; return s; }
    s.classList.add(v > 0 ? "up" : "down");
    s.textContent = idn(Math.abs(v) * (opts.points ? 1 : 100), d) + (opts.points ? " poin" : "%");
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
  // bar path with rounded data end, anchored at the baseline
  function barPath(x0, x1, yTop, yBase, r = 4) {
    const h = yBase - yTop;
    if (h <= 0.5) return `M${x0},${yBase}H${x1}V${yBase - 0.5}H${x0}Z`;
    r = Math.min(r, (x1 - x0) / 2, h);
    return `M${x0},${yBase}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x1 - r}Q${x1},${yTop} ${x1},${yTop + r}V${yBase}Z`;
  }
  // stacked segment: only the top one gets the rounded end
  function rectPath(x0, x1, yTop, yBase) {
    return `M${x0},${yBase}V${yTop}H${x1}V${yBase}Z`;
  }

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
  // width of the widest tick label, measured in a throwaway svg inside box
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
  // sparkline: faint area + line, emphasized selected point
  function spark(values, selIdx, labels) {
    const W = 200, H = 30, pad = 4;
    const max = Math.max(...values), min = Math.min(...values);
    const span = max - min || 1;
    const x = (i) => pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = (v) => H - 3 - ((v - min) / span) * (H - 8);
    const svg = svgEl("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img",
      "aria-label": "Tren " + labels.map((l, i) => l + " " + axisNum(values[i])).join(", ") });
    const line = values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join("");
    svg.appendChild(svgEl("path", { d: line + `L${x(values.length - 1)},${H}L${x(0)},${H}Z`, fill: "var(--one)", "fill-opacity": 0.1 }));
    svg.appendChild(svgEl("path", { d: line, fill: "none", stroke: "var(--one)", "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
    // the dot is drawn in HTML space so it stays round with preserveAspectRatio none
    const wrap = el("div");
    wrap.style.position = "relative";
    wrap.appendChild(svg);
    const dot = el("span");
    Object.assign(dot.style, { position: "absolute", width: "8px", height: "8px", borderRadius: "50%", background: "var(--one)",
      boxShadow: "0 0 0 2px var(--panel)", left: `calc(${(x(selIdx) / W) * 100}% - 4px)`, top: `calc(${(y(values[selIdx]) / H) * 30}px + 4px - 4px)` });
    wrap.appendChild(dot);
    return wrap;
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function emptyRow(tb, cols, text) {
    const tr = el("tr"); const td = el("td", "empty", text); td.colSpan = cols; tr.appendChild(td); tb.appendChild(tr);
  }

  const D = window.DASH;
  const state = { month: D ? D.months[D.months.length - 1] : null, listeners: [] };
  function setMonth(m) { state.month = m; state.listeners.forEach((f) => f(m)); }
  function onMonth(f) { state.listeners.push(f); }

  window.U = { NS, BULAN, BLN3, isNum, idn, rp, rpFull, num, pct, signedPct, axisRp, axisNum, monthName, monthShort, monthNo, prevKey,
    growth, el, svgEl, delta, bar, barPath, rectPath, showTip, hideTip, niceTicks, labelWidth, kpi, sub, spark, cssVar, emptyRow,
    state, setMonth, onMonth,
    reduceMotion: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches };
})();
