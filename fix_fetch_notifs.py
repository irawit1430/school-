import re

with open('lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r"export const fetchNotifications = async \(limit = 20\) => \{\s*return api\(`/notifications\?limit=\$\{limit\}`\);\s*\};",
    "export const fetchNotifications = async (limit = 20) => {\n  try {\n    return await api(`/notifications?limit=${limit}`);\n  } catch (err) {\n    console.error('Failed to fetch notifications:', err);\n    return [];\n  }\n};",
    content
)

with open('lib/api.ts', 'w', encoding='utf-8') as f:
    f.write(content)
