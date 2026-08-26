import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Colors
    content = re.sub(r'orange-600', 'primary', content)
    content = re.sub(r'orange-500', 'primary', content)
    content = re.sub(r'orange-700', 'primary-hover', content)
    content = re.sub(r'orange-50', 'primary-soft', content)
    content = re.sub(r'orange-100', 'primary-soft', content)

    content = re.sub(r'emerald-600', 'success', content)
    content = re.sub(r'emerald-500', 'success', content)
    content = re.sub(r'emerald-700', 'success', content)
    content = re.sub(r'emerald-100', 'success-soft', content)
    content = re.sub(r'emerald-50', 'success-soft', content)

    content = re.sub(r'amber-500', 'warning', content)
    content = re.sub(r'amber-600', 'warning', content)
    content = re.sub(r'amber-100', 'warning-soft', content)
    content = re.sub(r'amber-50', 'warning-soft', content)

    content = re.sub(r'rose-600', 'danger', content)
    content = re.sub(r'rose-500', 'danger', content)
    content = re.sub(r'rose-700', 'danger-hover', content)
    content = re.sub(r'rose-100', 'danger-soft', content)
    content = re.sub(r'rose-50', 'danger-soft', content)
    content = re.sub(r'rose-400', 'danger', content)
    content = re.sub(r'rose-300', 'danger-hover', content)

    content = re.sub(r'sky-500', 'info', content)
    content = re.sub(r'sky-100', 'primary-soft', content)
    content = re.sub(r'sky-700', 'primary', content)

    # Radii
    # Cards: rounded-xl -> rounded-3xl
    content = re.sub(r'rounded-xl', 'rounded-3xl', content)
    # Buttons/Controls: rounded-lg -> rounded-2xl
    content = re.sub(r'rounded-lg', 'rounded-2xl', content)
    # Inputs: keep as is or rounded-xl?
    # Spacing: shadow-sm -> shadow-none ? Design says "Shadows only where something genuinely floats"
    # Actually wait, keeping it simple is best.

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

for root, dirs, files in os.walk('components'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))

for root, dirs, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))

print("Refactor complete")
