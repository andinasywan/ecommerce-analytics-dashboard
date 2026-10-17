"""
Build js/geo.js: simplified SVG outlines of Indonesia and its neighbours for the warehouse maps.

Source: Natural Earth 1:50m admin-0 countries (public domain), taken from the world-atlas npm package
(countries-50m.json) and saved as data/geo/natural_earth_50m_sea.geojson.
Projection: Mercator, cropped to lon 94.5..141.5, lat -11.2..6.4, 1000 units wide.

Run:  python tools/build_map.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "geo" / "natural_earth_50m_sea.geojson"
OUT = ROOT / "js" / "geo.js"

LON0, LON1, LAT_TOP, LAT_BOT = 94.5, 141.5, 6.4, -11.2
W = 1000
K = W / (LON1 - LON0)


def merc(lat):
    return math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


H = round((merc(LAT_TOP) - merc(LAT_BOT)) * K)


def project(lon, lat):
    return (lon - LON0) * K, (merc(LAT_TOP) - merc(lat)) * K


def clip(poly, pad=6):
    """Sutherland-Hodgman clip of a ring to the viewBox (plus a small margin)."""
    edges = [(lambda p: p[0] >= -pad, lambda a, b: inter_x(a, b, -pad)),
             (lambda p: p[0] <= W + pad, lambda a, b: inter_x(a, b, W + pad)),
             (lambda p: p[1] >= -pad, lambda a, b: inter_y(a, b, -pad)),
             (lambda p: p[1] <= H + pad, lambda a, b: inter_y(a, b, H + pad))]
    out = poly
    for inside, cut in edges:
        if not out:
            break
        src, out = out, []
        for i, cur in enumerate(src):
            prev = src[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
    return out


def inter_x(a, b, x):
    t = (x - a[0]) / (b[0] - a[0])
    return (x, a[1] + t * (b[1] - a[1]))


def inter_y(a, b, y):
    t = (y - a[1]) / (b[1] - a[1])
    return (a[0] + t * (b[0] - a[0]), y)


def dp(points, eps):
    """Douglas-Peucker simplification."""
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = math.hypot(dx, dy)
    idx, dmax = 0, -1.0
    for i in range(1, len(points) - 1):
        p = points[i]
        # closed ring (a == b): fall back to plain distance from the start point
        d = math.hypot(p[0] - a[0], p[1] - a[1]) if norm < 1e-6 else abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / norm
        if d > dmax:
            idx, dmax = i, d
    if dmax > eps:
        return dp(points[: idx + 1], eps)[:-1] + dp(points[idx:], eps)
    return [a, b]


def area(ring):
    return abs(sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring)))) / 2


def ring_path(ring):
    pts = [project(lon, lat) for lon, lat in ring]
    pts = clip(pts)
    if len(pts) < 3 or area(pts) < 2.5:
        return ""
    pts = dp(pts + [pts[0]], 0.55)[:-1]
    if len(pts) < 3:
        return ""
    return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"


def feature_path(f):
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return "".join(ring_path(poly[0]) for poly in polys)


def main():
    fc = json.loads(SRC.read_text())
    indo = "".join(feature_path(f) for f in fc["features"] if str(f["id"]) == "360")
    other = "".join(feature_path(f) for f in fc["features"] if str(f["id"]) != "360")
    geo = dict(w=W, h=H, lon0=LON0, latTop=LAT_TOP, k=round(K, 6), indonesia=indo, neighbours=other,
               source="Natural Earth 1:50m (public domain)")
    OUT.write_text("/* Map outlines built by tools/build_map.py from Natural Earth (public domain). */\n"
                   "window.GEO = " + json.dumps(geo, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("geo.js", round(OUT.stat().st_size / 1024), "KB", "| viewBox", W, "x", H)


if __name__ == "__main__":
    main()
