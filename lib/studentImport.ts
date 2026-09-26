/**
 * The school's whole transport roster in one CSV: who each child is, their class, their
 * guardian, the parent's sign-in email, and the route and stop they ride from.
 *
 * The old importer took four columns and told the office to link parents and assign stops
 * by hand afterwards, which for a 1,200-child school is days of clicking and a mislinked
 * child somewhere in it. This reads the columns; the server then checks every row against
 * the school's real routes, stops, parents and cards (a dry run) before anything is saved.
 *
 * Only the Student ID and name are required. Everything else is optional per row, and a
 * row without a parent email or a stop is imported but reported as not ready.
 */
export interface StudentImportRow {
  studentId: string;
  name: string;
  grade: string;
  guardianName: string;
  guardianPhone: string;
  parentEmail: string;
  route: string;
  stop: string;
  cardCode: string;
}

/** What the server receives for one row (schemas.rosterRow on the backend). */
export interface RosterPayloadRow {
  line: number;
  rfidTag: string;
  name: string;
  grade: string | null;
  guardianPhone: string | null;
  parentEmail: string | null;
  parentName: string | null;
  route: string | null;
  stop: string | null;
  qrToken: string | null;
}

export interface StudentImportPreview {
  rows: Array<{ rowNumber: number; data: StudentImportRow; errors: string[] }>;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: string[];
  totalRows: number;
  valid: boolean;
  payload: RosterPayloadRow[];
}

const fields: Array<keyof StudentImportRow> = ['studentId', 'name', 'grade', 'guardianName', 'guardianPhone', 'parentEmail', 'route', 'stop', 'cardCode'];
const required: Array<keyof StudentImportRow> = ['studentId', 'name'];

export const STUDENT_IMPORT_TEMPLATE = fields.join(',') + '\r\n';

/** What each column means, for the import screen. */
export const STUDENT_IMPORT_COLUMNS: Array<{ field: keyof StudentImportRow; label: string; help: string; required?: boolean }> = [
  { field: 'studentId', label: 'studentId', required: true, help: 'Admission or roll number. Unique per child. Keeps leading zeros if the cell is text.' },
  { field: 'name', label: 'name', required: true, help: "The child's full name." },
  { field: 'grade', label: 'grade', help: 'Class and section, e.g. 5B.' },
  { field: 'guardianName', label: 'guardianName', help: 'Used as the parent account name.' },
  { field: 'guardianPhone', label: 'guardianPhone', help: 'For WhatsApp or SMS invites and calls.' },
  { field: 'parentEmail', label: 'parentEmail', help: "The parent's sign-in. Siblings share one. Without it the family cannot use the app." },
  { field: 'route', label: 'route', help: 'Exactly as named on the Routes page.' },
  { field: 'stop', label: 'stop', help: 'A stop on that route, exactly as named there.' },
  { field: 'cardCode', label: 'cardCode', help: "Only if the child already has the school's own ID card to scan. Leave empty to print new cards." },
];

