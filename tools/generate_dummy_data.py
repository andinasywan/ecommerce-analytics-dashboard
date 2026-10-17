"""
Generator data dummy untuk dashboard sell-out & forecast.

Semua nama brand, SKU, toko, ID pesanan, dan angka di sini FIKTIF. Yang ditiru hanya
bentuk datanya: ekspor pesanan marketplace per baris, toko yang terikat ke gudang,
produk bundle yang harus dipecah ke SKU komponen, serta pola musiman e-commerce
Indonesia (tanggal kembar 9.9, payday tanggal 25, puncak tengah malam saat flash sale).

Output:
  data/raw/orders_YYYY-MM.csv.gz   ekspor pesanan mentah per bulan (Feb-Sep 2026)
  data/master/sku_master.csv       SKU fisik + isi per karton
  data/master/item_convert.csv     item jual -> SKU komponen (pengganti sheet "master convert")
  data/master/store_map.csv        toko -> platform & gudang

Jalankan:  python tools/generate_dummy_data.py
"""
from __future__ import annotations

import calendar
import csv
import datetime as dt
import gzip
import math
from pathlib import Path

import numpy as np

SEED = 20260917
rng = np.random.default_rng(SEED)
ROOT = Path(__file__).resolve().parents[1]
RAW, MASTER = ROOT / "data" / "raw", ROOT / "data" / "master"
RAW.mkdir(parents=True, exist_ok=True)
MASTER.mkdir(parents=True, exist_ok=True)

MONTHS = [(2026, m) for m in range(2, 10)]  # Feb-Sep 2026; Feb-Apr jadi riwayat awal forecast
KIDS, ADULT = "Anak & Keluarga", "Dewasa & Spesialis"

# ---------------------------------------------------------------- katalog fiktif
# brand: kategori, bobot dasar, tren per bulan (Feb..Sep)
BRANDS = {
    "Tumbuhku":     (KIDS,  1.00, [0.92, 0.95, 0.97, 1.00, 1.03, 1.02, 1.06, 1.10]),
    "Imunio Kids":  (KIDS,  0.78, [1.18, 1.12, 0.98, 0.94, 0.92, 0.95, 1.00, 1.14]),
    "Kalsigi":      (KIDS,  0.46, [0.85, 0.88, 0.92, 0.97, 1.02, 1.08, 1.15, 1.22]),
    "MaduCilik":    (KIDS,  0.30, [1.12, 1.10, 1.05, 1.00, 0.95, 0.90, 0.86, 0.82]),
    "NutriSusu":    (KIDS,  0.42, [0.95, 1.05, 1.00, 0.98, 1.00, 1.02, 1.04, 1.03]),
    "Respira Kids": (KIDS,  0.20, [1.45, 1.30, 1.00, 0.82, 0.74, 0.72, 0.80, 1.10]),
    "Dermaya":      (ADULT, 0.70, [0.80, 0.86, 0.90, 0.97, 1.04, 1.10, 1.18, 1.28]),
    "Fortivit":     (ADULT, 0.66, [1.15, 1.10, 0.96, 0.92, 0.90, 0.93, 0.98, 1.08]),
    "Lancara":      (ADULT, 0.40, [0.98, 1.10, 1.02, 0.98, 1.00, 0.99, 1.01, 1.03]),
    "Tidura":      (ADULT, 0.18, [0.90, 0.92, 0.95, 1.00, 1.02, 1.04, 1.06, 1.08]),
    "Sendiva":       (ADULT, 0.16, [1.00, 1.00, 0.98, 1.00, 1.02, 1.01, 1.03, 1.04]),
    "Optivisa":     (ADULT, 0.10, [0.96, 0.98, 1.00, 1.00, 1.02, 1.03, 1.02, 1.05]),
}

