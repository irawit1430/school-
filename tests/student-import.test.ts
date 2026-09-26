// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importResultCsv, parseStudentImportCSV, STUDENT_IMPORT_TEMPLATE } from '../lib/studentImport';
import { checkStudentImport, clearApiCache, commitStudentImport, fetchStats } from '../lib/api';

const header = 'studentId,name,grade,guardianName,guardianPhone,parentEmail,route,stop,cardCode';

describe('roster CSV reading', () => {
  it('reads every roster column into what the server takes, keeping leading zeros', () => {
    const result = parseStudentImportCSV(header + '\n0007,Asha Kumari,5B,Sunita Devi,+91 98765 43210,Sunita@Mail.com,Route 1,Rajendra Nagar,');
    expect(result.valid).toBe(true);
    expect(result.payload).toEqual([{
      line: 2, rfidTag: '0007', name: 'Asha Kumari', grade: '5B', guardianPhone: '+91 98765 43210',
      parentEmail: 'sunita@mail.com', parentName: 'Sunita Devi', route: 'Route 1', stop: 'Rajendra Nagar', qrToken: null,
    }]);
  });

  it('needs only a Student ID and a name; the rest can come later', () => {
    const result = parseStudentImportCSV('Admission No,Student Name\nA-1,Asha');
    expect(result.valid).toBe(true);
    expect(result.payload[0]).toMatchObject({ rfidTag: 'A-1', name: 'Asha', parentEmail: null, route: null });
    // But says what that leaves undone.
    expect(result.warnings.join(' ')).toMatch(/no parentEmail column/);
    expect(result.warnings.join(' ')).toMatch(/no route and stop columns/);
  });

  it('still reads the old four-column file: its roll number is the Student ID', () => {
    const result = parseStudentImportCSV('name,rollNumber,guardianName,guardianPhone\nAsha,R-4,Rani,9876543210');
    expect(result.valid).toBe(true);
    expect(result.payload[0]).toMatchObject({ rfidTag: 'R-4', name: 'Asha', parentName: 'Rani', guardianPhone: '9876543210' });
  });

  it('preserves quoted commas, escaped quotes, multiline values, BOM and CRLF', () => {
    const result = parseStudentImportCSV('﻿' + 'studentId,name,guardianName\r\n0007,"Patel, Asha","Ravi ""Raj""\r\nPatel"\r\n');
    expect(result.valid).toBe(true);
    expect(result.payload[0]).toMatchObject({ rfidTag: '0007', name: 'Patel, Asha', parentName: 'Ravi "Raj"\nPatel' });
  });

  it.each([
    ['a missing Student ID', 'A-1,Asha\n,Bina', /Line 3: studentId is required/],
    ['a Student ID twice, whatever the case', 'r1,Asha\nR1,Bina', /Duplicate studentId/],
  ])('reports %s by line', (_label, rows, message) => {
    const result = parseStudentImportCSV('studentId,name\n' + rows);
    expect(result.valid).toBe(false);
    expect(result.errors.map(e => `Line ${e.rowNumber}: ${e.message}`).join('\n')).toMatch(message);
    expect(result.payload).toEqual([]);
  });

  it.each([
    ['a bad email', 'A,Asha,not-an-email,,', /parentEmail is not a valid email/],
    ['a route without a stop', 'A,Asha,,Route 1,', /A route needs a stop/],
    ['a stop without a route', 'A,Asha,,,Gate', /A stop needs its route/],
  ])('rejects %s', (_label, row, message) => {
    const result = parseStudentImportCSV('studentId,name,parentEmail,route,stop\n' + row);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => message.test(e.message))).toBe(true);
  });

  it('rejects a card code used twice in the file', () => {
    const result = parseStudentImportCSV('studentId,name,cardCode\nA,Asha,CARD-1\nB,Bina,CARD-1');
    expect(result.rows.every(r => r.errors.some(e => /Duplicate cardCode/.test(e)))).toBe(true);
  });

  it('rejects non-phone text and keeps formatted phone numbers', () => {
    expect(parseStudentImportCSV('studentId,name,guardianPhone\nA,Asha,hello').valid).toBe(false);
    expect(parseStudentImportCSV('studentId,name,guardianPhone\nA,Asha,+91 (98765) 43210').payload[0].guardianPhone).toBe('+91 (98765) 43210');
  });

  it('rejects ambiguous and duplicate headers', () => {
    expect(parseStudentImportCSV('studentId,name,student name\nA,Asha,Asha').errors.some(e => /ambiguous/i.test(e.message))).toBe(true);
    expect(parseStudentImportCSV('studentId,name,Foo,foo\nA,Asha,1,2').errors.some(e => /duplicate header/i.test(e.message))).toBe(true);
  });

  it.each([
    '"A,Asha',
    'A,Ash"a',
    '"A"oops,Asha',
  ])('rejects malformed quoting: %s', row => {
    const result = parseStudentImportCSV('studentId,name\n' + row);
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => /quot/i.test(error.message))).toBe(true);
  });

  it('uses physical line numbers after quoted multiline records', () => {
    const result = parseStudentImportCSV('studentId,name\nA,"Asha\nPatel"\n,Other');
    expect(result.rows[1].rowNumber).toBe(4);
    expect(result.errors.some(error => error.rowNumber === 4)).toBe(true);
  });

  it('provides a header-only template with every roster column', () => {
    expect(STUDENT_IMPORT_TEMPLATE).toBe(header + '\r\n');
    expect(parseStudentImportCSV(STUDENT_IMPORT_TEMPLATE).valid).toBe(false);
    expect(parseStudentImportCSV('').valid).toBe(false);
  });
});

