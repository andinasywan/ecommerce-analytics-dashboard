"""
Dummy data generator for the e-commerce analytics dashboard.

Every brand, SKU, store, order ID, voucher code and number produced here is FICTIONAL.
Only the *shape* of the data is borrowed from real marketplace work: line-level order exports,
stores tied to shipping warehouses, bundles that must be exploded into physical SKUs, store
vouchers on campaign days, platform rebates, daily traffic reports, and Indonesian e-commerce
seasonality (twin-date sales such as 9.9, payday on the 25th, midnight flash sales).

Outputs
  data/raw/orders_YYYY-MM.csv.gz     line-level order export per month (Feb-Sep 2026)
  data/raw/traffic_daily.csv.gz      daily traffic report per store
  data/raw/platform_rebates.csv      platform co-funding rebates on campaign days
  data/master/sku_master.csv         physical SKUs + units per carton
  data/master/item_convert.csv       sellable item -> component SKUs (bundles, multipacks)
  data/master/store_map.csv          store -> platform, channel, warehouse
  data/master/vouchers.csv           store vouchers set up for each campaign day

Needs data/master/provinces.csv (built by tools/build_map.py) for the buyer's province on each order.

Run:  python tools/generate_dummy_data.py
"""
from __future__ import annotations

import calendar
import csv
import datetime as dt
import gzip
from pathlib import Path

import numpy as np

SEED = 20260917
rng = np.random.default_rng(SEED)
rng_geo = np.random.default_rng(SEED + 7)   # separate stream: adding buyer provinces leaves every other number unchanged
ROOT = Path(__file__).resolve().parents[1]
RAW, MASTER = ROOT / "data" / "raw", ROOT / "data" / "master"
RAW.mkdir(parents=True, exist_ok=True)
MASTER.mkdir(parents=True, exist_ok=True)

MONTHS = [(2026, m) for m in range(2, 10)]  # Feb-Sep 2026; Feb-Apr only seed the forecast history
KIDS, ADULT = "Kids & Family", "Adult & Specialty"

# ---------------------------------------------------------------- fictional catalogue
# brand: category, base weight, monthly trend (Feb..Sep)
BRANDS = {
    "Growlie":        (KIDS,  1.00, [0.92, 0.95, 0.97, 1.00, 1.03, 1.02, 1.06, 1.10]),
    "Immunio Kids":   (KIDS,  0.78, [1.18, 1.12, 0.98, 0.94, 0.92, 0.95, 1.00, 1.14]),
    "Calsee":         (KIDS,  0.46, [0.85, 0.88, 0.92, 0.97, 1.02, 1.08, 1.15, 1.22]),
    "Honeyo Kids":    (KIDS,  0.30, [1.12, 1.10, 1.05, 1.00, 0.95, 0.90, 0.86, 0.82]),
    "NutriMilk Kids": (KIDS,  0.42, [0.95, 1.05, 1.00, 0.98, 1.00, 1.02, 1.04, 1.03]),
    "Respira Kids":   (KIDS,  0.20, [1.45, 1.30, 1.00, 0.82, 0.74, 0.72, 0.80, 1.10]),
    "Dermaya":        (ADULT, 0.70, [0.80, 0.86, 0.90, 0.97, 1.04, 1.10, 1.18, 1.28]),
    "Fortivit":       (ADULT, 0.66, [1.15, 1.10, 0.96, 0.92, 0.90, 0.93, 0.98, 1.08]),
    "Lancara":        (ADULT, 0.40, [0.98, 1.10, 1.02, 0.98, 1.00, 0.99, 1.01, 1.03]),
    "Somnia":         (ADULT, 0.18, [0.90, 0.92, 0.95, 1.00, 1.02, 1.04, 1.06, 1.08]),
    "Flexora":        (ADULT, 0.16, [1.00, 1.00, 0.98, 1.00, 1.02, 1.01, 1.03, 1.04]),
    "Optivisa":       (ADULT, 0.10, [0.96, 0.98, 1.00, 1.00, 1.02, 1.03, 1.02, 1.05]),
}

