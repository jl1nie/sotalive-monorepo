"""山頂 × 市区町村(JCC/JCG)× POTA 公園の「組」の分類と、推定・目視の答え。

DB・ファイル・図形に触れない純粋な関数。手元のバッチ(review2_data.py と export_sotaapp.py)の規則を、そのまま移したもの。
sotaapp2 の管理画面(`docs/summit-map-admin-design.md`)は、答えを「推定」(バッチが決める)と「目視」(人が決める)に分けて持つ。

- 推定(`estimate_answer`): 今までのバッチが配信していた答えから、目視を除いたもの。
- 目視(`build_verdicts`): 判定表で人が確かめた答え。山頂の組すべてに答えがある(なしも含む)。

規則の出どころは docs/summit-batch.md。
"""

FULL, TINY, NEAR, SNAP = 0.99, 0.05, 50, 0.8

# 判定表は、確認するとカードがせり上がり、見ていない山頂の確認ボタンを押させてしまう作りだった(2026-10-24)。
# 最初に選んでおいた答えのまま保存された山頂は、見たかどうか区別できないので、目視とみなさず、データの答えに戻す。
# 目視とみなすのは、確かめたと分かっている山頂(下)と、保存された答えが最初の答えと違う山頂だけ
CONFIRMED = frozenset({"JA/KN-017", "JA/KT-063", "JA/ST-008", "JA/ST-009", "JA/SO-027", "JA/OS-007", "JA/AC-021"})

COVERAGES = ("all", "part", "none")


def pair_id(key, pota):
    return f"{key}|{pota}"


def data_answer(p):
    """データだけの答え。わずかでも当たれば「一部」(要確認でない山頂と同じ)"""
    if p["noise"] or p["px"] == 0:
        return "none"
    return "all" if p["pct"] >= 99 else "part"


