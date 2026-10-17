"""
Pipeline: raw exports -> data.js for the dashboard.

The same monthly steps that were done in Excel during the internship, rewritten in Python:
  1. Combine the monthly order exports.
  2. Drop cancelled and returned orders (valid order = Completed or In transit).
  3. Map each store to its platform, channel and shipping warehouse (store_map.csv).
  4. Sell-out recap: GMV, orders, units by platform / store / brand / item / day / hour.
  5. Campaign days (twin dates and payday): hour-by-hour GMV per channel, store voucher
     redemption, and platform rebates.
  6. Traffic: visitors, product clicks, ad impressions and conversion by store and day.
  7. Explode multipacks & bundles into physical SKUs (item_convert.csv), pivot units SKU x warehouse.
  8. Forecast month M = weighted average of the 3 previous months (0.5 / 0.3 / 0.2),
     compared with actuals -> accuracy (1 - WAPE) and bias.
  9. Next month's shipment plan: forecast x (1 + safety buffer), rounded up to full cartons.

Run:  python tools/build_dashboard_data.py
"""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW, MASTER, OUT = ROOT / "data" / "raw", ROOT / "data" / "master", ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

SHOW = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]   # months shown in the dashboard
NEXT = "2026-10"
WMA = [0.5, 0.3, 0.2]       # weights for M-1, M-2, M-3
BUFFER = 0.15               # safety stock on top of the forecast
TOLERANCE = 0.25            # |error| above 25% counts as a miss
PLATFORMS = ["TikTok Shop", "Shopee", "Tokopedia", "Lazada", "Blibli"]
CHANNELS = ["TikTok Shop", "Shopee Growlie Official", "Shopee Dermaya Official", "Shopee Fortivit Official",
            "Tokopedia", "Lazada", "Blibli"]
WAREHOUSES = ["Jakarta", "Surabaya", "Medan", "Makassar", "Semarang"]
VALID = ["Completed", "In transit"]
TT_SOURCES = ["LIVE", "Video", "Product card"]
MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def prev_month(m: str, k: int = 1) -> str:
    return str(pd.Period(m, "M") - k)


def campaign_days(m: str):
    """Twin date (e.g. 9.9) and payday (25th) of a month."""
    y, mo = int(m[:4]), int(m[5:])
    return [(dt.date(y, mo, mo), "twin", f"{mo}.{mo}"), (dt.date(y, mo, 25), "payday", f"Payday 25 {MONTH_ABBR[mo - 1]}")]