# physical SKU: code, name, brand, list price (Rp), weight within brand, units per carton
SKUS = [
    ("NV-1101", "Growlie Kids Multivitamin Syrup 60 ml",        "Growlie",         39500, 0.30, 48),
    ("NV-1102", "Growlie Kids Multivitamin Syrup 120 ml",       "Growlie",         64900, 0.26, 48),
    ("NV-1103", "Growlie Orange Chewable Tablets x20",          "Growlie",         45900, 0.30, 60),
    ("NV-1104", "Growlie Appetite Emulsion 200 ml",             "Growlie",         72500, 0.14, 24),
    ("NV-1201", "Immunio Kids Immune Syrup 60 ml",              "Immunio Kids",    38900, 0.42, 48),
    ("NV-1202", "Immunio Kids Immune Syrup 120 ml",             "Immunio Kids",    61500, 0.33, 48),
    ("NV-1203", "Immunio Kids Vitamin C Gummies x30",           "Immunio Kids",    79000, 0.25, 36),
    ("NV-1301", "Calsee Kids Calcium Chewables x30",            "Calsee",          68500, 0.55, 60),
    ("NV-1302", "Calsee Calcium + D3 Gummies x30",              "Calsee",          84900, 0.45, 36),
    ("NV-1401", "Honeyo Kids Orange Honey 100 ml",              "Honeyo Kids",     36500, 0.55, 48),
    ("NV-1402", "Honeyo Kids Orange Honey 200 ml",              "Honeyo Kids",     58900, 0.45, 24),
    ("NV-1501", "NutriMilk Kids Growing-up Milk 400 g",         "NutriMilk Kids", 118000, 0.62, 12),
    ("NV-1502", "NutriMilk Kids Growing-up Milk 800 g",         "NutriMilk Kids", 214000, 0.38, 12),
    ("NV-1601", "Respira Kids Cough & Cold Syrup 60 ml",        "Respira Kids",    34900, 1.00, 48),
    ("NV-2101", "Dermaya Sensitive Skin Lotion 200 ml",         "Dermaya",        146000, 0.44, 24),
    ("NV-2102", "Dermaya Face Moisturizing Gel 30 g",           "Dermaya",         98500, 0.36, 48),
    ("NV-2103", "Dermaya Gentle Body Wash 250 ml",              "Dermaya",         69900, 0.20, 24),
    ("NV-2201", "Fortivit Immune Caplets, strip of 10",         "Fortivit",        31500, 0.48, 100),
    ("NV-2202", "Fortivit Immune Caplets, bottle of 30",        "Fortivit",       168000, 0.30, 24),
    ("NV-2203", "Fortivit Vitamin C Effervescent x10",          "Fortivit",        47500, 0.22, 48),
    ("NV-2301", "Lancara Fiber Capsules, strip of 10",          "Lancara",         26500, 0.64, 100),
    ("NV-2302", "Lancara Fiber Capsules, bottle of 30",         "Lancara",         72000, 0.36, 48),
    ("NV-2401", "Somnia Sleep Capsules x10",                    "Somnia",          71500, 1.00, 60),
    ("NV-2501", "Flexora Joint & Bone Tablets x30",             "Flexora",        186000, 1.00, 24),
    ("NV-2601", "Optivisa Eye Health Capsules x30",             "Optivisa",       209000, 1.00, 24),
]
SKU = {s[0]: s for s in SKUS}