def classify_summit(keys, cands, keypx, wrong, triage, heur):
    """山頂の候補から、組の答え(`default`)と、目視する理由を決める。組がなければ None。

    keys:   山頂にかかる市区町村 [{"key": ...}, ...]
    cands:  候補の組 [{"key", "pota", "px"}, ...](px は、ゾーンのうち、その市区町村の中で公園に入る画素の数)
    keypx:  その山頂の、市区町村ごとの画素の数 {key: px}
    wrong:  city_j の誤りで除く市区町村のキーの集合
    triage: {"key|pota": {"in": 公園に入っているか, "m": 境界までの距離(m)}}
    heur:   公園の境界が市区町村境に沿う割合 {"f100": ...}。なければ None
    """
    keys = [k for k in keys if k["key"] not in wrong]
    pairs = []
    for c in cands:
        if c["key"] in wrong:
            continue
        t = triage.get(pair_id(c["key"], c["pota"]))
        tot = keypx.get(c["key"], 0)
        frac = c["px"] / tot if tot else 0.0
        if c["px"] == 0 and not (t and not t["in"] and t["m"] < NEAR):
            continue
        dflt = "all" if frac >= FULL else "none" if frac < TINY else "part"
        pairs.append({"key": c["key"], "pota": c["pota"], "px": c["px"], "tot": tot,
                      "pct": round(100 * frac, 1), "dist": t["m"] if t and not t["in"] else None,
                      "default": dflt, "review": 0 < frac < FULL})
    if not pairs:
        return None
    # ゾーンにかかる市区町村は、公園の組がなくても数える(選ぶと POTA にならない市区町村)
    used = {p["key"] for p in pairs} | {k for k, n in keypx.items() if n > 0 and k not in wrong}
    # 目視するのは次の 3 つ。①一部だけ公園に入る組があり、選ぶ市区町村で当たる公園が変わる
    # ②ゾーンから NEAR m 以内に、当たっていない公園がある ③全部入ると推定した部分が、境界から NEAR m 以内
    # 誤差とみなす組: 隣の市区町村で全部入る公園が、市区町村境ごしに 1% 未満はみ出すか、接しているだけ
    for p in pairs:
        other_all = {q["pota"] for q in pairs if q["key"] != p["key"] and q["default"] == "all"}
        p["noise"] = p["pota"] in other_all and (p["px"] == 0 or p["pct"] < 1)
        if p["noise"]:
            p["default"] = "none"
    real = [p for p in pairs if not p["noise"]]
    hit = [p for p in real if p["px"] > 0]
    sets = {frozenset(p["pota"] for p in hit if p["key"] == k) for k in used}
    partial = any(0 < p["pct"] < 100 * FULL for p in real)
    for p in pairs:
        t = triage.get(pair_id(p["key"], p["pota"]))
        p["shallow"] = p["default"] == "all" and bool(t) and t["in"] and t["m"] < NEAR
    # 市区町村ごとに過半を占める公園が別々なら、公園の境界が市区町村境からずれているだけとみなし、
    # 過半の公園を「全部」、ほかを「なし」にしておく
    hk = {p["key"] for p in hit}
    maj = {}
    for k in hk:
        top = max((p for p in hit if p["key"] == k), key=lambda p: p["pct"])
        if top["pct"] >= 50:
            maj[k] = top["pota"]
    split = len(hk) >= 2 and len(maj) == len(hk) and len(set(maj.values())) == len(hk)
    reasons = []
    if partial and len(sets) > 1:
        reasons.append("muni")
    if any(p["px"] == 0 for p in real):
        reasons.append("near")
    if any(p["shallow"] for p in pairs):
        reasons.append("shallow")
    split = split and bool(reasons)  # 目視する山頂だけ。目視しない山頂の答えは変えない
    if split:
        for p in hit:
            p["default"] = "all" if maj[p["key"]] == p["pota"] else "none"
    # 公園の境界の SNAP 以上が市区町村境から 100 m 以内なら、市区町村境で区切った答えにしておく
    # (過半の公園を「全部」、ほかは「なし」)。目視で外すのではなく、最初に選んでおく答えだけ
    snap = bool(reasons) and not split and bool(heur) and heur["f100"] >= SNAP
    if snap:
        for p in pairs:
            p["default"] = "all" if maj.get(p["key"]) == p["pota"] else "none"
    for p in pairs:
        p["review"] = not p["noise"] and (("muni" in reasons and 0 < p["pct"] < 100 * FULL) or p["px"] == 0 or p["shallow"])
        if not reasons and p["default"] == "none" and p["px"] > 0 and not p["noise"]:
            # 目視しない山頂では、わずかでも当たる組は「一部」にする(市区町村で答えが変わらないように)
            p["default"] = "part"
    return {"keys": [k for k in keys if k["key"] in used], "pairs": pairs, "partial": partial,
            "split": split, "snap": snap, "reasons": reasons, "review": bool(reasons)}


def estimate_answer(p, has_saved):
    """推定の答え。今までのバッチが、目視を除いて配信していた答え。

    判定表に保存された答えがある山頂は、目視とみなさない組もデータの答えに戻していた(`data_answer`)。
    保存がない山頂は、規則で決めた最初の答え(`default`)だった。
    """
    return data_answer(p) if has_saved else p["default"]


def hint_for(p, has_saved):
    """参考の答え。推定と別の側の答え(データの答えと、市区町村境で区切る規則の答え)。同じなら None"""
    other = p["default"] if has_saved else data_answer(p)
    return other if other != estimate_answer(p, has_saved) else None


