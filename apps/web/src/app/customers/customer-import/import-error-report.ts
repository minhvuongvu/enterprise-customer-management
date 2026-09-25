import type { ImportRowError } from '@ecm/contracts';

/**
 * The failed rows of an import as a CSV the user can open next to their own.
 *
 * Built in the browser from the result the server already sent: there is
 * nothing to fetch, and a second endpoint that re-derived the same list would
 * be a second definition of it.
 *
 * Row numbers are the spreadsheet's (header = row 1), so the report points at
 * the line the user will edit. The reason is a code, not the server's
 * developer prose, which the user is never shown.
 *
 * Every cell is quoted, and a cell a spreadsheet would evaluate - one starting
 * with `=`, `+`, `-`, `@`, tab or CR - is prefixed with an apostrophe. Column
 * names come from the user's own header row, so this file is as untrusted as
 * the one they uploaded.
 */
export function importErrorReport(errors: readonly ImportRowError[]): Blob {
  const lines = [
    ['row', 'column', 'code'],
    ...errors.map((error) => [String(error.row), error.column ?? '', error.code]),
  ].map((cells) => cells.map(csvCell).join(','));
  return new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

function csvCell(value: string): string {
  const neutralised = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralised.replace(/"/g, '""')}"`;
}
