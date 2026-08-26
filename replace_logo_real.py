import re

with open('components/layout/Sidebar.tsx', 'r', encoding='utf-8') as f:
    sb = f.read()

sb = re.sub(r'<div className="bg-primary text-white p-2 rounded-lg">\s*<Bus size=\{24\} />\s*</div>', '<Logo className="w-10 h-10" variant="dark" />', sb)
with open('components/layout/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(sb)

with open('app/login/page.tsx', 'r', encoding='utf-8') as f:
    lg = f.read()

lg = re.sub(r'<div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg">\s*<Bus size=\{28\} />\s*</div>', '<Logo className="w-16 h-16" variant="light" />', lg)
if "import { Logo }" not in lg:
    lg = lg.replace("import { useRouter }", "import { Logo } from '@/components/ui/Logo';\nimport { useRouter }")

with open('app/login/page.tsx', 'w', encoding='utf-8') as f:
    f.write(lg)
