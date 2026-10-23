"""公園区域 TopoJSON の POTA/JAFF/NAME を、sotaapp2 の DB に合わせて対話式に直す。

各 geometry の POTA を API で照合し、DB にない・非表示(parkInactive)のものについて、新しい POTA コードを尋ねる。
DB が唯一の正で、JSON はそれに合わせる。DB の修正(管理画面)を先に済ませること。

    uv run python -m jaffpota.patch [--api URL] [--dry-run] [--out new.json]

--out を付けると最新版を上書きせずに別のファイルへ保存する。ブラウザーのキャッシュを確実に切り替えるには、
そのファイルを `python -m jaffpota.release bump new.json` で次の版として配置する。
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from . import topo
from .release import latest_path

DEFAULT_API = "https://sotaapp2.sotalive.net"

_cache = {}


def query_park(api_url, code):
    """パークコードで API を照合する。見つからなければ None。結果はキャッシュする。"""
    if code in _cache:
        return _cache[code]
    url = f"{api_url}/api/v2/pota/parks/{urllib.parse.quote(code)}"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            result = json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        result = None
    except Exception as e:
        print(f"  [warn] API error for {code}: {e}", file=sys.stderr)
        result = None
    _cache[code] = result
    return result


def normalize_pota(pota):
    """JA-XXXX → JP-XXXX"""
    return "JP-" + pota[3:] if pota.startswith("JA-") else pota


def query_park_combo(api_url, pota_code, jaff_code):
    """POTA と JAFF の組で照合する。POTA で見つかり JAFF も一致すればそれを返す。
    JAFF が一致しなければ JAFF コードでも検索し、POTA が一致するレコードを優先する。"""
    park = query_park(api_url, pota_code)
    if park and (not jaff_code or park.get("wwffCode", "") == jaff_code):
        return park
    if jaff_code:
        park2 = query_park(api_url, jaff_code)
        if park2 and normalize_pota(park2.get("potaCode", "")) == pota_code:
            return park2
    return park


def main(argv=None):
    ap = argparse.ArgumentParser(description="公園区域 TopoJSON の POTA/JAFF を DB に合わせて対話式に直す")
    ap.add_argument("--api", default=DEFAULT_API, help=f"sotaapp2 の URL(既定: {DEFAULT_API})")
    ap.add_argument("--dry-run", action="store_true", help="確認だけ。ファイルは書き換えない")
    ap.add_argument("--out", type=Path, help="保存先(既定: 最新版を上書き)")
    args = ap.parse_args(argv)

    src = latest_path()
    data = json.loads(src.read_text(encoding="utf-8"))
    geometries = data["objects"][topo.OBJECT]["geometries"]
    print(f"Loaded {len(geometries)} geometries from {src}")
    print(f"API: {args.api}\n")

    changes = []
    total = len(geometries)
    queried = 0
    for i, geom in enumerate(geometries, 1):
        props = geom["properties"]
        old_pota = props.get("POTA", "")
        if not old_pota:
            continue
        new_pota = normalize_pota(old_pota)
        if new_pota not in _cache:
            queried += 1
        print(f"\r[{i}/{total}] API:{queried}件照会済 ", end="", flush=True)
        park = query_park_combo(args.api, new_pota, props.get("JAFF", ""))
        if park is not None and not park.get("parkInactive", False):
            if new_pota != old_pota:
                changes.append((props, {"POTA": new_pota}))
            continue

        print(f"\n{'─' * 60}")
        print(f"UID {props.get('UID', '?')}  現在: POTA={old_pota}  JAFF={props.get('JAFF', '')}")
        print(f"  NAME={props.get('NAME', '')}")
        print(f"  → DBに {new_pota} が存在しない" if park is None else f"  → {new_pota} は非表示 (parkInactive)")
        print("\n  新しいPOTAコードを入力 (Enterでスキップ、qで終了):")
        try:
            answer = input("  > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n中断")
            break
        if answer == "q":
            print("終了")
            break
        if not answer:
            print("  スキップ")
            continue
        new_park = query_park(args.api, answer)
        if new_park:
            new_props = {"POTA": new_park.get("potaCode", answer), "JAFF": new_park.get("wwffCode", ""), "NAME": new_park.get("parkNameJ", "")}
            print(f"  → POTA={new_props['POTA']}  JAFF={new_props['JAFF']}  NAME={new_props['NAME']}")
        else:
            print(f"  [warn] {answer} がDBにない。そのまま設定。")
            new_props = {"POTA": answer}
        changes.append((props, new_props))

    print(f"\n{'=' * 60}")
    print(f"変更: {len(changes)} 件")
    if not changes:
        print("変更なし。")
        return 0
    for props, new_props in changes:
        print(f"  UID {props.get('UID', '?')}: {props.get('POTA')} → {new_props.get('POTA', props.get('POTA'))}"
              f"  JAFF: {props.get('JAFF')} → {new_props.get('JAFF', props.get('JAFF'))}")
    if args.dry_run:
        print("\n[dry-run] ファイルは更新しない。")
        return 0
    if input("\nJSONファイルを更新しますか？ [y/N] ").strip().lower() != "y":
        print("キャンセル。")
        return 0
    for props, new_props in changes:
        props.update(new_props)
    dst = args.out or src
    dst.write_text(topo.dumps(data), encoding="utf-8", newline="\n")
    print(f"✓ {dst} を更新しました。")
    print("次: uv run python -m unittest discover -s tests -t . で検証 → git diff → commit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