def main():
    raw = pd.concat([pd.read_csv(f, dtype={"order_id": str, "voucher_code": str}) for f in sorted(RAW.glob("orders_*.csv.gz"))],
                    ignore_index=True)
    raw["month"] = raw["order_date"].str[:7]
    raw["day"] = raw["order_date"].str[8:10].astype(int)
    raw["hour"] = raw["order_datetime"].str[11:13].astype(int)
    raw["voucher_discount"] = pd.to_numeric(raw["voucher_discount"], errors="coerce").fillna(0)

    stores = pd.read_csv(MASTER / "store_map.csv")
    skus = pd.read_csv(MASTER / "sku_master.csv")
    conv = pd.read_csv(MASTER / "item_convert.csv")
    vouchers = pd.read_csv(MASTER / "vouchers.csv")
    rebates = pd.read_csv(RAW / "platform_rebates.csv")
    traffic = pd.read_csv(RAW / "traffic_daily.csv.gz")
    raw = raw.merge(stores, on="store", how="left")
    assert raw["warehouse"].notna().all(), "a store is missing from store_map.csv"

    months_all = sorted(raw["month"].unique())
    valid = raw[raw["status"].isin(VALID)].copy()

    # ------------------------------------------------------------ sell-out
    sell = {}
    for m in months_all:
        r = raw[raw.month == m]
        v = valid[valid.month == m]
        days = int(pd.Period(m, "M").days_in_month)
        tot = dict(gmv=int(v.gmv.sum()), orders=int(v.order_id.nunique()), units=int(v.qty.sum()), lines=int(len(v)))
        stat = dict(raw_lines=int(len(r)), raw_orders=int(r.order_id.nunique()),
                    **{k.lower().replace(" ", "_"): int((r.status == k).sum()) for k in ["Completed", "In transit", "Cancelled", "Returned"]})
        plat = {p: [int(v.loc[v.platform == p, "gmv"].sum()), int(v.loc[v.platform == p, "order_id"].nunique()),
                    int(v.loc[v.platform == p, "qty"].sum())] for p in PLATFORMS}
        st = (v.groupby("store").agg(gmv=("gmv", "sum"), orders=("order_id", "nunique"), units=("qty", "sum"))
              .reindex(stores.store).fillna(0).astype(int).reset_index())
        br = v.groupby("brand").agg(gmv=("gmv", "sum"), orders=("order_id", "nunique"), units=("qty", "sum")).reset_index()
        it = v.groupby("item_code").agg(gmv=("gmv", "sum"), units=("qty", "sum"), orders=("order_id", "nunique")).reset_index()
        daily = v.pivot_table(index="day", columns="platform", values="gmv", aggfunc="sum").reindex(
            index=range(1, days + 1), columns=PLATFORMS).fillna(0).astype(int)
        d_orders = v.groupby("day")["order_id"].nunique().reindex(range(1, days + 1)).fillna(0).astype(int)
        hour = v.groupby("hour").gmv.sum().reindex(range(24)).fillna(0).astype(int)
        tt = v[v.platform == "TikTok Shop"].groupby("tiktok_channel").gmv.sum().reindex(TT_SOURCES).fillna(0).astype(int)
        sell[m] = dict(tot=tot, stat=stat, plat=plat, store=st.values.tolist(), brand=br.values.tolist(),
                       item=it.values.tolist(), daily=daily.values.tolist(), dailyOrders=d_orders.tolist(),
                       hour=hour.tolist(), ttSource=tt.tolist())

    # ------------------------------------------------------------ campaign days
    campaigns = []
    last = {}
    used_all = raw[raw.voucher_code.notna()]
    for m in months_all:
        days_n = int(pd.Period(m, "M").days_in_month)
        camp_dates = {c[0].day for c in campaign_days(m)} | ({17} if m.endswith("-08") else set())
        v_m = valid[valid.month == m]
        normal = v_m[~v_m.day.isin(camp_dates)]
        avg_day = normal.gmv.sum() / (days_n - len(camp_dates))
        for date, kind, label in campaign_days(m):
            iso = date.isoformat()
            v = valid[valid.order_date == iso]
            hourly = {}
            for ch in CHANNELS:
                vc = v[v.channel == ch]
                g = vc.groupby("hour").gmv.sum().reindex(range(24)).fillna(0).astype(int).tolist()
                o = vc.groupby("hour").order_id.nunique().reindex(range(24)).fillna(0).astype(int).tolist()
                hourly[ch] = [g, o]
            vs = vouchers[vouchers.date == iso]
            vrows = []
            for _, x in vs.iterrows():
                u = used_all[used_all.voucher_code == x.voucher_code]
                n_used = int(u.order_id.nunique())
                orders_with = valid[valid.order_id.isin(u.order_id)]
                sold_out = ""
                if n_used >= x.quota:
                    sold_out = u.sort_values("order_datetime").order_datetime.iloc[-1][11:16]
                vrows.append([x.voucher_code, x.channel, x.voucher_name, int(x.min_spend), int(x.discount), int(x.quota),
                              n_used, int(u.voucher_discount.sum()), int(orders_with.gmv.sum()), sold_out])
            rb = rebates[rebates.date == iso].set_index("channel").rebate.astype(int).to_dict()
            campaigns.append(dict(key=iso, month=m, kind=kind, label=label, prev=last.get(kind), avgDay=int(round(avg_day)),
                                  hourly=hourly, vouchers=vrows, rebates=rb))
            last[kind] = iso

    # ------------------------------------------------------------ traffic
    traffic = traffic.merge(stores, on="store", how="left")
    traffic["month"] = traffic["date"].str[:7]
    traffic["day"] = traffic["date"].str[8:10].astype(int)
    metrics = ["organic_views", "product_clicks", "visitors", "orders", "ad_impressions", "ad_clicks"]
    tr = {}
    for m in months_all:
        t = traffic[traffic.month == m]
        days_n = int(pd.Period(m, "M").days_in_month)
        by_store = t.groupby("store")[metrics].sum().reindex(stores.store).fillna(0).astype(int).reset_index()
        daily = {}
        for k in ("visitors", "orders"):
            daily[k] = t.pivot_table(index="day", columns="platform", values=k, aggfunc="sum").reindex(
                index=range(1, days_n + 1), columns=PLATFORMS).fillna(0).astype(int).values.tolist()
        tr[m] = dict(store=by_store.values.tolist(), daily=daily)

    # ------------------------------------------------------------ explode bundles -> SKU x warehouse
    parts = []
    for i in (1, 2, 3):
        c = conv[["item_code", f"sku_{i}", f"qty_{i}"]].dropna()
        c.columns = ["item_code", "sku", "per_item"]
        parts.append(c)
    comp = pd.concat(parts)
    comp["per_item"] = comp["per_item"].astype(int)
    ex = valid.merge(comp, on="item_code", how="left")
    assert ex["sku"].notna().all(), "an item is missing from item_convert.csv"
    ex["units"] = ex["qty"] * ex["per_item"]
    is_pack = valid["item_code"].isin(conv.loc[conv["sku_2"].notna() | (conv["qty_1"] > 1), "item_code"])
    pipe = {}
    for m in months_all:
        vm, pm = valid[valid.month == m], is_pack[valid.month == m]
        pipe[m] = dict(item_units=int(vm.qty.sum()), pack_lines=int(pm.sum()), pack_units=int(vm.loc[pm, "qty"].sum()),
                       sku_units=int(ex.loc[ex.month == m, "units"].sum()))
    act = ex.groupby(["month", "sku", "warehouse"]).units.sum().reset_index()
    act_p = act.pivot_table(index=["sku", "warehouse"], columns="month", values="units", aggfunc="sum").fillna(0)
    act_p = act_p.reindex(pd.MultiIndex.from_product([skus.sku, WAREHOUSES], names=["sku", "warehouse"])).fillna(0).astype(int)
    act_p.reset_index().to_csv(OUT / "sku_warehouse_monthly_units.csv", index=False)

    def forecast(m):
        return sum(w * act_p[prev_month(m, k)] for w, k in zip(WMA, (1, 2, 3))).round().astype(int)

    fc_rows, eval_rows = {}, []
    for m in SHOW:
        f, a = forecast(m), act_p[m]
        rows = []
        for (sku, wh), fv in f.items():
            av = int(a[(sku, wh)])
            if fv == 0 and av == 0:
                continue
            rows.append([sku, wh, int(fv), av])
            eval_rows.append(dict(month=m, sku=sku, warehouse=wh, forecast=int(fv), actual=av))
        fc_rows[m] = rows
    pd.DataFrame(eval_rows).to_csv(OUT / "forecast_vs_actual.csv", index=False)

    nf = forecast(NEXT)
    box = skus.set_index("sku")["units_per_carton"]
    plan = [[sku, wh, int(fv), math.ceil(fv * (1 + BUFFER) / box[sku])] for (sku, wh), fv in nf.items() if fv > 0]
    pd.DataFrame(plan, columns=["sku", "warehouse", "forecast_units", "cartons"]).to_csv(OUT / f"shipment_plan_{NEXT}.csv", index=False)

    hist = {f"{sku}|{wh}": [int(act_p.loc[(sku, wh), m]) for m in months_all] for sku, wh in act_p.index}
    items = []
    for _, r in conv.iterrows():
        comps = [[r[f"sku_{i}"], int(r[f"qty_{i}"])] for i in (1, 2, 3) if isinstance(r[f"sku_{i}"], str)]
        items.append(dict(code=r.item_code, name=r.item_name, brand=skus.set_index("sku").loc[comps[0][0], "brand"], comp=comps))

    data = dict(
        generated=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(timespec="minutes"),
        dummy=True, months=SHOW, allMonths=months_all, next=NEXT,
        platforms=PLATFORMS, channels=CHANNELS, warehouses=WAREHOUSES, ttSources=TT_SOURCES,
        brands=skus.groupby("brand").category.first().reset_index().values.tolist(),
        skus=skus[["sku", "sku_name", "brand", "category", "units_per_carton"]].values.tolist(),
        items=items, stores=stores.values.tolist(),
        sell=sell, campaigns=campaigns, traffic=tr,
        fc=dict(weights=WMA, buffer=BUFFER, tolerance=TOLERANCE, rows=fc_rows, plan=plan, hist=hist, pipe=pipe),
    )
    js = "/* Dummy data - built by tools/build_dashboard_data.py. Every name and number is fictional. */\n"
    js += "window.DASH = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data.js").write_text(js, encoding="utf-8")
    print("data.js", round(len(js) / 1024), "KB")
    for m in months_all:
        t = sell[m]["tot"]
        print(m, f"GMV Rp{t['gmv'] / 1e9:.2f}B", f"orders {t['orders']:,}", f"AOV {t['gmv'] / t['orders']:,.0f}")
    for m in SHOW:
        df = pd.DataFrame(fc_rows[m], columns=["sku", "wh", "f", "a"])
        print(m, f"accuracy {1 - (df.f - df.a).abs().sum() / df.a.sum():.1%}", f"bias {(df.f - df.a).sum() / df.a.sum():+.1%}")


if __name__ == "__main__":
    main()