const aliases: Record<keyof StudentImportRow, string[]> = {
  studentId: ['studentid', 'student id', 'student_id', 'admission no', 'admission no.', 'admission number', 'admission_no', 'admissionno', 'rollnumber', 'roll number', 'roll_number', 'roll no', 'roll no.', 'roll', 'id', 'rfid', 'rfid tag', 'rfidtag'],
  name: ['name', 'student name', 'student_name', 'studentname'],
  grade: ['grade', 'class', 'class/section', 'class section', 'class_section', 'section', 'std', 'standard'],
  guardianName: ['guardianname', 'guardian name', 'guardian_name', 'parentname', 'parent name', 'parent_name', 'father name', 'mother name'],
  guardianPhone: ['guardianphone', 'guardian phone', 'guardian_phone', 'parentphone', 'parent phone', 'parent_phone', 'phone', 'mobile', 'contact', 'whatsapp'],
  parentEmail: ['parentemail', 'parent email', 'parent_email', 'guardian email', 'guardianemail', 'guardian_email', 'email', 'email id'],
  route: ['route', 'route name', 'route_name', 'bus route'],
  stop: ['stop', 'stop name', 'stop_name', 'pickup stop', 'bus stop'],
  cardCode: ['cardcode', 'card code', 'card_code', 'card', 'card number', 'qr', 'qr code', 'qrcode', 'qrtoken'],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CsvRecord { rowNumber: number; cells: string[]; errors: string[] }

// Track physical line numbers, including newlines inside quoted cells, so a user can
// find the offending record in their original file. A final line ending is not a row.
function readCsv(text: string): CsvRecord[] {
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let errors: string[] = [];
  let cell = '';
  let state: 'start' | 'unquoted' | 'quoted' | 'closed' = 'start';
  let line = 1;
  let rowNumber = 1;
  let rowStarted = false;

  const finishCell = () => { cells.push(cell.trim()); cell = ''; state = 'start'; };
  const finishRow = () => {
    finishCell();
    records.push({ rowNumber, cells, errors: [...new Set(errors)] });
    cells = []; errors = []; rowStarted = false;
  };

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (state === 'quoted') {
      if (char === '"') {
        if (input[index + 1] === '"') { cell += '"'; index++; }
        else state = 'closed';
      } else {
        cell += char;
        if (char === '\n') line++;
      }
      continue;
    }
    if (char === '\n') {
      finishRow(); line++; rowNumber = line;
      continue;
    }
    rowStarted = true;
    if (char === ',') { finishCell(); continue; }
    if (state === 'closed') {
      if (char === ' ' || char === '\t') continue;
      errors.push('Unexpected text after a closing quote.');
      state = 'unquoted';
    }
    if (char === '"') {
      if (state === 'start') { cell = ''; state = 'quoted'; }
      else { errors.push('Unexpected quote. Quote the whole field and double any embedded quotes.'); cell += char; }
    } else {
      cell += char;
      if (char !== ' ' && char !== '\t') state = 'unquoted';
    }
  }
  if (state === 'quoted') errors.push('Unclosed quoted field.');
  if (rowStarted || cells.length > 0) finishRow();
  return records;
}

