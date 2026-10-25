"""手元の目視の答え(verdicts.json)を、sotaapp2 の見直しの API で確定する(1 回限りの移行)。

    SOTAAPP_EMAIL=... SOTAAPP_PASSWORD=... uv run python -m jaffpota.migrate_verdicts verdicts.json \\
        --base-url https://sotaapp2.sotalive.net [--dry-run] [--only JA/AC-006 ...]

先に、`python -m jaffpota.summit_export` の summit_pota.csv を `POST /sota/import/pota`(mode=full)で
入れておくこと。確定の API は、答えの組が今の推定の組とぴったり一致しないと 400 にする。

1. すべての山頂について、推定の組が verdicts.json と一致することを確かめる。1 つでも合わなければ、何も書かずに止まる。
2. 書く。山頂ごとに `PUT /sota/review/summits/{code}`(確定者は、サインインした人。日時は、いま)。
   すでに同じ答えで確定済みの山頂は飛ばすので、途中で止まっても、そのまま再実行できる。
"""
import argparse
import json
import sys

from .sotaapp import ApiError, Client, quote_code

NOTE = "判定表から移行"


def plan(client, verdicts, only=None, note=NOTE, overwrite_reviews=False):
    """山頂ごとに、書くものを決める。戻り値: (書くもの, 飛ばすもの, 問題)

    書くもの: [(code, inputRev, answers)]  問題: [文字列]
    管理画面で人が確定した山頂(確定の note が、この移行の note と違う)は、上書きしない(問題にする)。
    上書きしてよいときだけ `overwrite_reviews`。
    """
    todo, same, problems = [], [], []
    for code in sorted(verdicts):
        if only and code not in only:
            continue
        want = {tuple(pid.split("|", 1)): a["coverage"] for pid, a in verdicts[code].items()}
        try:
            d = client.get(f"/sota/review/summits/{quote_code(code)}")
        except ApiError as e:
            problems.append(f"{code}: 詳細を読めません ({e})")
            continue
        have = {(p["muniKey"], p["potaCode"]): p.get("verdict") for p in d["pairs"]}
        if set(have) != set(want):
            miss = sorted(set(want) - set(have))[:3]
            extra = sorted(set(have) - set(want))[:3]
            problems.append(f"{code}: 推定の組と目視の組が一致しません (推定にない: {miss} 目視にない: {extra})")
            continue
        if d.get("review") and all(have[k] == want[k] for k in want) and d["review"]["inputRev"] == d["inputRev"]:
            same.append(code)
            continue
        review = d.get("review")
        if review and not overwrite_reviews and review.get("note") != note:
            problems.append(f"{code}: 管理画面で確定済みの答えがあります({review.get('reviewedBy', '?')})。"
                            "上書きするなら --overwrite-reviews")
            continue
        answers = [{"muniKey": k[0], "potaCode": k[1], "coverage": c} for k, c in sorted(want.items())]
        todo.append((code, d["inputRev"], answers))
    return todo, same, problems


def apply(client, todo, note=NOTE, out=None):
    """PUT する。最初の失敗で止める(再実行できる)。戻り値: 書いた山頂の数"""
    out = out or sys.stdout
    done = 0
    for code, rev, answers in todo:
        try:
            client.put(f"/sota/review/summits/{quote_code(code)}", {"inputRev": rev, "answers": answers, "note": note})
        except ApiError as e:
            print(f"失敗 {code}: {e}(ここまでに {done} 山頂を書いた。直してから、そのまま再実行できる)", file=out)
            raise
        done += 1
    return done


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("verdicts", help="summit_export の verdicts.json")
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--dry-run", action="store_true", help="確かめるだけで、書かない")
    ap.add_argument("--only", nargs="+", help="この山頂だけ")
    ap.add_argument("--overwrite-reviews", action="store_true",
                    help="管理画面で人が確定した山頂も上書きする(既定は問題として止まる)")
    ap.add_argument("--note", default=NOTE)
    a = ap.parse_args(argv)

    with open(a.verdicts, encoding="utf-8") as f:
        data = json.load(f)
    verdicts = data["verdicts"]
    client = Client.from_env(a.base_url)
    todo, same, problems = plan(client, verdicts, set(a.only) if a.only else None, a.note, a.overwrite_reviews)
    human = sum(1 for _, _, ans in todo for _ in ans)
    print(f"目視の山頂 {len(verdicts)} / 書く {len(todo)}({human} 組)/ 確定済みで同じ {len(same)} / 問題 {len(problems)}")
    for p in problems:
        print("  問題:", p)
    if problems:
        print("問題があるので、何も書かずに止まります", file=sys.stderr)
        return 1
    if a.dry_run:
        print("--dry-run: 書きません")
        return 0
    n = apply(client, todo, a.note)
    print(f"書いた山頂 {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
