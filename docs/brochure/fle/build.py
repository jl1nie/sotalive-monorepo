#!/usr/bin/env python3
"""FLE Online ブローシャ: template に QR を差し込んで brochure.html を作り、PDF も焼く。

  python3 build.py            # HTML + PDF
  URL を変えるなら URL を直す。要: pip install segno / Chrome(Chromium)
"""
import io, os, shutil, subprocess, sys
from pathlib import Path
import segno

URL = "https://fleonline.sotalive.net/fle/"
HERE = Path(__file__).resolve().parent

buf = io.BytesIO()
segno.make(URL, error="m").save(buf, kind="svg", scale=10, border=0, dark="#12233b", xmldecl=False, svgns=True)
svg = buf.getvalue().decode()
# viewBox がないと CSS の width で左上の切り抜きになる(読み取れない QR になる)
if "viewBox" not in svg:
    import re
    m = re.search(r'width="(\d+)" height="(\d+)"', svg)
    svg = svg.replace("<svg ", f'<svg viewBox="0 0 {m[1]} {m[2]}" ', 1)
html = (HERE / "brochure.template.html").read_text().replace("__QR__", svg)
out = HERE / "brochure.html"
out.write_text(html)
print("wrote", out)

chrome = os.environ.get("CHROME") or next((shutil.which(c) for c in ("google-chrome", "chromium", "chromium-browser") if shutil.which(c)), None)
if not chrome:
    sys.exit("Chrome が見つからないので PDF は飛ばします(HTML は作りました)")
pdf = HERE / "brochure.pdf"
subprocess.run([chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={pdf}", f"file://{out}"], check=True, capture_output=True)
print("wrote", pdf)
