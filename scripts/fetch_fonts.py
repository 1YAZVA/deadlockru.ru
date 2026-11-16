"""Self-host Google Fonts: download woff2 subsets and emit local @font-face CSS."""
import re
import subprocess
import os

CSS = open("/tmp/fonts.css", encoding="utf-8").read()
OUT = "/home/z/my-project/public/fonts"
os.makedirs(OUT, exist_ok=True)

# parse blocks: /* subset */ @font-face { ... }
blocks = re.findall(r"/\*\s*([a-z0-9-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", CSS)
rules = []
for subset, face in blocks:
    fam = re.search(r"font-family:\s*'([^']+)'", face).group(1)
    weight = re.search(r"font-weight:\s*([0-9 ]+);", face).group(1).strip()
    style = re.search(r"font-style:\s*(\w+);", face).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", face).group(1)
    urange = re.search(r"unicode-range:\s*([^;]+);", face)
    urange = urange.group(1).strip() if urange else None
    # keep only subsets we need (latin + cyrillic + cyrillic-ext)
    if subset not in ("latin", "cyrillic", "cyrillic-ext"):
        continue
    slug = fam.lower().replace(" ", "-")
    fname = f"{slug}-{weight.replace(' ', '-')}-{style}-{subset}.woff2"
    dest = os.path.join(OUT, fname)
    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
        r = subprocess.run(["curl", "-s", "--max-time", "30", "-o", dest, url])
        if r.returncode != 0:
            print("FAILED", fam, subset, weight)
            continue
    size = os.path.getsize(dest)
    ur = f" unicode-range: {urange};" if urange else ""
    rules.append(
        f"@font-face {{ font-family: '{fam}'; font-style: {style}; font-weight: {weight}; "
        f"font-display: swap; src: url('/fonts/{fname}') format('woff2');{ur} }}"
    )
    print(f"{fam} {weight} {subset}: {size} bytes -> {fname}")

with open("/tmp/fontface.css", "w", encoding="utf-8") as f:
    f.write("\n".join(rules) + "\n")
print("\n@font-face rules:", len(rules))
