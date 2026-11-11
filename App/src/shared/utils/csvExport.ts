export type CsvCell = string | number | null | undefined | boolean

export interface CsvTable {
  /** Optional section title written above the table (e.g. 工单明细). */
  title?: string
  headers: string[]
  rows: CsvCell[][]
}

export interface DownloadCsvOptions {
  filename: string
  headers: string[]
  rows: CsvCell[][]
}

export interface DownloadCsvWorkbookOptions {
  filename: string
  sheets: CsvTable[]
}

function normalizeCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

/** Escape one CSV cell for Excel-friendly UTF-8 output. */
export function escapeCsvCell(value: CsvCell): string {
  const text = normalizeCell(value)
  return `"${text.replaceAll('"', '""')}"`
}

/** Build a single CSV table body (optional title + header + rows). */
export function buildCsvTable({ title, headers, rows }: CsvTable): string {
  const lines: string[] = []
  if (title?.trim()) lines.push(escapeCsvCell(title.trim()))
  lines.push(headers.map(escapeCsvCell).join(','))
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','))
  }
  return lines.join('\n')
}

/** Build one or more CSV tables into a single downloadable document. */
export function buildCsvDocument(sheets: CsvTable[]): string {
  return sheets
    .filter((sheet) => sheet.headers.length > 0)
    .map((sheet) => buildCsvTable(sheet))
    .join('\n\n')
}

function ensureCsvFilename(filename: string): string {
  const trimmed = filename.trim() || 'export.csv'
  return trimmed.toLowerCase().endsWith('.csv') ? trimmed : `${trimmed}.csv`
}

/** Trigger a browser download for a CSV string (UTF-8 BOM for Excel). */
export function downloadCsvText(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = ensureCsvFilename(filename)
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Download a single-sheet CSV. */
export function downloadCsv({ filename, headers, rows }: DownloadCsvOptions): void {
  downloadCsvText(filename, buildCsvDocument([{ headers, rows }]))
}

/**
 * Download a multi-section CSV workbook (multiple tables in one file).
 * Useful when one business export needs master + related history rows.
 */
export function downloadCsvWorkbook({ filename, sheets }: DownloadCsvWorkbookOptions): void {
  downloadCsvText(filename, buildCsvDocument(sheets))
}

export function csvDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}
