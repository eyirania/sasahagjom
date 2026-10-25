// Values arrive as PostgreSQL text, before any JavaScript date/number conversion.
export function encodeCsv(columns: string[], rows: (string | null)[][]): string {
  const cell = (value: string | null) => value === null ? '' : `"${value.replaceAll('"', '""')}"`
  return [columns.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n') + '\r\n'
}
