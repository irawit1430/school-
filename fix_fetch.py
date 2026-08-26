import re

with open('lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r"res = await fetch\(`\$\{API_BASE\}\$\{path\}`,\s*\{",
    "res = await fetch(`${API_BASE}${path}`, {\n      cache: 'no-store',",
    content
)

with open('lib/api.ts', 'w', encoding='utf-8') as f:
    f.write(content)
