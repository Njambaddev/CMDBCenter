import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

/**
 * Exports an array of flat objects to CSV or Excel (.xlsx) file download.
 */
export function exportRecordsToFile(records = [], filenamePrefix = 'atlancis-export', format = 'xlsx', sheetName = 'Report') {
  if (!Array.isArray(records) || records.length === 0) return;

  const stamp = dayjs().format('YYYYMMDD-HHmm');
  const worksheet = XLSX.utils.json_to_sheet(records);

  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filenamePrefix}-${stamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filenamePrefix}-${stamp}.xlsx`);
}

/**
 * Parses an uploaded CSV or Excel (.xlsx / .xls) File object into an array of row objects.
 */
export function parseSpreadsheetFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) {
          return reject(new Error('Spreadsheet contains no sheets.'));
        }
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
        resolve(rows);
      } catch (err) {
        reject(new Error(`Failed to parse spreadsheet: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsArrayBuffer(file);
  });
}
