export interface StudentImportRow {
  name: string;
  rollNumber: string;
  guardianName: string;
  guardianPhone: string;
}

export interface StudentImportPreview {
  rows: Array<{ rowNumber: number; data: StudentImportRow; errors: string[] }>;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: string[];
  totalRows: number;
  valid: boolean;
  payload: StudentImportRow[];
}

export const STUDENT_IMPORT_TEMPLATE = 'name,rollNumber,guardianName,guardianPhone\r\n';

const fields: Array<keyof StudentImportRow> = ['name', 'rollNumber', 'guardianName', 'guardianPhone'];
const aliases: Record<keyof StudentImportRow, string[]> = {
  name: ['name', 'student name', 'student_name', 'studentname'],
  rollNumber: ['rollnumber', 'roll number', 'roll_number', 'roll no', 'roll no.', 'roll', 'id', 'student id', 'student_id', 'studentid'],
  guardianName: ['guardianname', 'guardian name', 'guardian_name', 'parentname', 'parent name', 'parent_name'],
  guardianPhone: ['guardianphone', 'guardian phone', 'guardian_phone', 'parentphone', 'parent phone', 'parent_phone', 'phone', 'contact'],
};

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

  if (!header) errors.push({ rowNumber: 1, message: 'The file is empty. Add the required headers and at least one student.' });
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
    for (const field of fields) {
      if (!columns.has(field)) errors.push({ rowNumber: 1, message: `Missing required column: ${field}.` });
    }
  }
  if (ignored.length) warnings.push(`These columns will be ignored: ${ignored.join(', ')}. Only the four required fields are imported.`);
  if (!records.length) errors.push({ rowNumber: 1, message: 'No student rows found. Fill in the template before importing.' });

  const rows: StudentImportPreview['rows'] = records.map(record => {
    const data = Object.fromEntries(fields.map(field => [field, record.cells[columns.get(field) ?? -1] ?? ''])) as unknown as StudentImportRow;
    const rowErrors = [...record.errors];
    if (record.cells.length !== header?.cells.length) rowErrors.push(`Expected ${header?.cells.length} columns, found ${record.cells.length}.`);
    for (const field of fields) {
      if (!data[field]) rowErrors.push(`${field} is required.`);
    }
    if (data.guardianPhone) {
      const digits = data.guardianPhone.replace(/\D/g, '');
      if (!/^\+?[\d\s().-]+$/.test(data.guardianPhone) || digits.length < 7 || digits.length > 15) {
        rowErrors.push('guardianPhone must contain 7–15 digits, with an optional leading + and phone separators.');
      }
    }
    return { rowNumber: record.rowNumber, data, errors: rowErrors };
  });

  const rolls = new Map<string, StudentImportPreview['rows']>();
  for (const row of rows) {
    if (!row.data.rollNumber) continue;
    const matches = rolls.get(row.data.rollNumber) ?? [];
    matches.push(row); rolls.set(row.data.rollNumber, matches);
  }
  for (const matches of rolls.values()) {
    if (matches.length > 1) {
      for (const row of matches) row.errors.push('Duplicate roll number in this file. Each student needs a unique roll number.');
    }
  }
  for (const row of rows) {
    for (const message of row.errors) errors.push({ rowNumber: row.rowNumber, message });
  }
  const valid = errors.length === 0;
  return { rows, errors, warnings, totalRows: rows.length, valid, payload: valid ? rows.map(row => row.data) : [] };
}
