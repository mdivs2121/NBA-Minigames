"""
new_page.py - start a new page with the site's standard <head> (preview
tags, app tags, icons, fonts, stylesheet) copied from player.html.

  python3 scripts/new_page.py about.html "About" "What this site is and how it's built."

Writes the page with an empty <main> to fill in. Won't overwrite a page.
"""
import html
import re
import sys
from pathlib import Path

SITE = Path(__file__).parent.parent
BASE_URL = "https://mdivs2121.github.io/NBA-Minigames/"


def main():
    name, title, description = sys.argv[1:4]
    out = SITE / name
    if out.exists():
        sys.exit(f"{name} already exists")
    head = (SITE / "player.html").read_text(encoding="utf-8").split("<body>")[0]
    t, d = html.escape(title, quote=True), html.escape(description, quote=True)
    head = re.sub(r"<title>[^<]*</title>", f"<title>{t} · NBA Minigames</title>", head)
    head = re.sub(r'(name="description" content=")[^"]*', rf"\g<1>{d}", head)
    head = re.sub(r'(property="og:title" content=")[^"]*', rf"\g<1>{t} · NBA Minigames", head)
    head = re.sub(r'(property="og:description" content=")[^"]*', rf"\g<1>{d}", head)
    head = re.sub(r'(property="og:url" content=")[^"]*', rf"\g<1>{BASE_URL}{name}", head)
    script = name.replace(".html", ".js")
    body = f'''<body>
  <main>
    <nav class="site-nav" aria-label="Games"></nav>
    <div class="rule"></div>

  </main>
  <script src="common.js"></script>
  <script src="{script}"></script>
</body>
</html>
'''
    out.write_text(head + body, encoding="utf-8")
    print(f"wrote {name}")


if __name__ == "__main__":
    main()
