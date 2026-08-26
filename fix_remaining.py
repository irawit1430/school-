import os
import re
def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    content = re.sub(r'amber-700', 'warning', content)
    content = re.sub(r'emerald-700', 'success', content)
    content = re.sub(r'sky-600', 'primary', content)
    content = re.sub(r'sky-500', 'info', content)
    if content != orig:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
for root, dirs, files in os.walk('components'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))
