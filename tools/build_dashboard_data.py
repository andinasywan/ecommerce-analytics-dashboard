"""
Pipeline: ekspor pesanan mentah -> data.js untuk dashboard.

Langkah yang sama dengan proses bulanan di Excel saat magang, ditulis ulang di Python:
  1. Gabungkan ekspor pesanan per bulan.
  2. Buang pesanan Batal & Retur (pesanan valid = Selesai + Dalam pengiriman).
  3. Petakan toko -> platform & gudang (store_map.csv).
  4. Rekap sell-out: GMV, pesanan, unit per platform / toko / brand / item / hari / jam.
  5. Pecah multipack & bundle ke SKU fisik (item_convert.csv), lalu pivot unit SKU x gudang.
  6. Forecast bulan M = rata-rata tertimbang 3 bulan sebelumnya (0,5 / 0,3 / 0,2),
     dibandingkan dengan aktual -> akurasi (1 - WAPE) & bias.
  7. Rencana kirim bulan depan: forecast x (1 + buffer) dibulatkan ke atas per karton.

Jalankan:  python tools/build_dashboard_data.py
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

SHOW = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]   # periode dashboard (Mei-Sep)
NEXT = "2026-10"
WMA = [0.5, 0.3, 0.2]       # bobot M-1, M-2, M-3
BUFFER = 0.15               # stok pengaman di atas forecast
TOLERANCE = 0.25            # |error| di atas 25% dianggap meleset
PLATFORMS = ["TikTok Shop", "Shopee", "Tokopedia", "Lazada", "Blibli"]
WAREHOUSES = ["Jakarta", "Surabaya", "Medan", "Makassar", "Semarang"]
VALID = ["Selesai", "Dalam pengiriman"]


def prev_month(m: str, k: int = 1) -> str:
    p = pd.Period(m, "M") - k
    return str(p)


def main():
    frames = []
    for f in sorted(RAW.glob("orders_*.csv.gz")):
        frames.append(pd.read_csv(f, dtype={"order_id": str}))
    raw = pd.concat(frames, ignore_index=True)
    raw["month"] = raw["order_date"].str[:7]
    raw["day"] = raw["order_date"].str[8:10].astype(int)
    raw["hour"] = raw["order_datetime"].str[11:13].astype(int)

    stores = pd.read_csv(MASTER / "store_map.csv")
    skus = pd.read_csv(MASTER / "sku_master.csv")
    conv = pd.read_csv(MASTER / "item_convert.csv")
    raw = raw.merge(stores, on="store", how="left")
    assert raw["warehouse"].notna().all(), "ada toko yang belum dipetakan ke gudang"

    months_all = sorted(raw["month"].unique())
    valid = raw[raw["status"].isin(VALID)].copy()

    # ------------------------------------------------------------ sell-out
    sell = {}
    for m in months_all:
        r = raw[raw.month == m]
        v = valid[valid.month == m]
        days = int(pd.Period(m, "M").days_in_month)
        orders = v["order_id"].nunique()
        tot = dict(gmv=int(v.gmv.sum()), orders=int(orders), units=int(v.qty.sum()), lines=int(len(v)))
        stat = dict(raw_lines=int(len(r)), raw_orders=int(r.order_id.nunique()),
                    **{k: int((r.status == k).sum()) for k in ["Selesai", "Dalam pengiriman", "Batal", "Retur"]})
        plat = {}
        for p in PLATFORMS:
            vp = v[v.platform == p]
            plat[p] = [int(vp.gmv.sum()), int(vp.order_id.nunique()), int(vp.qty.sum())]
        st = (v.groupby("store").agg(gmv=("gmv", "sum"), orders=("order_id", "nunique"), units=("qty", "sum"))
              .reindex(stores.store).fillna(0).astype(int).reset_index())
        br = (v.groupby("brand").agg(gmv=("gmv", "sum"), orders=("order_id", "nunique"), units=("qty", "sum"))
              .reset_index())
        it = (v.groupby("item_code").agg(gmv=("gmv", "sum"), units=("qty", "sum"), orders=("order_id", "nunique"))
              .reset_index())
        daily = v.pivot_table(index="day", columns="platform", values="gmv", aggfunc="sum").reindex(
            index=range(1, days + 1), columns=PLATFORMS).fillna(0).astype(int)
        d_orders = v.groupby("day")["order_id"].nunique().reindex(range(1, days + 1)).fillna(0).astype(int)
        hour = v.groupby("hour").gmv.sum().reindex(range(24)).fillna(0).astype(int)
        sell[m] = dict(
            tot=tot, stat=stat, plat=plat,
            store=st.values.tolist(),
            brand=br.values.tolist(),
            item=it.values.tolist(),
            daily=daily.values.tolist(),
            dailyOrders=d_orders.tolist(),
            hour=hour.tolist(),
        )

    # ------------------------------------------------------------ pecah bundle -> SKU x gudang
    parts = []
    for i in (1, 2, 3):
        c = conv[["item_code", f"sku_{i}", f"qty_{i}"]].dropna()
        c.columns = ["item_code", "sku", "per_item"]
        parts.append(c)
    comp = pd.concat(parts)
    comp["per_item"] = comp["per_item"].astype(int)
    ex = valid.merge(comp, on="item_code", how="left")
    assert ex["sku"].notna().all(), "ada item yang belum ada di item_convert"
    ex["units"] = ex["qty"] * ex["per_item"]
    is_pack = valid["item_code"].isin(conv.loc[conv["sku_2"].notna() | (conv["qty_1"] > 1), "item_code"])
    pipe = {}
    for m in months_all:
        vm = valid[valid.month == m]
        pm = is_pack[valid.month == m]
        pipe[m] = dict(item_units=int(vm.qty.sum()), pack_lines=int(pm.sum()),
                       pack_units=int(vm.loc[pm, "qty"].sum()),
                       sku_units=int(ex.loc[ex.month == m, "units"].sum()))
    act = ex.groupby(["month", "sku", "warehouse"]).units.sum().reset_index()
    act_p = act.pivot_table(index=["sku", "warehouse"], columns="month", values="units", aggfunc="sum").fillna(0)
    full_idx = pd.MultiIndex.from_product([skus.sku, WAREHOUSES], names=["sku", "warehouse"])
    act_p = act_p.reindex(full_idx).fillna(0).astype(int)
    act_p.reset_index().to_csv(OUT / "sku_gudang_unit_bulanan.csv", index=False)

    def forecast(m):
        cols = [prev_month(m, k) for k in (1, 2, 3)]
        return sum(w * act_p[c] for w, c in zip(WMA, cols)).round().astype(int)

    fc_rows, eval_rows = {}, []
    for m in SHOW:
        f = forecast(m)
        a = act_p[m]
        rows = []
        for (sku, wh), fv in f.items():
            av = int(a[(sku, wh)])
            if fv == 0 and av == 0:
                continue
            rows.append([sku, wh, int(fv), av])
            eval_rows.append(dict(month=m, sku=sku, warehouse=wh, forecast=int(fv), actual=av))
        fc_rows[m] = rows
    pd.DataFrame(eval_rows).to_csv(OUT / "forecast_vs_aktual.csv", index=False)

    nf = forecast(NEXT)
    box = skus.set_index("sku")["isi_per_karton"]
    plan = []
    for (sku, wh), fv in nf.items():
        if fv <= 0:
            continue
        need = fv * (1 + BUFFER)
        cartons = math.ceil(need / box[sku])
        plan.append([sku, wh, int(fv), cartons])
    pd.DataFrame(plan, columns=["sku", "warehouse", "forecast_unit", "karton"]).to_csv(
        OUT / f"rencana_kirim_{NEXT}.csv", index=False)

    hist = {f"{sku}|{wh}": [int(act_p.loc[(sku, wh), m]) for m in months_all] for sku, wh in act_p.index}

    items = []
    for _, r in conv.iterrows():
        comps = [[r[f"sku_{i}"], int(r[f"qty_{i}"])] for i in (1, 2, 3) if isinstance(r[f"sku_{i}"], str)]
        brand = skus.set_index("sku").loc[comps[0][0], "brand"]
        items.append(dict(code=r.item_code, name=r.item_name, brand=brand, comp=comps))

    data = dict(
        generated=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(timespec="minutes"),
        dummy=True,
        months=SHOW, allMonths=months_all, next=NEXT,
        platforms=PLATFORMS, warehouses=WAREHOUSES,
        brands=skus.groupby("brand").category.first().reset_index().values.tolist(),
        skus=skus[["sku", "sku_name", "brand", "category", "isi_per_karton"]].values.tolist(),
        items=items,
        stores=stores.values.tolist(),
        sell=sell,
        fc=dict(weights=WMA, buffer=BUFFER, tolerance=TOLERANCE, rows=fc_rows, plan=plan, hist=hist, pipe=pipe),
    )
    js = "/* Data dummy - dibuat oleh tools/build_dashboard_data.py. Semua angka & nama fiktif. */\n"
    js += "window.DASH = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "data.js").write_text(js, encoding="utf-8")
    print("data.js", round(len(js) / 1024), "KB")
    for m in months_all:
        t = sell[m]["tot"]
        print(m, f"GMV Rp{t['gmv']/1e9:.2f} M", f"orders {t['orders']:,}", f"AOV {t['gmv']/t['orders']:,.0f}")
    for m in SHOW:
        df = pd.DataFrame(fc_rows[m], columns=["sku", "wh", "f", "a"])
        wape = (df.f - df.a).abs().sum() / df.a.sum()
        bias = (df.f - df.a).sum() / df.a.sum()
        print(m, f"akurasi {1-wape:.1%}", f"bias {bias:+.1%}")


if __name__ == "__main__":
    main()
