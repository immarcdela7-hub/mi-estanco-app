# One-time surgery on web/tickets.html: (1) empty the experiences container so the
# cards are rendered from data, (2) splice in the new catalog.js + render/filter script
# + ntl-attrib tag. Idempotent-ish: safe to re-run only against a not-yet-refactored file.
import re
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html_path = root / "web" / "tickets.html"
block_path = root / "tools" / "_script_block.htmlpart"

html = html_path.read_text(encoding="utf-8")          # universal newlines -> \n
block = block_path.read_text(encoding="utf-8").rstrip("\n")

# 1) Empty the experiences container (drop the 51 hardcoded cards).
pat = re.compile(r'<div id="experiencesContainer" class="view-grid">.*?<!-- Empty State Message -->', re.S)
new_container = '<div id="experiencesContainer" class="view-grid"></div>\n\n        <!-- Empty State Message -->'
html, n1 = pat.subn(lambda m: new_container, html)
assert n1 == 1, f"container replace count={n1} (expected 1)"

# 2) Replace the old inline script region with the new block.
start_marker = "    <!-- Filtering & View Toggle Logic -->"
end_marker = '<script src="/ntl-attrib.js"></script>'
si = html.index(start_marker)
ei = html.index(end_marker, si) + len(end_marker)
html = html[:si] + block + html[ei:]

html_path.write_text(html, encoding="utf-8", newline="\n")
print("OK: container emptied, script block spliced")
print("catalog.js refs:", html.count('/catalog.js'))
print("ntl-attrib refs:", html.count('/ntl-attrib.js'))
print("experience-item literals remaining in HTML (should be in JS template only):",
      html.count("experience-item"))
