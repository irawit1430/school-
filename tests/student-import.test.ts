// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStudentImportCSV, STUDENT_IMPORT_TEMPLATE } from '../lib/studentImport';
import { clearApiCache, fetchStats, importStudentsCSV } from '../lib/api';

const header = 'name,rollNumber,guardianName,guardianPhone';

describe('student CSV import validation', () => {
  it('preserves quoted commas, escaped quotes, multiline values, BOM and CRLF', () => {
    const result = parseStudentImportCSV('\uFEFF' + header + '\r\n"Patel, Asha",0007,"Ravi ""Raj""\r\nPatel",+919876543210\r\n');
    expect(result.valid).toBe(true);
    expect(result.totalRows).toBe(1);
    expect(result.payload).toEqual([{
      name: 'Patel, Asha', rollNumber: '0007', guardianName: 'Ravi "Raj"\nPatel', guardianPhone: '+919876543210',
    }]);
  });

  it('matches only explicit aliases and allows columns in a different order', () => {
    const result = parseStudentImportCSV('Guardian Phone,Roll Number,Parent Name,Student Name\n09876543210,R-4,Parent,Student');
    expect(result.valid).toBe(true);
    expect(result.payload[0]).toEqual({ name: 'Student', rollNumber: 'R-4', guardianName: 'Parent', guardianPhone: '09876543210' });
  });

  it('does not mistake RFID or parent email for roll number or student name', () => {
    const result = parseStudentImportCSV('parent email,rfid,guardian name,guardian phone\nparent@example.com,RFID1,Parent,9876543210');
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.message.includes('name'))).toBe(true);
    expect(result.errors.some(error => error.message.includes('rollNumber'))).toBe(true);
    expect(result.payload).toEqual([]);
  });

  it('rejects multiple headers mapping to the same required field', () => {
    const result = parseStudentImportCSV(header + ',student name\nStudent,R1,Parent,9876543210,Other Student');
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => /ambiguous/i.test(error.message))).toBe(true);
  });

  it('rejects duplicate unknown headers too', () => {
    const result = parseStudentImportCSV(header + ',Grade, grade \nStudent,R1,Parent,9876543210,1,2');
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => /duplicate/i.test(error.message))).toBe(true);
  });

  it('previews all rows and prevents partial import if one row is incomplete', () => {
    const result = parseStudentImportCSV(header + '\nStudent,R1,Parent,9876543210\nOther,R2,,');
    expect(result.totalRows).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].rowNumber).toBe(3);
    expect(result.rows[1].errors).toEqual(expect.arrayContaining(['guardianName is required.', 'guardianPhone is required.']));
    expect(result.valid).toBe(false);
    expect(result.payload).toEqual([]);
  });

  it('reports a blank interior row instead of silently dropping it', () => {
    const result = parseStudentImportCSV(header + '\nStudent,R1,Parent,9876543210\n\nOther,R2,Parent,9876543210');
    expect(result.totalRows).toBe(3);
    expect(result.rows.find(row => row.rowNumber === 3)?.errors.length).toBeGreaterThan(0);
    expect(result.valid).toBe(false);
  });

  it.each([
    'Student,R1,Parent',
    'Student,R1,Parent,9876543210,unexpected',
  ])('reports a row with the wrong number of columns: %s', row => {
    const result = parseStudentImportCSV(header + '\n' + row);
    expect(result.errors.some(error => /columns/i.test(error.message))).toBe(true);
    expect(result.payload).toEqual([]);
  });

  it.each([
    '"Student,R1,Parent,9876543210',
    'Stu"dent,R1,Parent,9876543210',
    '"Student"oops,R1,Parent,9876543210',
  ])('rejects malformed quoting: %s', row => {
    const result = parseStudentImportCSV(header + '\n' + row);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => /quot/i.test(error.message))).toBe(true);
  });

  it('flags both rows sharing the same roll number', () => {
    const result = parseStudentImportCSV(header + '\nStudent,R1,Parent,9876543210\nOther, R1 ,Parent,9876543210');
    expect(result.rows.every(row => row.errors.some(error => /duplicate roll number/i.test(error)))).toBe(true);
    expect(result.payload).toEqual([]);
  });

  it('warns about ignored fields and excludes them from the payload', () => {
    const result = parseStudentImportCSV(header + ',grade,parentEmail,rfidTag\nStudent,R1,Parent,9876543210,5,parent@example.com,RFID1');
    expect(result.valid).toBe(true);
    expect(result.warnings.join(' ')).toContain('grade');
    expect(result.warnings.join(' ')).toContain('parentEmail');
    expect(result.warnings.join(' ')).toContain('rfidTag');
    expect(Object.keys(result.payload[0])).toEqual(['name', 'rollNumber', 'guardianName', 'guardianPhone']);
  });

  it('rejects non-phone text and preserves formatted phone numbers', () => {
    expect(parseStudentImportCSV(header + '\nStudent,R1,Parent,hello').valid).toBe(false);
    expect(parseStudentImportCSV(header + '\nStudent,R1,Parent,+91 (98765) 43210').payload[0].guardianPhone).toBe('+91 (98765) 43210');
  });

  it('uses physical line numbers after quoted multiline records', () => {
    const result = parseStudentImportCSV(header + '\n"Asha\nPatel",R1,Parent,9876543210\nOther,R2,,9876543210');
    expect(result.rows[1].rowNumber).toBe(4);
    expect(result.errors.some(error => error.rowNumber === 4)).toBe(true);
  });

  it('provides a header-only template and rejects files without data rows', () => {
    expect(STUDENT_IMPORT_TEMPLATE).toBe(header + '\r\n');
    expect(parseStudentImportCSV(STUDENT_IMPORT_TEMPLATE).valid).toBe(false);
    expect(parseStudentImportCSV('').valid).toBe(false);
  });
});