# sellable items that are not a single SKU: multipacks & bundles (must be exploded before stock counts)
PACKS = [  # item code, name, [(sku, qty)], weight relative to the main brand
    ("NV-1103-B3", "Growlie Chewable Tablets x20 - Value Pack of 3", [("NV-1103", 3)], 0.10),
    ("NV-1201-B2", "Immunio Kids Syrup 60 ml - Pack of 2",           [("NV-1201", 2)], 0.08),
    ("NV-1301-B3", "Calsee Kids Chewables x30 - Pack of 3",          [("NV-1301", 3)], 0.10),
    ("NV-2201-BX", "Fortivit Immune Caplets - Box of 10 Strips",     [("NV-2201", 10)], 0.12),
    ("NV-2301-BX", "Lancara Fiber Capsules - Box of 10 Strips",      [("NV-2301", 10)], 0.10),
    ("BDL-TALL",     "Tall & Strong Bundle (Growlie Chewables + Calsee Chewables)",
        [("NV-1103", 1), ("NV-1301", 1)], 0.16),
    ("BDL-IMMUNE",   "Family Immunity Bundle (Immunio Kids 120 ml + Fortivit Bottle)",
        [("NV-1202", 1), ("NV-2202", 1)], 0.10),
    ("BDL-APPETITE", "Healthy Appetite Bundle (Growlie Emulsion + Honeyo Kids 200 ml)",
        [("NV-1104", 1), ("NV-1402", 1)], 0.12),
    ("BDL-GLOW",     "Soft Skin Bundle (Dermaya Lotion + Dermaya Body Wash)",
        [("NV-2101", 1), ("NV-2103", 1)], 0.14),
    ("BDL-RAINY",    "Rainy Season Bundle (Respira Kids 60 ml + Immunio Kids 60 ml + Honeyo Kids 100 ml)",
        [("NV-1601", 1), ("NV-1201", 1), ("NV-1401", 1)], 0.10),
]

WAREHOUSES = ["Jakarta", "Surabaya", "Medan", "Makassar", "Semarang"]
WH_SHARE = {"Jakarta": 0.50, "Surabaya": 0.23, "Medan": 0.11, "Makassar": 0.08, "Semarang": 0.08}

# stores: name, platform, channel (shop account used in campaign & voucher reports), warehouse, brands sold
SHOPEE_KIDS = ["Growlie", "Immunio Kids", "Calsee", "Honeyo Kids", "NutriMilk Kids", "Respira Kids"]
SHOPEE_SKIN = ["Dermaya", "Flexora", "Optivisa"]
SHOPEE_FORT = ["Fortivit", "Lancara", "Somnia"]
STORES = []
for wh in WAREHOUSES:
    STORES.append((f"TikTok Shop {wh}", "TikTok Shop", "TikTok Shop", wh, None))
for wh in ["Jakarta", "Surabaya", "Medan", "Makassar"]:
    STORES.append((f"Shopee Growlie Official {wh}", "Shopee", "Shopee Growlie Official", wh, SHOPEE_KIDS))
for wh in ["Jakarta", "Surabaya", "Medan"]:
    STORES.append((f"Shopee Dermaya Official {wh}", "Shopee", "Shopee Dermaya Official", wh, SHOPEE_SKIN))
for wh in ["Jakarta", "Surabaya", "Makassar"]:
    STORES.append((f"Shopee Fortivit Official {wh}", "Shopee", "Shopee Fortivit Official", wh, SHOPEE_FORT))
for wh in ["Jakarta", "Surabaya"]:
    STORES.append((f"Tokopedia {wh}", "Tokopedia", "Tokopedia", wh, None))
STORES.append(("Lazada Jakarta", "Lazada", "Lazada", "Jakarta", None))
STORES.append(("Blibli Jakarta", "Blibli", "Blibli", "Jakarta", None))

