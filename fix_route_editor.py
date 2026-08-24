"""
Applies all RouteMapEditor.tsx a11y and UX fixes in one pass via exact string replacement.
"""

import sys

filepath = r"components\map\RouteMapEditor.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

original = content  # for verification
changes = 0

def do_replace(content, old, new, label):
    global changes
    if old not in content:
        print(f"WARNING: Could not find target for: {label}")
        return content
    result = content.replace(old, new, 1)
    changes += 1
    print(f"  OK: {label}")
    return result

# --- 1. ClickToAdd: block clicks while saving ---
content = do_replace(content,
    'function ClickToAdd({ onAdd }: { onAdd: (lat: number, lng: number) => void }) {\n  useMapEvents({ click(e) { onAdd(e.latlng.lat, e.latlng.lng); } });',
    'function ClickToAdd({ onAdd, disabled }: { onAdd: (lat: number, lng: number) => void; disabled?: boolean }) {\n  useMapEvents({ click(e) { if (!disabled) onAdd(e.latlng.lat, e.latlng.lng); } });',
    "ClickToAdd: add disabled prop"
)

# Update the ClickToAdd usage to pass saving state
content = do_replace(content,
    '<ClickToAdd onAdd={handleAdd} />',
    '<ClickToAdd onAdd={handleAdd} disabled={saving} />',
    "ClickToAdd: pass saving to disabled"
)

# --- 2. Close button: add aria-label and focus ring ---
content = do_replace(content,
    'disabled={saving} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">\n          \u2715',
    'disabled={saving} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500" aria-label="Close">\n          \u2715',
    "Close button: aria-label + focus ring"
)

# --- 3. Search input: disable during save ---
content = do_replace(content,
    'placeholder="Search to add a stop..."\n                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"',
    'placeholder="Search to add a stop..."\n                disabled={saving}\n                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"',
    "Search input: disabled during save"
)

# --- 4. Find button: disabled states ---
content = do_replace(content,
    'disabled={isSearching}\n                className="absolute inset-y-1 right-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 rounded text-xs font-medium transition-colors"',
    'disabled={isSearching || saving}\n                className="absolute inset-y-1 right-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"',
    "Find button: disabled states"
)

# --- 5. Search results dropdown buttons: add focus styles ---
content = do_replace(content,
    'className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"',
    'className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 focus:bg-slate-50 focus:outline-none"',
    "Search results: focus styles"
)

# --- 6. Drag handle: add aria-label and focus ring ---
content = do_replace(content,
    'className="text-slate-400 hover:text-slate-600 cursor-grab shrink-0">\n          <GripVertical size={16} />',
    'className="text-slate-400 hover:text-slate-600 cursor-grab shrink-0 focus:outline-none focus:ring-2 focus:ring-orange-500 rounded" aria-label="Drag to reorder stop">\n          <GripVertical size={16} />',
    "Drag handle: aria-label + focus ring"
)

# --- 7. Remove stop button: add aria-label and focus ring ---
content = do_replace(content,
    'className="text-rose-500 hover:text-rose-700 font-bold px-2 py-1 shrink-0"\n      >\xd7</button>',
    'className="text-rose-500 hover:text-rose-700 font-bold px-2 py-1 shrink-0 focus:outline-none focus:ring-2 focus:ring-rose-500 rounded"\n        aria-label="Remove stop"\n      >\xd7</button>',
    "Remove stop button: aria-label + focus ring"
)

if changes == 0:
    print("ERROR: No replacements were made!")
    sys.exit(1)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print(f"\nDone! {changes}/7 fixes applied to RouteMapEditor.tsx")