export function parseStudentImportCSV(text: string): StudentImportPreview {
  const [header, ...records] = readCsv(text);
  const errors: StudentImportPreview['errors'] = [];
  const warnings: string[] = [];
  const columns = new Map<keyof StudentImportRow, number>();
  const seenHeaders = new Set<string>();
  const ignored: string[] = [];

  if (!header) errors.push({ rowNumber: 1, message: 'The file is empty. Add the headers and at least one student.' });
  for (const message of header?.errors ?? []) errors.push({ rowNumber: 1, message });
  header?.cells.forEach((value, index) => {
    const normalized = value.toLowerCase().replace(/\s+/g, ' ');
    if (!normalized) errors.push({ rowNumber: 1, message: `Column ${index + 1} needs a header.` });
    else if (seenHeaders.has(normalized)) errors.push({ rowNumber: 1, message: `Duplicate header: ${value}.` });
    seenHeaders.add(normalized);
    const field = fields.find(key => aliases[key].includes(normalized));
    if (!field) { if (value) ignored.push(value); return; }
    if (columns.has(field)) errors.push({ rowNumber: 1, message: `Ambiguous headers: more than one column maps to ${field}. Keep only one.` });
    else columns.set(field, index);
  });
  if (header) {
    for (const field of required) {
      if (!columns.has(field)) errors.push({ rowNumber: 1, message: `Missing required column: ${field}.` });
    }
  }
  if (ignored.length) warnings.push(`These columns are not part of the roster and will be ignored: ${ignored.join(', ')}.`);
  if (header && !columns.has('parentEmail')) warnings.push('There is no parentEmail column, so no family will be able to sign in to the parent app until an email is added.');
  if (header && !columns.has('route')) warnings.push('There are no route and stop columns, so no child will be on a bus until stops are assigned.');
  if (!records.length) errors.push({ rowNumber: 1, message: 'No student rows found. Fill in the template before importing.' });

  const rows: StudentImportPreview['rows'] = records.map(record => {
    const data = Object.fromEntries(fields.map(field => [field, record.cells[columns.get(field) ?? -1] ?? ''])) as unknown as StudentImportRow;
    const rowErrors = [...record.errors];
    if (record.cells.length !== header?.cells.length) rowErrors.push(`Expected ${header?.cells.length} columns, found ${record.cells.length}.`);
    for (const field of required) {
      if (!data[field]) rowErrors.push(`${field} is required.`);
    }
    if (data.guardianPhone) {
      const digits = data.guardianPhone.replace(/\D/g, '');
      if (!/^\+?[\d\s().-]+$/.test(data.guardianPhone) || digits.length < 7 || digits.length > 15) {
        rowErrors.push('guardianPhone must contain 7–15 digits, with an optional leading + and phone separators.');
      }
    }
    if (data.parentEmail && !EMAIL.test(data.parentEmail)) rowErrors.push('parentEmail is not a valid email address.');
    if (Boolean(data.route) !== Boolean(data.stop)) rowErrors.push(data.route ? 'A route needs a stop.' : 'A stop needs its route.');
    if (data.cardCode && data.cardCode.length < 4) rowErrors.push('cardCode is too short to be a real card (at least 4 characters).');
    return { rowNumber: record.rowNumber, data, errors: rowErrors };
  });

  // The same Student ID twice is one child typed twice far more often than two children.
  const flagDuplicates = (key: (row: StudentImportPreview['rows'][number]) => string, message: string) => {
    const seen = new Map<string, StudentImportPreview['rows']>();
    for (const row of rows) {
      const k = key(row);
      if (!k) continue;
      seen.set(k, [...(seen.get(k) ?? []), row]);
    }
    for (const matches of seen.values()) if (matches.length > 1) for (const row of matches) row.errors.push(message);
  };
  flagDuplicates(row => row.data.studentId.toLowerCase(), 'Duplicate studentId in this file. Each child needs a unique Student ID.');
  flagDuplicates(row => row.data.cardCode, 'Duplicate cardCode in this file. Each card belongs to one child.');

  for (const row of rows) {
    for (const message of row.errors) errors.push({ rowNumber: row.rowNumber, message });
  }
  const valid = errors.length === 0;
  const orNull = (v: string) => (v ? v : null);
  return {
    rows, errors, warnings, totalRows: rows.length, valid,
    payload: valid ? rows.map(({ rowNumber, data }) => ({
      line: rowNumber,
      rfidTag: data.studentId,
      name: data.name,
      grade: orNull(data.grade),
      guardianPhone: orNull(data.guardianPhone),
      parentEmail: orNull(data.parentEmail.toLowerCase()),
      parentName: orNull(data.guardianName),
      route: orNull(data.route),
      stop: orNull(data.stop),
      qrToken: orNull(data.cardCode),
    })) : [],
  };
}

/** One CSV of every row and what happens to it, to fix in a spreadsheet and upload again. */
export function importResultCsv(rows: Array<{ line: number; rfidTag: string; name: string; state: string; parent: { action: string; email: string | null }; stop: { action: string; route: string | null; stop: string | null }; errors: string[]; warnings: string[] }>): string {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    // A leading = + - @ turns a cell into a formula in Excel: prefix it.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ['line', 'studentId', 'name', 'result', 'parent', 'stop', 'problems'];
  const lines = rows.map(r => [
    r.line, r.rfidTag, r.name, r.state,
    r.parent.email ? `${r.parent.action} ${r.parent.email}` : 'none',
    r.stop.route ? `${r.stop.route} / ${r.stop.stop}` : 'none',
    [...r.errors, ...r.warnings].join(' | '),
  ].map(cell).join(','));
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}