# SKU fisik: kode, nama, brand, harga list (Rp), bobot dalam brand, isi per karton
SKUS = [
    ("NV-1101", "Tumbuhku Sirup Multivitamin Anak 60 ml",          "Tumbuhku",     39500, 0.30, 48),
    ("NV-1102", "Tumbuhku Sirup Multivitamin Anak 120 ml",         "Tumbuhku",     64900, 0.26, 48),
    ("NV-1103", "Tumbuhku Tablet Hisap Rasa Jeruk isi 20",         "Tumbuhku",     45900, 0.30, 60),
    ("NV-1104", "Tumbuhku Emulsion Nafsu Makan 200 ml",            "Tumbuhku",     72500, 0.14, 24),
    ("NV-1201", "Imunio Kids Sirup Daya Tahan Tubuh 60 ml",        "Imunio Kids",  38900, 0.42, 48),
    ("NV-1202", "Imunio Kids Sirup Daya Tahan Tubuh 120 ml",       "Imunio Kids",  61500, 0.33, 48),
    ("NV-1203", "Imunio Kids Gummy Vitamin C isi 30",              "Imunio Kids",  79000, 0.25, 36),
    ("NV-1301", "Kalsigi Tablet Kunyah Kalsium Anak isi 30",       "Kalsigi",      68500, 0.55, 60),
    ("NV-1302", "Kalsigi Gummy Kalsium + D3 isi 30",               "Kalsigi",      84900, 0.45, 36),
    ("NV-1401", "MaduCilik Madu Anak Rasa Jeruk 100 ml",           "MaduCilik",    36500, 0.55, 48),
    ("NV-1402", "MaduCilik Madu Anak Rasa Jeruk 200 ml",           "MaduCilik",    58900, 0.45, 24),
    ("NV-1501", "NutriSusu Kids Susu Pertumbuhan 400 g",           "NutriSusu",   118000, 0.62, 12),
    ("NV-1502", "NutriSusu Kids Susu Pertumbuhan 800 g",           "NutriSusu",   214000, 0.38, 12),
    ("NV-1601", "Respira Kids Sirup Batuk Pilek 60 ml",            "Respira Kids", 34900, 1.00, 48),
    ("NV-2101", "Dermaya Lotion Kulit Sensitif 200 ml",            "Dermaya",     146000, 0.44, 24),
    ("NV-2102", "Dermaya Gel Pelembab Wajah 30 g",                 "Dermaya",      98500, 0.36, 48),
    ("NV-2103", "Dermaya Sabun Cair Lembut 250 ml",                "Dermaya",      69900, 0.20, 24),
    ("NV-2201", "Fortivit Kaplet Daya Tahan Tubuh 1 strip isi 10", "Fortivit",     31500, 0.48, 100),
    ("NV-2202", "Fortivit Kaplet Daya Tahan Tubuh botol isi 30",   "Fortivit",    168000, 0.30, 24),
    ("NV-2203", "Fortivit Effervescent Vitamin C isi 10",          "Fortivit",     47500, 0.22, 48),
    ("NV-2301", "Lancara Kapsul Serat Pencernaan 1 strip isi 10",  "Lancara",      26500, 0.64, 100),
    ("NV-2302", "Lancara Kapsul Serat Pencernaan botol isi 30",    "Lancara",      72000, 0.36, 48),
    ("NV-2401", "Tidura Kapsul Tidur Nyenyak isi 10",             "Tidura",      71500, 1.00, 60),
    ("NV-2501", "Sendiva Tablet Sendi & Tulang isi 30",             "Sendiva",      186000, 1.00, 24),
    ("NV-2601", "Optivisa Kapsul Kesehatan Mata isi 30",           "Optivisa",    209000, 1.00, 24),
]
SKU = {s[0]: s for s in SKUS}

