// CSV export helpers.
//
// A cell that starts with = + - @ (or a tab / carriage return) is read by Excel, LibreOffice and Google Sheets as a
// formula. Several exported fields come from the public lead form, so a visitor could plant =HYPERLINK(...) or a
// DDE command that runs when an administrator opens the file (QA phase 17, P17-D03). Such cells get a leading
// apostrophe, which spreadsheets treat as "this is text" and do not show.

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

// A phone number such as +963 944 123 456 starts with "+" but holds only digits and separators: no function, cell
// reference or command can be in it, and a visible apostrophe in front of every exported number would be a nuisance.
const PLAIN_NUMBER = /^[+-]?[0-9][0-9\s().-]*$/;

/** The value as safe, quoted CSV text. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');

  if (FORMULA_TRIGGER.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',');
}
