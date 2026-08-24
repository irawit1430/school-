import sys

filepath = r"C:\Users\ANURAG TIWARI\Desktop\school\components\map\RouteMapEditor.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Cancel button at top
content = content.replace(
    '<button onClick={onCancel} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors">',
    '<button onClick={onCancel} disabled={saving} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">'
)

# 2. Update Route Name input
content = content.replace(
    '<input\n            className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm font-medium transition-all shadow-sm"',
    '<input\n            disabled={saving}\n            className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm font-medium transition-all shadow-sm disabled:bg-slate-50 disabled:text-slate-500"'
)

# 3. Update SearchableSelects
content = content.replace(
    '<SearchableSelect \n                  label="Assign Bus (Optional)"',
    '<SearchableSelect \n                  disabled={saving}\n                  label="Assign Bus (Optional)"'
)
content = content.replace(
    '<SearchableSelect \n                  label="Assign Driver (Optional)"',
    '<SearchableSelect \n                  disabled={saving}\n                  label="Assign Driver (Optional)"'
)

# 4. Update Bottom Cancel Button
content = content.replace(
    '<button\n          onClick={onCancel}\n          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"\n        >',
    '<button\n          onClick={onCancel}\n          disabled={saving}\n          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"\n        >'
)

# 5. Update Bottom Save Button
content = content.replace(
    'className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"',
    'className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Applied UI fixes to RouteMapEditor.tsx safely.")