# Item jual yang bukan SKU tunggal: multipack & bundle (harus dipecah sebelum hitung stok)
PACKS = [  # kode item, nama, [(sku, qty)], bobot relatif terhadap brand utama
    ("NV-1103-B3", "Tumbuhku Tablet Hisap isi 20 - Paket Hemat 3 Pcs", [("NV-1103", 3)], 0.10),
    ("NV-1201-B2", "Imunio Kids Sirup 60 ml - Paket isi 2",            [("NV-1201", 2)], 0.08),
    ("NV-1301-B3", "Kalsigi Tablet Kunyah isi 30 - Paket 3 Botol",     [("NV-1301", 3)], 0.10),
    ("NV-2201-BX", "Fortivit Kaplet - 1 Box isi 10 Strip",             [("NV-2201", 10)], 0.12),
    ("NV-2301-BX", "Lancara Kapsul - 1 Box isi 10 Strip",              [("NV-2301", 10)], 0.10),
    ("BDL-TINGGI", "Paket Tinggi Kuat (Tumbuhku Tablet + Kalsigi Tablet)",
        [("NV-1103", 1), ("NV-1301", 1)], 0.16),
    ("BDL-IMUN",   "Paket Imun Sekeluarga (Imunio Kids 120 ml + Fortivit Botol)",
        [("NV-1202", 1), ("NV-2202", 1)], 0.10),
    ("BDL-NAFSU",  "Paket Lahap (Tumbuhku Emulsion + MaduCilik 200 ml)",
        [("NV-1104", 1), ("NV-1402", 1)], 0.12),
    ("BDL-GLOW",   "Paket Kulit Lembap (Dermaya Lotion + Dermaya Sabun Cair)",
        [("NV-2101", 1), ("NV-2103", 1)], 0.14),
    ("BDL-BATUK3", "Paket Musim Hujan (Respira Kids 60 ml + Imunio Kids 60 ml + MaduCilik 100 ml)",
        [("NV-1601", 1), ("NV-1201", 1), ("NV-1401", 1)], 0.10),
]

WAREHOUSES = ["Jakarta", "Surabaya", "Medan", "Makassar", "Semarang"]
WH_SHARE = {"Jakarta": 0.50, "Surabaya": 0.23, "Medan": 0.11, "Makassar": 0.08, "Semarang": 0.08}

# toko: nama, platform, gudang, brand yang dijual (None = semua)
SHOPEE_KIDS = ["Tumbuhku", "Imunio Kids", "Kalsigi", "MaduCilik", "NutriSusu", "Respira Kids"]
SHOPEE_SKIN = ["Dermaya", "Sendiva", "Optivisa"]
SHOPEE_FORT = ["Fortivit", "Lancara", "Tidura"]
STORES = []
for wh in WAREHOUSES:
    STORES.append((f"TikTok Shop {wh}", "TikTok Shop", wh, None))
for wh in ["Jakarta", "Surabaya", "Medan", "Makassar"]:
    STORES.append((f"Shopee Tumbuhku Official {wh}", "Shopee", wh, SHOPEE_KIDS))
for wh in ["Jakarta", "Surabaya", "Medan"]:
    STORES.append((f"Shopee Dermaya Official {wh}", "Shopee", wh, SHOPEE_SKIN))
for wh in ["Jakarta", "Surabaya", "Makassar"]:
    STORES.append((f"Shopee Fortivit Official {wh}", "Shopee", wh, SHOPEE_FORT))
for wh in ["Jakarta", "Surabaya"]:
    STORES.append((f"Tokopedia {wh}", "Tokopedia", wh, None))
STORES.append(("Lazada Jakarta", "Lazada", "Jakarta", None))
STORES.append(("Blibli Jakarta", "Blibli", "Jakarta", None))

