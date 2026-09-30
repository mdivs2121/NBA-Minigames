"""
stamp_version.py - make browsers pick up new code right after an update.

GitHub Pages lets browsers reuse files for about 10 minutes, so a visitor can
get a new page with an old script. This adds ?v=<stamp> to every local script
and stylesheet link in the site's pages; a new stamp makes each browser fetch
fresh copies. Run it before each commit that changes the site.

Run:  python3 scripts/stamp_version.py
"""
import re
import time
from pathlib import Path

SITE = Path(__file__).parent.parent
stamp = time.strftime("%Y%m%d%H%M")
pattern = re.compile(r'((?:src|href)="(?!https?:)[\w./-]+\.(?:js|css))(?:\?v=\w+)?"')

for page in sorted(SITE.glob("*.html")):
    if page.name.startswith("_"):
        continue
    text = page.read_text(encoding="utf-8")
    new = pattern.sub(rf'\1?v={stamp}"', text)
    if new != text:
        page.write_text(new, encoding="utf-8")
print(f"stamped pages with v={stamp}")