describe('the results file', () => {
  it('lists every row with its result and problems, safe to open in Excel', () => {
    const csv = importResultCsv([
      { line: 2, rfidTag: 'A-1', name: 'Asha', state: 'INVITE_READY', parent: { action: 'NEW', email: 'a@x.com' }, stop: { action: 'ASSIGN', route: 'Route 1', stop: 'Gate' }, errors: [], warnings: [] },
      { line: 3, rfidTag: '=HYPERLINK("x")', name: 'Bina, K', state: 'NEEDS_CORRECTION', parent: { action: 'NONE', email: null }, stop: { action: 'NONE', route: null, stop: null }, errors: ['No route called "Route 9".'], warnings: [] },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('line,studentId,name,result,parent,stop,problems');
    expect(lines[1]).toBe('2,A-1,Asha,INVITE_READY,NEW a@x.com,Route 1 / Gate,');
    expect(lines[2]).toBe('3,"\'=HYPERLINK(""x"")","Bina, K",NEEDS_CORRECTION,none,none,"No route called ""Route 9""."');
  });
});

describe('roster import API', () => {
  beforeEach(() => {
    clearApiCache();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'voltava_user' ? JSON.stringify({ schoolId: 'school-test' }) : null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ dryRun: true, committed: false, totals: {}, rows: [] }), { status: 200 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); clearApiCache(); });

  const rows = parseStudentImportCSV(header + '\n0007,Asha,5B,Rani,9876543210,rani@x.com,Route 1,Gate,').payload;

  it('checks with a dry run, then imports the same rows', async () => {
    await checkStudentImport(rows);
    await commitStudentImport(rows);
    const [[checkUrl, checkInit], [commitUrl, commitInit]] = vi.mocked(fetch).mock.calls;
    expect(String(checkUrl)).toMatch(/\/schools\/school-test\/students\/bulk\?dryRun=1$/);
    expect(String(commitUrl)).toMatch(/\/schools\/school-test\/students\/bulk$/);
    expect(JSON.parse(String(checkInit?.body))).toEqual(rows);
    expect(JSON.parse(String(commitInit?.body))).toEqual(rows);
  });

  it('hands back a refused import as its per-row results, not as a bare error', async () => {
    const refused = { error: '1 row needs correcting. Nothing was imported.', dryRun: false, committed: false, totals: { needsCorrection: 1 }, rows: [{ line: 2, errors: ['x'] }] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(refused), { status: 409 }));
    await expect(commitStudentImport(rows)).resolves.toMatchObject({ committed: false, totals: { needsCorrection: 1 } });
  });

  it('still throws any other failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Import aborted: taken' }), { status: 409 }));
    await expect(commitStudentImport(rows)).rejects.toMatchObject({ status: 409, message: 'Import aborted: taken' });
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