# GMV share per platform per month (Feb..Sep): TikTok Shop gains, Shopee and Tokopedia ease off
PLATFORM_SHARE = {
    "TikTok Shop": [0.35, 0.36, 0.37, 0.38, 0.40, 0.41, 0.43, 0.45],
    "Shopee":      [0.47, 0.47, 0.46, 0.46, 0.45, 0.44, 0.43, 0.42],
    "Tokopedia":   [0.12, 0.11, 0.11, 0.10, 0.09, 0.09, 0.08, 0.08],
    "Lazada":      [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.04],
    "Blibli":      [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
}
CAMPAIGN_LIFT = {"TikTok Shop": 2.7, "Shopee": 3.3, "Tokopedia": 2.2, "Lazada": 2.9, "Blibli": 1.8}
BASE_ORDERS = {2: 31500, 3: 36500, 4: 33800, 5: 36200, 6: 38100, 7: 37400, 8: 41800, 9: 46500}

# special events that make the forecast story interesting: (month, item/SKU, platform|None, warehouse|None, multiplier)
EVENTS = [
    (8, "NV-1302", "TikTok Shop", None, 2.9),   # Calsee Gummies go viral on TikTok in August
    (9, "NV-1302", "TikTok Shop", None, 1.35),  # ...then cool down
    (7, "NV-2202", None, "Medan", 0.22),        # Fortivit bottle out of stock in Medan in July
    (9, "NV-2101", "TikTok Shop", None, 1.45),  # Dermaya Lotion joins an affiliate programme in September
    (6, "BDL-TALL", None, None, 1.6),           # new bundle pushed in June
]

# TikTok order source mix (LIVE, Video, Product card) per month, LIVE growing
TT_SOURCE = ["LIVE", "Video", "Product card"]
TT_MIX = [[0.26, 0.44, 0.30], [0.27, 0.44, 0.29], [0.29, 0.43, 0.28], [0.31, 0.42, 0.27],
          [0.33, 0.41, 0.26], [0.35, 0.40, 0.25], [0.38, 0.38, 0.24], [0.41, 0.36, 0.23]]

# store vouchers per channel: prefix, [(tier, min spend, discount, base quota on twin date)]
VOUCHERS = {
    "Shopee Growlie Official":  ("GRW", [("A", 75000, 7500, 1300), ("B", 150000, 18000, 420)]),
    "Shopee Dermaya Official":  ("DMY", [("A", 150000, 12000, 600), ("B", 250000, 25000, 160)]),
    "Shopee Fortivit Official": ("FTV", [("A", 100000, 8000, 520), ("B", 200000, 18000, 150)]),
    "TikTok Shop":              ("TTS", [("A", 100000, 8000, 1500), ("B", 160000, 14500, 520), ("L", 0, 5000, 700)]),
}
REBATE_RATE = {"Shopee": (0.28, 0.48), "TikTok Shop": (0.18, 0.34)}

# buyer location: rough population (millions, 2020 census; North Kalimantan sits inside East Kalimantan in the
# map source) x an online-shopping factor by region. Approximate public figures, used only to shape dummy demand.
POP = {"Jakarta": 10.6, "West Java": 48.3, "Banten": 11.9, "Central Java": 36.5, "East Java": 41.0, "Yogyakarta": 3.7,
       "Bali": 4.3, "North Sumatra": 14.8, "Aceh": 5.3, "West Sumatra": 5.5, "Riau": 6.4, "Riau Islands": 2.1, "Jambi": 3.5,
       "South Sumatra": 8.5, "Bengkulu": 2.0, "Lampung": 9.0, "Bangka Belitung": 1.5, "West Kalimantan": 5.4,
       "Central Kalimantan": 2.7, "South Kalimantan": 4.1, "East Kalimantan": 4.5, "South Sulawesi": 9.1,
       "Southeast Sulawesi": 2.6, "Central Sulawesi": 3.0, "North Sulawesi": 2.6, "Gorontalo": 1.2, "West Sulawesi": 1.4,
       "West Nusa Tenggara": 5.3, "East Nusa Tenggara": 5.3, "Maluku": 1.8, "North Maluku": 1.3, "Papua": 4.3, "West Papua": 1.1}
ONLINE = {"Jakarta": 2.2, "West Java": 1.3, "Banten": 1.3, "Yogyakarta": 1.3, "Bali": 1.2, "Central Java": 1.0, "East Java": 1.0}
REGION_ONLINE = {"Sumatra": 0.8, "Kalimantan": 0.8, "Sulawesi": 0.7, "Nusa Tenggara": 0.5, "Maluku": 0.4, "Papua": 0.4}
# share of a warehouse's orders that come from its own nearest-warehouse zone; the rest come from anywhere
LOCAL_SHARE = {"Jakarta": 0.48, "Surabaya": 0.62, "Medan": 0.72, "Makassar": 0.70, "Semarang": 0.55}


def province_sampler():
    rows = list(csv.DictReader(open(MASTER / "provinces.csv", encoding="utf-8")))
    names = [r["province"] for r in rows]

    def region(n):
        for k in REGION_ONLINE:
            if k in n or (k == "Sumatra" and n in ("Aceh", "Riau", "Riau Islands", "Jambi", "Bengkulu", "Lampung", "Bangka Belitung"))\
                    or (k == "Sulawesi" and n == "Gorontalo") or (k == "Papua" and n == "West Papua"):
                return REGION_ONLINE[k]
        return 1.0
    w = np.array([POP[n] * ONLINE.get(n, region(n)) for n in names])
    nearest = {r["province"]: r["nearest_warehouse"] for r in rows}
    national = w / w.sum()
    zone = {}
    for wh in WAREHOUSES:
        z = np.array([w[i] if nearest[n] == wh else 0 for i, n in enumerate(names)])
        zone[wh] = z / z.sum()

    def draw(wh):
        p = zone[wh] if rng_geo.random() < LOCAL_SHARE[wh] else national
        return names[int(rng_geo.choice(len(names), p=p))]
    return draw


def item_catalog():
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
    """Daily volume multiplier and campaign tag."""
    m, tag = 1.0, ""
    if d.day == d.month:                          # twin dates 2.2, 3.3, ... 9.9
        tag = "twin"
    elif d.day == 25:
        m, tag = 1.75, "payday"
    elif d.day in (24, 26):
        m = 1.18
    elif d.day in (1, 2):
        m = 1.12
    if d.month == 8 and d.day == 17:
        m, tag = 1.45, "independence"
    if d.month == 3 and 18 <= d.day <= 23:        # Eid holiday 2026: couriers off, orders dip
        m = 0.55
    if d.month == 3 and 5 <= d.day <= 15:         # Ramadan shopping
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


def order_id(platform, d):
    ymd = d.strftime("%y%m%d")
    if platform == "TikTok Shop":
        return f"58{int(rng.integers(10**15, 10**16 - 1)):016d}"
    if platform == "Shopee":
        return ymd + "".join(rng.choice(list("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"), 8))
    if platform == "Tokopedia":
        return f"INV/{d:%Y%m%d}/MPL/{int(rng.integers(10**9, 10**10 - 1))}"
    if platform == "Lazada":
        return str(int(rng.integers(10**14, 10**15 - 1)))
    return f"BLI-{ymd}-{int(rng.integers(10**6, 10**7 - 1))}"


def store_item_weights(store, month_idx, month):
    name, platform, channel, wh, allowed = store
    w = np.zeros(len(ITEMS))
    for i, it in enumerate(ITEMS):
        if allowed is not None and it["brand"] not in allowed:
            continue
        b = BRANDS[it["brand"]]
        val = it["w"] * b[1] * b[2][month_idx]
        for (em, code, ep, ewh, mult) in EVENTS:
            # a stock-out also holds back bundles that contain the SKU
            hit = code == it["code"] or (mult < 1 and any(c == code for c, _ in it["comp"]))
            if em == month and hit and (ep is None or ep == platform) and (ewh is None or ewh == wh):
                val *= mult
        if platform == "TikTok Shop" and it["brand"] in ("Dermaya", "Calsee"):
            val *= 1.25
        if platform == "Shopee" and it["code"].startswith("BDL-"):
            val *= 1.2
        w[i] = val
    return w


def traffic_row(d, store, orders, tag, mi):
    """Daily traffic report row for one store, consistent with the orders it received."""
    _, platform, *_ = store
    base_cvr = {"TikTok Shop": 0.021, "Shopee": 0.046, "Tokopedia": 0.031, "Lazada": 0.024, "Blibli": 0.017}[platform]
    cvr = base_cvr * (1.55 if tag == "twin" else 1.2 if tag == "payday" else 1.0) * (1 + 0.012 * mi) * rng.lognormal(0, 0.09)
    visitors = int(round(orders / cvr)) if orders else int(rng.poisson(25))
    clicks = int(round(visitors * rng.uniform(0.45, 0.6)))
    organic = int(round(clicks * rng.uniform(1.25, 1.45)))
    ads_share = (0.30 if platform == "TikTok Shop" else 0.18) * (1.3 if tag in ("twin", "payday") else 1.0) * rng.uniform(0.85, 1.15)
    ad_clicks = int(round(visitors * ads_share))
    ctr = rng.uniform(0.028, 0.042) * (0.9 if tag else 1.0)
    ad_impr = int(round(ad_clicks / ctr))
    return [d.isoformat(), store[0], organic, clicks, visitors, orders, ad_impr, ad_clicks]


def main():
    month_noise = {(it["code"], m): float(rng.lognormal(0, 0.09)) for it in ITEMS for _, m in MONTHS}
    store_noise = {(s[0], m): float(rng.lognormal(0, 0.05)) for s in STORES for _, m in MONTHS}

    fields = ["order_id", "order_datetime", "order_date", "store", "item_code", "item_name", "brand", "category",
              "qty", "gmv", "status", "tiktok_channel", "voucher_code", "voucher_discount", "buyer_province"]
    buyer_province = province_sampler()
    traffic, rebates, voucher_rows = [], [], []
    for mi, (y, mo) in enumerate(MONTHS):
        rows = []
        days = calendar.monthrange(y, mo)[1]
        st_w = []
        for s in STORES:
            plat = s[1]
            same = [x for x in STORES if x[1] == plat]
            wh_norm = sum(WH_SHARE[x[3]] for x in same)
            st_w.append(PLATFORM_SHARE[plat][mi] * WH_SHARE[s[3]] / wh_norm * store_noise[(s[0], mo)])
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
            orders = []           # one dict per order, lines inside
            placed = {}
            for si, s in enumerate(STORES):
                lift = CAMPAIGN_LIFT[s[1]] if tag == "twin" else 1.0
                n = int(rng.poisson(total * st_w[si] * lift))
                placed[s[0]] = n
                for _ in range(n):
                    ts = f"{d:%Y-%m-%d} {int(rng.choice(24, p=hw)):02d}:{int(rng.integers(0, 60)):02d}:{int(rng.integers(0, 60)):02d}"
                    r = rng.random()
                    if d >= dt.date(2026, 9, 28) and r < 0.05 + 0.10 * (d.day - 27):
                        status = "In transit"
                    elif r < 0.038:
                        status = "Cancelled"
                    elif r < 0.050:
                        status = "Returned"
                    else:
                        status = "Completed"
                    src = ""
                    if s[1] == "TikTok Shop":
                        mix = np.array(TT_MIX[mi]) * (np.array([1.6, 0.9, 0.8]) if tag else 1)
                        src = TT_SOURCE[int(rng.choice(3, p=mix / mix.sum()))]
                    lines = []
                    for p in rng.choice(len(ITEMS), 2 if rng.random() < 0.06 else 1, replace=False, p=item_w[s[0]]):
                        it = ITEMS[p]
                        q = int(rng.choice([1, 2, 3, 4, 5, 6], p=[0.80, 0.125, 0.045, 0.015, 0.008, 0.007]))
                        disc = rng.uniform(0.16, 0.32) if tag in ("twin", "payday") else rng.uniform(0.03, 0.15)
                        gmv = max(int(round(it["price"] * q * (1 - disc) + rng.normal(0, 400))), 1000)
                        lines.append([it, q, gmv])
                    orders.append(dict(id=order_id(s[1], d), ts=ts, store=s, status=status, src=src, lines=lines))

            # store vouchers on campaign days, redeemed in time order until the quota runs out
            if tag in ("twin", "payday"):
                label = f"{mo}.{mo}" if tag == "twin" else f"Payday {mo}/25"
                uptake = 0.72 if tag == "twin" else 0.55
                timeline = sorted(orders, key=lambda o: o["ts"])
                for o in timeline:
                    o["u"] = rng.random()

                def assign(quota):
                    """Give each order the biggest voucher it qualifies for that still has quota left."""
                    used = {c: 0 for c in quota}
                    picks = []
                    for o in timeline:
                        ch = o["store"][2]
                        if ch not in VOUCHERS or o["status"] == "Cancelled" or o["u"] >= uptake:
                            continue
                        value = sum(g for _, _, g in o["lines"])
                        prefix, tiers = VOUCHERS[ch]
                        best = None
                        for tier, min_spend, disc_amt, _ in tiers:
                            code = f"{prefix}{mo:02d}{day:02d}{tier}"
                            if tier == "L" and o["src"] != "LIVE":
                                continue
                            if value >= min_spend and used[code] < quota[code] and (best is None or disc_amt > best[1]):
                                best = (code, disc_amt)
                        if best:
                            used[best[0]] += 1
                            picks.append((o, best))
                    return used, picks

                codes = {f"{p}{mo:02d}{day:02d}{t[0]}": (ch, t) for ch, (p, ts) in VOUCHERS.items() for t in ts}
                demand, _ = assign({c: 10**9 for c in codes})
                # quota is set before the day starts; some tiers sell out, others are left over
                quota = {c: max(10, int(round(demand[c] * rng.uniform(0.6, 1.35), -1))) for c in codes}
                used, picks = assign(quota)
                cost = {}
                for o, best in picks:
                    o["voucher"] = best
                    cost[o["store"][2]] = cost.get(o["store"][2], 0) + best[1]
                for code, (ch, (tier, min_spend, disc_amt, _)) in codes.items():
                    kind = "LIVE voucher" if tier == "L" else "Store voucher"
                    spend = "no minimum spend" if min_spend == 0 else f"min. spend Rp{min_spend:,}"
                    voucher_rows.append([d.isoformat(), label, ch, code, f"{kind} {label} - {spend}, Rp{disc_amt:,} off",
                                         min_spend, disc_amt, quota[code]])
                for ch, c in cost.items():
                    lo, hi = REBATE_RATE["TikTok Shop" if ch == "TikTok Shop" else "Shopee"]
                    rebates.append([d.isoformat(), label, ch, int(round(c * rng.uniform(lo, hi), -2))])

            for o in orders:
                v = o.get("voucher")
                prov = buyer_province(o["store"][3])
                for k, (it, q, gmv) in enumerate(o["lines"]):
                    rows.append([o["id"], o["ts"], d.isoformat(), o["store"][0], it["code"], it["name"], it["brand"],
                                 BRANDS[it["brand"]][0], q, gmv, o["status"], o["src"],
                                 v[0] if v and k == 0 else "", v[1] if v and k == 0 else "", prov])
            for s in STORES:
                traffic.append(traffic_row(d, s, placed[s[0]], tag, mi))

        rows.sort(key=lambda r: r[1], reverse=True)   # marketplace exports list newest first
        out = RAW / f"orders_{y}-{mo:02d}.csv.gz"
        with gzip.open(out, "wt", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(fields)
            w.writerows(rows)
        print(f"{out.name}: {len(rows):,} lines")

    with gzip.open(RAW / "traffic_daily.csv.gz", "wt", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "store", "organic_views", "product_clicks", "visitors", "orders", "ad_impressions", "ad_clicks"])
        w.writerows(traffic)
    with open(RAW / "platform_rebates.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "campaign", "channel", "rebate"])
        w.writerows(rebates)
    with open(MASTER / "vouchers.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "campaign", "channel", "voucher_code", "voucher_name", "min_spend", "discount", "quota"])
        w.writerows(voucher_rows)
    with open(MASTER / "sku_master.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sku", "sku_name", "brand", "category", "list_price", "units_per_carton"])
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
        w.writerow(["store", "platform", "channel", "warehouse"])
        for s in STORES:
            w.writerow(s[:4])
    print("traffic rows", len(traffic), "| vouchers", len(voucher_rows), "| rebates", len(rebates))


if __name__ == "__main__":
    main()
