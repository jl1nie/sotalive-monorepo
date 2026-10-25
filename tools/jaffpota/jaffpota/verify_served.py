"""sotaapp2 が配信する答えと地図が、旧バッチの出力(summit_pota.csv・summit_maps.jsonl)と同じかを確かめる。

    uv run python -m jaffpota.verify_served --old-csv sotaapp_out6/summit_pota.csv \\
        --old-maps sotaapp_out6/summit_maps.jsonl.gz --verdicts sotaapp_out7/verdicts.json \\
        --base-url http://127.0.0.1:18080 [--workers 8] [--limit 200]

推定と目視に分けて入れ直したあと、利用者に見える答えが変わっていないことの確認に使う。
  - `GET /sota/summits/{code}/pota`: 市区町村・公園・答え(all/part)が旧 CSV と同じ。`verified` は、目視がある組だけ true
    (`--verdicts` を渡すと、その組と一致するかも見る)
  - `GET /sota/summits/{code}/map`: zone・border・area・summit・muni(位置・名前・POTA)と、旧にある park の区域が同じ。
    判定用の層(judge_park・peak)は配信しない
差があれば山頂ごとに表示して、終了コード 1 で終わる。認証は要らない(公開の API)。
"""
import argparse
import collections
import csv
import gzip
import json
import random
import sys
from concurrent.futures import ThreadPoolExecutor

from .sotaapp import Client, quote_code

SERVED_DROP = ("judge_park", "peak")
# 座標は、サーバーの JSON の読み書きで最後の桁(1e-14 度ほど)が変わるので、小数 7 桁(約 1 cm)で比べる
DIGITS = 7


def load_old_rows(path):
    """旧 CSV を {code: {(muni_key, pota_code): coverage}} にする"""
    return {c: {k: v[0] for k, v in m.items()} for c, m in load_old_rows_with_names(path).items()}


def load_old_rows_with_names(path):
    """旧 CSV を {code: {(muni_key, pota_code): (coverage, muni_name)}} にする"""
    out = collections.defaultdict(dict)
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out[r["summit_code"]][(r["muni_key"], r["pota_code"])] = (r["coverage"], r["muni_name"])
    return out


