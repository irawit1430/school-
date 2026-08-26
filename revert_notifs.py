import re

with open('lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Revert fetchNotifications
content = re.sub(
    r"export const fetchNotifications = async \(limit = 20\) => \{\s*const schoolId = await getSchoolId\(\);\s*if \(!schoolId\) return \[\];\s*return api\(`/schools/\$\{schoolId\}/notifications\?limit=\$\{limit\}`\);\s*\};",
    "export const fetchNotifications = async (limit = 20) => {\n  return api(`/notifications?limit=${limit}`);\n};",
    content
)

# Revert markAllNotificationsRead
content = re.sub(
    r"export const markAllNotificationsRead = async \(\) => \{\s*const schoolId = await getSchoolId\(\);\s*if \(!schoolId\) return;\s*return api\(`/schools/\$\{schoolId\}/notifications/mark-read`, \{ method: 'POST' \}\);\s*\};",
    "export const markAllNotificationsRead = async () => {\n  return api(`/notifications/mark-read`, { method: 'POST' });\n};",
    content
)

# Revert markNotificationRead
content = re.sub(
    r"export const markNotificationRead = async \(id: string\) => \{\s*const schoolId = await getSchoolId\(\);\s*if \(!schoolId\) return;\s*return api\(`/schools/\$\{schoolId\}/notifications/\$\{id\}/read`, \{ method: 'POST' \}\);\s*\};",
    "export const markNotificationRead = async (id: string) => {\n  return api(`/notifications/${id}/read`, { method: 'POST' });\n};",
    content
)

with open('lib/api.ts', 'w', encoding='utf-8') as f:
    f.write(content)
