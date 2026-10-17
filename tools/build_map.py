"""
Build js/geo.js: simplified SVG outlines of Indonesia and its neighbours for the warehouse maps.

Sources (public domain):
  - Natural Earth 1:50m admin-0 countries, from the world-atlas npm package (countries-50m.json),
    saved as data/geo/natural_earth_50m_sea.geojson
  - Natural Earth 1:10m admin-1 provinces of Indonesia (33 provinces in this release), from
    github.com/nvkelso/natural-earth-vector, saved as data/geo/natural_earth_10m_indonesia_provinces.geojson
Also writes data/master/provinces.csv: province centroids and their distance to each warehouse.
Projection: Mercator, cropped to lon 94.5..141.5, lat -11.2..6.4, 1000 units wide.

Run:  python tools/build_map.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "geo" / "natural_earth_50m_sea.geojson"
PROV = ROOT / "data" / "geo" / "natural_earth_10m_indonesia_provinces.geojson"
PROV_CSV = ROOT / "data" / "master" / "provinces.csv"
WAREHOUSES = {"Jakarta": (106.8456, -6.2088), "Surabaya": (112.7521, -7.2575), "Medan": (98.6722, 3.5952),
              "Makassar": (119.4327, -5.1477), "Semarang": (110.4167, -6.9667)}
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


def ring_path(ring, min_area=2.5):
    pts = [project(lon, lat) for lon, lat in ring]
    pts = clip(pts)
    if len(pts) < 3 or area(pts) < min_area:
        return ""
    pts = dp(pts + [pts[0]], 0.55)[:-1]
    if len(pts) < 3:
        return ""
    return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"


def feature_path(f, min_area=2.5):
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return "".join(ring_path(poly[0], min_area) for poly in polys)


def centroid(f):
    """Area-weighted centroid of the outer rings, in lon/lat."""
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    A = cx = cy = 0.0
    for poly in polys:
        r = poly[0]
        for i in range(len(r) - 1):
            (x0, y0), (x1, y1) = r[i], r[i + 1]
            c = x0 * y1 - x1 * y0
            A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    A /= 2
    return cx / (6 * A), cy / (6 * A)


def km(a, b):
    (lon1, lat1), (lon2, lat2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def main():
    fc = json.loads(SRC.read_text())
    indo = "".join(feature_path(f) for f in fc["features"] if str(f["id"]) == "360")
    other = "".join(feature_path(f) for f in fc["features"] if str(f["id"]) != "360")
    provinces, rows = [], []
    for f in sorted(json.loads(PROV.read_text())["features"], key=lambda f: f["properties"]["name_en"]):
        name = f["properties"]["name_en"].replace(" Islands", "") if f["properties"]["name_en"].startswith("Bangka") else f["properties"]["name_en"]
        lon, lat = centroid(f)
        x, y = project(lon, lat)
        provinces.append(dict(n=name, d=feature_path(f, 1.2), c=[round(x, 1), round(y, 1)]))
        dist = {w: round(km((lon, lat), ll)) for w, ll in WAREHOUSES.items()}
        rows.append([name, f["properties"]["iso"], round(lon, 3), round(lat, 3), min(dist, key=dist.get)] + [dist[w] for w in WAREHOUSES])
    with open(PROV_CSV, "w", encoding="utf-8") as fh:
        fh.write(",".join(["province", "iso", "lon", "lat", "nearest_warehouse"] + ["km_" + w.lower() for w in WAREHOUSES]) + "\n")
        for r in rows:
            fh.write(",".join(str(v) for v in r) + "\n")
    geo = dict(w=W, h=H, lon0=LON0, latTop=LAT_TOP, k=round(K, 6), indonesia=indo, neighbours=other, provinces=provinces,
               source="Natural Earth (public domain)")
    OUT.write_text("/* Map outlines built by tools/build_map.py from Natural Earth (public domain). */\n"
                   "window.GEO = " + json.dumps(geo, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("geo.js", round(OUT.stat().st_size / 1024), "KB", "| viewBox", W, "x", H)


if __name__ == "__main__":
    main()