def load_old_maps(path):
    """旧の地図(JSON Lines。gzip でもよい)を {code: FeatureCollection} にする"""
    opener = gzip.open if str(path).endswith(".gz") else open
    out = {}
    with opener(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                m = json.loads(line)
                out[m["summit"]] = m
    return out


def rounded(v, digits=DIGITS):
    """数を丸める(座標・bbox)。文字列などはそのまま"""
    if isinstance(v, float):
        return round(v, digits)
    if isinstance(v, list):
        return [rounded(x, digits) for x in v]
    if isinstance(v, dict):
        return {k: rounded(x, digits) for k, x in v.items()}
    return v


def normalize_map(fc):
    """比べられる形にする。要素を kind ごとに、(属性, 図形)の並びにする。muni は POTA の並びも含める。
    重なった要素も残す(並べ替えるだけで、集合にしない)"""
    out = collections.defaultdict(list)
    for f in fc["features"]:
        p = f["properties"]
        kind = p["kind"]
        if kind in SERVED_DROP:
            continue
        props = dict(p)
        if kind == "muni":
            props["pota"] = sorted(props.get("pota", []), key=lambda q: q["code"])
        out[kind].append((json.dumps(props, sort_keys=True, ensure_ascii=False),
                          json.dumps(rounded(f["geometry"]), sort_keys=True)))
    return {k: sorted(v) for k, v in out.items()}


def served_rows(view):
    """`/summits/{code}/pota` の応答を {(muni_key, pota_code): (coverage, verified)} にする"""
    return {k: (c, v) for k, (c, v, _) in served_rows_with_names(view).items()}


def served_rows_with_names(view):
    """`/summits/{code}/pota` の応答を {(muni_key, pota_code): (coverage, verified, muni_name)} にする"""
    out = {}
    for m in view.get("munis", []):
        for p in m["parks"]:
            out[(m["muniKey"], p["potaCode"])] = (p["coverage"], bool(p["verified"]), m.get("muniName"))
    return out


def compare_names(code, old_names, view):
    """市区町村の名前を、旧 CSV と比べる。old_names: {(key, pota): muni_name}"""
    probs = []
    for k, (_, _, name) in served_rows_with_names(view).items():
        if k in old_names and name != old_names[k]:
            probs.append(f"{code}: 市区町村の名前が違う {k} 旧: {old_names[k]} 配信: {name}")
    return probs


def compare_answers(code, old, served, verdict_pairs=None):
    """旧の答え({(key, pota): coverage}、all/part だけ)と、配信の答えを比べる。違いを文字列で返す"""
    probs = []
    have = {k: c for k, (c, _) in served.items()}
    for k in sorted(set(old) - set(have)):
        probs.append(f"{code}: 配信にない {k} (旧: {old[k]})")
    for k in sorted(set(have) - set(old)):
        probs.append(f"{code}: 旧にない {k} (配信: {have[k]})")
    for k in sorted(set(old) & set(have)):
        if old[k] != have[k]:
            probs.append(f"{code}: 答えが違う {k} 旧: {old[k]} 配信: {have[k]}")
    if verdict_pairs is not None:
        for k, (_, verified) in served.items():
            if verified != (f"{k[0]}|{k[1]}" in verdict_pairs):
                probs.append(f"{code}: verified が目視と合わない {k} (配信: {verified})")
    return probs


def compare_maps(code, old, served):
    """旧の地図と配信の地図を比べる。park は、旧にある区域が配信にもあること(配信は「一部」の組だけを出す)"""
    a, b = normalize_map(old), normalize_map(served)
    probs = []
    for key in ("summit", "attribution"):
        if old.get(key) != served.get(key):
            probs.append(f"{code}: {key} が違う (旧 {old.get(key)!r} / 配信 {served.get(key)!r})")
    if rounded(old.get("bbox")) != rounded(served.get("bbox")):
        probs.append(f"{code}: bbox が違う (旧 {old.get('bbox')} / 配信 {served.get('bbox')})")
    for kind in sorted(set(a) | set(b)):
        if kind == "park":
            ca, cb = collections.Counter(a.get(kind, [])), collections.Counter(b.get(kind, []))
            missing = sorted((ca - cb).elements())
            extra = sorted((cb - ca).elements())
            if missing:
                probs.append(f"{code}: park が配信にない {len(missing)} 件 (例 {missing[0][0]})")
            if extra:
                probs.append(f"{code}: park が旧にない {len(extra)} 件 (例 {extra[0][0]})")
        elif a.get(kind) != b.get(kind):
            probs.append(f"{code}: {kind} が違う (旧 {len(a.get(kind, []))} 件 / 配信 {len(b.get(kind, []))} 件)")
    return probs


def select_codes(codes, verdict_codes, sample=None, seed=1):
    """確かめる山頂。sample がなければ全部。あれば、目視の山頂すべてと、残りから sample 件(seed で決まる無作為)"""
    codes = sorted(codes)
    if sample is None:
        return codes
    must = sorted(set(verdict_codes) & set(codes))
    rest = sorted(set(codes) - set(must))
    picked = random.Random(seed).sample(rest, min(sample, len(rest)))
    return sorted(set(must) | set(picked))


def check_summit(client, code, old_rows, old_map, verdict_pairs, old_names=None):
    probs = []
    try:
        view = client.get(f"/sota/summits/{quote_code(code)}/pota")
        probs += compare_answers(code, old_rows.get(code, {}), served_rows(view),
                                 None if verdict_pairs is None else verdict_pairs.get(code, set()))
        if old_names is not None:
            probs += compare_names(code, old_names.get(code, {}), view)
    except Exception as e:  # 通信の失敗やタイムアウトでも、全体を落とさず、その山頂の差として報告する
        probs.append(f"{code}: /pota を読めません ({type(e).__name__}: {str(e)[:200]})")
    if old_map is not None:
        try:
            probs += compare_maps(code, old_map, client.get(f"/sota/summits/{quote_code(code)}/map"))
        except Exception as e:
            probs.append(f"{code}: /map を読めません ({type(e).__name__}: {str(e)[:200]})")
    return probs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--old-csv", required=True)
    ap.add_argument("--old-maps", help="旧の地図。なければ答えだけ比べる")
    ap.add_argument("--verdicts", help="summit_export の verdicts.json。あれば verified も比べる")
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, help="先頭の何山頂だけ確かめる")
    ap.add_argument("--sample", type=int,
                    help="目視の山頂すべてと、残りから無作為にこの数だけ確かめる(本番ではこちらを使う。全山頂は重い)")
    ap.add_argument("--seed", type=int, default=1, help="--sample の無作為の種")
    ap.add_argument("--show", type=int, default=20, help="表示する差の数")
    a = ap.parse_args(argv)

    with_names = load_old_rows_with_names(a.old_csv)
    old_rows = {c: {k: v[0] for k, v in m.items()} for c, m in with_names.items()}
    old_names = {c: {k: v[1] for k, v in m.items()} for c, m in with_names.items()}
    old_maps = load_old_maps(a.old_maps) if a.old_maps else {}
    verdict_pairs = None
    if a.verdicts:
        with open(a.verdicts, encoding="utf-8") as f:
            verdict_pairs = {c: set(v) for c, v in json.load(f)["verdicts"].items()}
    codes = select_codes(set(old_rows) | set(old_maps), set(verdict_pairs or ()), a.sample, a.seed)
    if a.limit:
        codes = codes[: a.limit]
    client = Client(a.base_url)

    def one(code):
        return check_summit(client, code, old_rows, old_maps.get(code), verdict_pairs, old_names)

    problems = []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for probs in ex.map(one, codes):
            problems += probs
    bad = len({p.split(":", 1)[0] for p in problems})
    print(f"山頂 {len(codes)} / 差のある山頂 {bad} / 差 {len(problems)}")
    for p in problems[: a.show]:
        print("  ", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