def note_for(p, summit, has_saved):
    """推定に補正の規則が働いたときの理由。働いていなければ None。

    判定表に保存がある山頂の推定は、データの答え(`data_answer`)で、`default` の規則(split・snap)は使われない
    (その答えは `hint` の側に出る)。だから、その山頂には split・snap の理由を書かない。
    split は、当たっている組(px > 0 で誤差でない)にだけ働く。
    """
    if p["noise"]:
        return "隣の市区町村で全部入る公園の、境界ごしの誤差とみなした"
    if has_saved:
        return None
    if summit["split"] and p["px"] > 0:
        return "市区町村ごとに過半を占める公園で区切った"
    if summit["snap"]:
        return "公園の境界が市区町村境に沿うので、市区町村境で区切った"
    return None


def build_verdicts(summits, saved, rereview, manual, has_saved):
    """目視の答え。山頂ごとに、組すべての答え(なしも含む)を返す。目視のない山頂は含めない。

    summits:   {code: 組のリスト}(`classify_summit` の pairs)
    saved:     判定表に保存された答え {code: {"key|pota": coverage}}
    rereview:  見直しの判定表で確定した答え {code: {"key|pota": coverage}}(組すべてに答えがあること)
    manual:    判定表の外で分かった答え [{"summit", "muni_key", "pota_code", "coverage"}]
    has_saved: {code: 判定表に保存された答えがあるか}(推定の答えを決める)

    優先順位は今のバッチと同じ: manual > rereview > 判定表(確かめたと分かっている山頂だけ)。
    戻り値: {code: {"key|pota": {"coverage": ..., "source": "human" | "filled"}}}
    `filled` は、人が見ていない組を、今まで配信していた答えで埋めたもの(確定の API は組すべての答えを要求するため)。
    """
    out = {}
    for code, pairs in summits.items():
        sv = saved.get(code, {})
        changed = any(pair_id(p["key"], p["pota"]) in sv and sv[pair_id(p["key"], p["pota"])] != p["default"] for p in pairs)
        if sv and (code in CONFIRMED or changed):
            out[code] = {}
            for p in pairs:
                pid = pair_id(p["key"], p["pota"])
                if pid in sv:
                    out[code][pid] = {"coverage": sv[pid], "source": "human"}
                else:
                    out[code][pid] = {"coverage": data_answer(p), "source": "filled"}

    for code, v in rereview.items():
        out[code] = {}
        for p in summits[code]:
            pid = pair_id(p["key"], p["pota"])
            a = v.get(pid)
            if a is None:
                raise ValueError(f"見直しの答えに組がありません: {code} {pid}")
            out[code][pid] = {"coverage": a, "source": "human"}

    for row in manual:
        code = row["summit"]
        pid = pair_id(row["muni_key"], row["pota_code"])
        pairs = summits.get(code, [])
        if pid not in {pair_id(p["key"], p["pota"]) for p in pairs}:
            if row["coverage"] == "none":
                continue  # 候補にない組を「なし」にする指定は、何も変えない
            raise ValueError(f"候補にない組を all/part にする指定は表せません: {code} {pid}")
        if code not in out:
            out[code] = {pair_id(p["key"], p["pota"]): {"coverage": estimate_answer(p, has_saved.get(code, False)), "source": "filled"}
                         for p in pairs}
        out[code][pid] = {"coverage": row["coverage"], "source": "human"}

    for code, v in out.items():
        for pid, a in v.items():
            if a["coverage"] not in COVERAGES:
                raise ValueError(f"答えが all/part/none ではありません: {code} {pid} {a['coverage']}")
    return out


def served(estimates, verdicts):
    """配信される答え。組ごとに、目視があれば目視、なければ推定。all/part の組だけ。

    estimates: {code: {"key|pota": coverage}}  verdicts: build_verdicts の戻り値
    戻り値: {code: {"key|pota": (coverage, verified)}}
    """
    out = {}
    for code, est in estimates.items():
        v = verdicts.get(code, {})
        for pid, cov in est.items():
            a = v[pid] if pid in v else None
            c = a["coverage"] if a else cov
            if c in ("all", "part"):
                out.setdefault(code, {})[pid] = (c, 1 if a and a["source"] == "human" else 0)
    return out
