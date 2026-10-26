"""公園区域 TopoJSON(jaffpota-annotated-vN.json)の版管理。

最新版はディスク上のファイルから決める。ファイル名の版が CDN・ブラウザーのキャッシュの無効化を兼ねるため、
更新は「次の版番号の新ファイルを置き、読み込む側の参照を差し替える」形で行う。旧版はロールバック用に残す。

    uv run python -m jaffpota.release                 # 最新版と参照の状況を表示
    uv run python -m jaffpota.release bump new.json   # new.json を次の版として配置し、参照を更新して検証を実行

React 版の myact(apps/myact)は、まだ参照の差し替えの対象にしていない(docs/park-areas.md)。
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent
ROOT = TOOL.parent.parent
JSON_DIR = ROOT / "packages/shared/common/json"
REFERENCES = [ROOT / "packages/shared/common/js/myact.js"]
PATTERN = re.compile(r"jaffpota-annotated-v(\d+)\.json")


def versions():
    return sorted(int(m.group(1)) for p in JSON_DIR.glob("jaffpota-annotated-v*.json") if (m := PATTERN.fullmatch(p.name)))


def latest_version():
    return versions()[-1]


def path_of(version):
    return JSON_DIR / f"jaffpota-annotated-v{version}.json"


def latest_path():
    return path_of(latest_version())


def referenced_versions(path):
    return {int(m.group(1)) for m in PATTERN.finditer(path.read_text(encoding="utf-8"))}


def bump(src):
    src = Path(src)
    if not src.is_file():
        sys.exit(f"ファイルが見つかりません: {src}")
    new = latest_version() + 1
    shutil.copyfile(src, path_of(new))
    for ref in REFERENCES:
        text = ref.read_text(encoding="utf-8")
        ref.write_text(PATTERN.sub(f"jaffpota-annotated-v{new}.json", text), encoding="utf-8")
    print(f"v{new} を配置し、参照を更新しました: {', '.join(str(r.relative_to(ROOT)) for r in REFERENCES)}。旧版 v{new - 1} はロールバック用に残します。")
    return subprocess.call([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-t", ".", "-v"], cwd=TOOL)


def main(argv):
    if len(argv) == 2 and argv[0] == "bump":
        return bump(argv[1])
    if not argv:
        print(f"最新版: v{latest_version()}")
        for ref in REFERENCES:
            print(f"  {ref.relative_to(ROOT)} の参照: {sorted(referenced_versions(ref))}")
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
