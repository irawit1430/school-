import re

with open('components/layout/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'import { Logo }' not in content:
    content = content.replace("import { clsx } from 'clsx';", "import { clsx } from 'clsx';\nimport { Logo } from '../ui/Logo';")

shield_block = r'<div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white">\s*<Shield size=\{20\} className="fill-orange-500 stroke-white" />\s*</div>'
content = re.sub(shield_block, '<Logo variant="dark" className="w-10 h-10" />', content)

with open('components/layout/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

with open('app/login/page.tsx', 'r', encoding='utf-8') as f:
    login = f.read()

if 'import { Logo }' not in login:
    login = login.replace("import { toast } from 'react-hot-toast';", "import { toast } from 'react-hot-toast';\nimport { Logo } from '@/components/ui/Logo';")

login_shield = r'<div className="mx-auto w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">\s*<Shield className="w-6 h-6 text-orange-600" />\s*</div>'
login = re.sub(login_shield, '<div className="mx-auto flex items-center justify-center mb-4"><Logo variant="light" className="w-16 h-16" /></div>', login)

with open('app/login/page.tsx', 'w', encoding='utf-8') as f:
    f.write(login)
