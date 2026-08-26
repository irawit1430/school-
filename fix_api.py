import re

with open('lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace fetchNotifications
content = re.sub(
    r'export const fetchNotifications = \(limit = 20\) =>\s*api\(`/notifications\?limit=\$\{limit\}`\);',
    "export const fetchNotifications = async (limit = 20) => {\n  const schoolId = await getSchoolId();\n  if (!schoolId) return [];\n  return api(`/schools/${schoolId}/notifications?limit=${limit}`);\n};",
    content
)

# Replace markAllNotificationsRead
content = re.sub(
    r"export const markAllNotificationsRead = \(\) =>\s*api\('/notifications/mark-read', \{ method: 'POST' \}\);",
    "export const markAllNotificationsRead = async () => {\n  const schoolId = await getSchoolId();\n  if (!schoolId) return;\n  return api(`/schools/${schoolId}/notifications/mark-read`, { method: 'POST' });\n};",
    content
)

# Replace markNotificationRead
content = re.sub(
    r"export const markNotificationRead = \(id: string\) =>\s*api\(`/notifications/\$\{id\}/read`, \{ method: 'POST' \}\);",
    "export const markNotificationRead = async (id: string) => {\n  const schoolId = await getSchoolId();\n  if (!schoolId) return;\n  return api(`/schools/${schoolId}/notifications/${id}/read`, { method: 'POST' });\n};",
    content
)

with open('lib/api.ts', 'w', encoding='utf-8') as f:
    f.write(content)