describe('student import API boundary and optional stats failures', () => {
  beforeEach(() => {
    clearApiCache();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'voltava_user' ? JSON.stringify({ schoolId: 'school-test' }) : null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); clearApiCache(); });

  it('submits exactly the validated four-field payload', async () => {
    const file = new File([header + ',grade\n"Patel, Asha",0007,Parent,+919876543210,4'], 'students.csv');
    await importStudentsCSV(file);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/schools\/school-test\/students\/bulk$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual([{ name: 'Patel, Asha', rollNumber: '0007', guardianName: 'Parent', guardianPhone: '+919876543210' }]);
  });

  it('never sends any request for an invalid file, including a super-admin school lookup', async () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ role: 'SUPER_ADMIN' }) });
    const file = new File([header + '\nStudent,R1,Parent,9876543210\nOther,R2,,'], 'students.csv');
    await expect(importStudentsCSV(file)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports file read errors without a request', async () => {
    const file = { text: () => Promise.reject(new Error('Cannot read file')) } as File;
    await expect(importStudentsCSV(file)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves backend import failure status and validation details', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Roll number exists', issues: [{ path: 'rollNumber', message: 'Roll number R1 is already registered.' }] }), { status: 409 }));
    const file = new File([header + '\nStudent,R1,Parent,9876543210'], 'students.csv');
    await expect(importStudentsCSV(file)).rejects.toMatchObject({ status: 409, issues: [{ path: 'rollNumber', message: 'Roll number R1 is already registered.' }] });
  });

  it('preserves the existing stats fallback but lets strict callers detect fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Offline'));
    await expect(fetchStats()).resolves.toEqual({});
    await expect(fetchStats({ strict: true })).rejects.toMatchObject({ status: 0 });
  });

  it('lets strict stats callers detect missing school context', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    await expect(fetchStats()).resolves.toEqual({});
    await expect(fetchStats({ strict: true })).rejects.toMatchObject({ status: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
