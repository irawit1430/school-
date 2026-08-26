import re

# 1. Update lib/api.ts
with open('lib/api.ts', 'r', encoding='utf-8') as f:
    api_content = f.read()

api_content = re.sub(
    r"parentEmail\?: string;\s*parentName\?: string;",
    "parentEmail?: string;\n    parentName?: string;\n    guardianPhone?: string;",
    api_content
)
with open('lib/api.ts', 'w', encoding='utf-8') as f:
    f.write(api_content)

# 2. Update components/views/StudentsAttendance.tsx
with open('components/views/StudentsAttendance.tsx', 'r', encoding='utf-8') as f:
    sa_content = f.read()

sa_content = re.sub(
    r"setFormData\(\{ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '' \}\);",
    "setFormData({ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '', guardianPhone: '' });",
    sa_content
)
sa_content = re.sub(
    r"parentEmail: formData\.parentEmail \|\| undefined,\s*parentName: formData\.parentName \|\| undefined",
    "parentEmail: formData.parentEmail || undefined,\n        parentName: formData.parentName || undefined,\n        guardianPhone: formData.guardianPhone || undefined",
    sa_content
)
# Make sure the initial state also has guardianPhone (just regex all of them)
sa_content = re.sub(
    r"useState\(\{ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '' \}\)",
    "useState({ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '', guardianPhone: '' })",
    sa_content
)
with open('components/views/StudentsAttendance.tsx', 'w', encoding='utf-8') as f:
    f.write(sa_content)

# 3. Update AddStudentModal.tsx
with open('components/views/students/AddStudentModal.tsx', 'r', encoding='utf-8') as f:
    modal_content = f.read()

phone_input = """          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Guardian Phone
            </label>
            <input 
              type="tel"
              value={formData.guardianPhone || ''}
              onChange={(e) => setFormData({...formData, guardianPhone: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm"
              placeholder="e.g. +91 9876543210"
            />
          </div>
"""

modal_content = modal_content.replace(
    '</form>',
    f'{phone_input}        </form>'
)
# Fix orange to primary if any
modal_content = modal_content.replace('orange-500', 'primary')

with open('components/views/students/AddStudentModal.tsx', 'w', encoding='utf-8') as f:
    f.write(modal_content)

# 4. Update StudentProfileModal.tsx
with open('components/views/students/StudentProfileModal.tsx', 'r', encoding='utf-8') as f:
    prof_content = f.read()

phone_display = """            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-semibold text-sm">Guardian Phone</span>
              <span className="text-slate-900 font-bold text-sm">{viewStudent.guardianPhone || 'N/A'}</span>
            </div>
"""
prof_content = prof_content.replace(
    '<div className="flex justify-between border-b border-slate-100 pb-2">\n              <span className="text-slate-500 font-semibold text-sm">Status</span>',
    phone_display + '            <div className="flex justify-between border-b border-slate-100 pb-2">\n              <span className="text-slate-500 font-semibold text-sm">Status</span>'
)
with open('components/views/students/StudentProfileModal.tsx', 'w', encoding='utf-8') as f:
    f.write(prof_content)

print("Patched!")