# porsi GMV platform per bulan (Feb..Sep): TikTok Shop naik, Shopee & Tokopedia turun pelan
PLATFORM_SHARE = {
    "TikTok Shop": [0.35, 0.36, 0.37, 0.38, 0.40, 0.41, 0.43, 0.45],
    "Shopee":      [0.47, 0.47, 0.46, 0.46, 0.45, 0.44, 0.43, 0.42],
    "Tokopedia":   [0.12, 0.11, 0.11, 0.10, 0.09, 0.09, 0.08, 0.08],
    "Lazada":      [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.04],
    "Blibli":      [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
}
# kepekaan platform terhadap hari kampanye
CAMPAIGN_LIFT = {"TikTok Shop": 2.7, "Shopee": 3.3, "Tokopedia": 2.2, "Lazada": 2.9, "Blibli": 1.8}

BASE_ORDERS = {2: 31500, 3: 36500, 4: 33800, 5: 36200, 6: 38100, 7: 37400, 8: 41800, 9: 46500}

# kejadian khusus untuk cerita forecast: (bulan, kode SKU/brand, platform|None, gudang|None, pengali)
EVENTS = [
    (8, "NV-1302", "TikTok Shop", None, 2.9),   # Kalsigi Gummy viral di TikTok bulan Agustus
    (9, "NV-1302", "TikTok Shop", None, 1.35),  # ...lalu mereda
    (7, "NV-2202", None, "Medan", 0.22),        # Fortivit botol kosong stok di Medan, Juli
    (9, "NV-2101", "TikTok Shop", None, 1.45),  # Dermaya Lotion masuk program affiliate, September
    (6, "BDL-TINGGI", None, None, 1.6),         # bundle baru dipromosikan bulan Juni
]


def item_catalog():
    """Item jual = SKU tunggal + multipack + bundle, dengan harga & bobot dasar."""
    items = []
    for code, name, brand, price, w, _ in SKUS:
        items.append(dict(code=code, name=name, brand=brand, price=price, w=w, comp=[(code, 1)]))
    for code, name, comp, w in PACKS:
        brand = SKU[comp[0][0]][2]
        list_price = sum(SKU[s][3] * q for s, q in comp)
        disc = 0.90 if len(comp) == 1 else 0.88
        items.append(dict(code=code, name=name, brand=brand, price=round(list_price * disc, -2), w=w, comp=comp))
    return items


ITEMS = item_catalog()


def day_multiplier(d: dt.date):
    """Pengali volume harian & label kampanye."""
    m = 1.0
    tag = ""
    if d.day == d.month:                          # tanggal kembar 2.2, 3.3, ... 9.9
        tag = "twin"
    elif d.day == 25:
        m, tag = 1.75, "payday"
    elif d.day in (24, 26):
        m = 1.18
    elif d.day in (1, 2):
        m = 1.12
    if d.month == 8 and d.day == 17:
        m, tag = 1.45, "hut"
    if d.month == 3 and 18 <= d.day <= 23:        # libur Idulfitri 2026: kurir libur, pesanan turun
        m = 0.55
    if d.month == 3 and 5 <= d.day <= 15:         # belanja Ramadan
        m *= 1.18
    if d.weekday() == 6:
        m *= 0.94
    return m, tag


def hour_weights(tag):
    base = np.array([4.0, 1.9, 1.3, 1.2, 1.5, 2.2, 3.0, 3.6, 4.2, 4.6, 4.7, 4.5,
                     4.8, 4.3, 4.0, 3.7, 3.6, 3.8, 4.4, 5.0, 5.6, 5.9, 5.1, 3.6])
    if tag in ("twin", "payday"):
        base[0] *= 4.2
        base[1] *= 1.8
        base[12] *= 1.4
        base[20:22] *= 1.25
    return base / base.sum()


def order_id(platform, d, n):
    ymd = d.strftime("%y%m%d")
    if platform == "TikTok Shop":
        return [f"58{int(x):016d}" for x in rng.integers(10**15, 10**16 - 1, n)]
    if platform == "Shopee":
        letters = np.array(list("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"))
        return [ymd + "".join(rng.choice(letters, 8)) for _ in range(n)]
    if platform == "Tokopedia":
        return [f"INV/{d:%Y%m%d}/MPL/{int(x)}" for x in rng.integers(10**9, 10**10 - 1, n)]
    if platform == "Lazada":
        return [f"{int(x)}" for x in rng.integers(10**14, 10**15 - 1, n)]
    return [f"BLI-{ymd}-{int(x)}" for x in rng.integers(10**6, 10**7 - 1, n)]


def store_item_weights(store, month_idx, month):
    name, platform, wh, allowed = store
    w = np.zeros(len(ITEMS))
    for i, it in enumerate(ITEMS):
        if allowed is not None and it["brand"] not in allowed:
            continue
        b = BRANDS[it["brand"]]
        val = it["w"] * b[1] * b[2][month_idx]
        for (em, code, ep, ewh, mult) in EVENTS:
            # stok kosong juga menahan bundle yang memakai SKU itu
            hit = code == it["code"] or (mult < 1 and any(c == code for c, _ in it["comp"]))
            if em == month and hit and (ep is None or ep == platform) and (ewh is None or ewh == wh):
                val *= mult
        if platform == "TikTok Shop" and it["brand"] in ("Dermaya", "Kalsigi"):
            val *= 1.25                          # brand yang kuat di konten video
        if platform == "Shopee" and it["code"].startswith("BDL-"):
            val *= 1.2
        w[i] = val
    return w


def main():
    # noise SKU x bulan supaya forecast tidak sempurna
    month_noise = {(it["code"], m): float(rng.lognormal(0, 0.09)) for it in ITEMS for _, m in MONTHS}
    store_noise = {(s[0], m): float(rng.lognormal(0, 0.05)) for s in STORES for _, m in MONTHS}

    fields = ["order_id", "order_datetime", "order_date", "store", "item_code", "item_name",
              "brand", "category", "qty", "gmv", "status"]
    for mi, (y, mo) in enumerate(MONTHS):
        rows = []
        days = calendar.monthrange(y, mo)[1]
        # porsi tiap toko: porsi platform x porsi gudang (dinormalkan dalam platform)
        st_w = []
        for s in STORES:
            plat = s[1]
            same = [x for x in STORES if x[1] == plat]
            wh_norm = sum(WH_SHARE[x[2]] for x in same)
            st_w.append(PLATFORM_SHARE[plat][mi] * WH_SHARE[s[2]] / wh_norm * store_noise[(s[0], mo)])
        st_w = np.array(st_w)
        st_w /= st_w.sum()
        item_w = {}
        for s in STORES:
            w = store_item_weights(s, mi, mo) * np.array([month_noise[(it["code"], mo)] for it in ITEMS])
            item_w[s[0]] = w / w.sum()

        for day in range(1, days + 1):
            d = dt.date(y, mo, day)
            mult, tag = day_multiplier(d)
            total = BASE_ORDERS[mo] / days * mult * rng.lognormal(0, 0.06)
            hw = hour_weights(tag)
            for si, s in enumerate(STORES):
                lift = CAMPAIGN_LIFT[s[1]] if tag == "twin" else 1.0
                n = rng.poisson(total * st_w[si] * lift)
                if n == 0:
                    continue
                ids = order_id(s[1], d, n)
                hours = rng.choice(24, n, p=hw)
                mins = rng.integers(0, 60, n)
                secs = rng.integers(0, 60, n)
                # 6% pesanan berisi 2 item berbeda
                n_lines = np.where(rng.random(n) < 0.06, 2, 1)
                for k in range(n):
                    ts = f"{d:%Y-%m-%d} {hours[k]:02d}:{mins[k]:02d}:{secs[k]:02d}"
                    r = rng.random()
                    if d >= dt.date(2026, 9, 28) and r < 0.05 + 0.10 * (d.day - 27):
                        status = "Dalam pengiriman"
                    elif r < 0.038:
                        status = "Batal"
                    elif r < 0.050:
                        status = "Retur"
                    else:
                        status = "Selesai"
                    picks = rng.choice(len(ITEMS), n_lines[k], replace=False, p=item_w[s[0]])
                    for p in picks:
                        it = ITEMS[p]
                        q = int(rng.choice([1, 2, 3, 4, 5, 6], p=[0.80, 0.125, 0.045, 0.015, 0.008, 0.007]))
                        disc = rng.uniform(0.16, 0.32) if tag in ("twin", "payday") else rng.uniform(0.03, 0.15)
                        gmv = int(round(it["price"] * q * (1 - disc) + rng.normal(0, 400)))
                        rows.append([ids[k], ts, d.isoformat(), s[0], it["code"], it["name"], it["brand"],
                                     BRANDS[it["brand"]][0], q, max(gmv, 1000), status])
        rows.sort(key=lambda r: r[1], reverse=True)   # ekspor marketplace: terbaru di atas
        out = RAW / f"orders_{y}-{mo:02d}.csv.gz"
        with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(fields)
            w.writerows(rows)
        print(f"{out.name}: {len(rows):,} baris")

    with open(MASTER / "sku_master.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sku", "sku_name", "brand", "category", "list_price", "isi_per_karton"])
        for code, name, brand, price, _, box in SKUS:
            w.writerow([code, name, brand, BRANDS[brand][0], price, box])
    with open(MASTER / "item_convert.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["item_code", "item_name", "sku_1", "qty_1", "sku_2", "qty_2", "sku_3", "qty_3"])
        for it in ITEMS:
            comp = it["comp"] + [("", "")] * (3 - len(it["comp"]))
            w.writerow([it["code"], it["name"]] + [v for c in comp for v in c])
    with open(MASTER / "store_map.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["store", "platform", "warehouse"])
        for s in STORES:
            w.writerow(s[:3])


if __name__ == "__main__":
    main()
