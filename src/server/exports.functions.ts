import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { getDatabase } from '@netlify/database'
import { requireAdminMiddleware } from '../middleware/identity'
import { encodeCsv } from '../lib/csv'

const tables = ['subjects', 'assessment_items', 'students', 'student_scores', 'student_subject_results'] as const
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`

export const exportDatabaseCsv = createServerFn({ method: 'POST' })
  .middleware([requireAdminMiddleware])
  .handler(async () => {
    setResponseHeader('Cache-Control', 'private, no-store')
    setResponseHeader('Netlify-CDN-Cache-Control', 'no-store')
    const client = await getDatabase().pool.connect()
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
      const files = []
      for (const table of tables) {
        const metadata = await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
          [table],
        )
        const columns: string[] = metadata.rows.map((column: { column_name: string }) => column.column_name)
        if (!columns.length) throw new Error('내보낼 테이블을 확인할 수 없습니다.')
        // Casting on the DB side preserves timestamp precision, numeric scale,
        // boolean output and NULL without ORM/driver value conversions.
        const projection = columns.map((column) => `${identifier(column)}::text AS ${identifier(column)}`).join(', ')
        const result = await client.query<Record<string, string | null>>(
          `SELECT ${projection} FROM public.${identifier(table)}`,
        )
        files.push({
          table,
          filename: `${table}.csv`,
          rowCount: result.rows.length,
          csv: encodeCsv(columns, result.rows.map((row: Record<string, string | null>) => columns.map((column) => row[column]))),
        })
      }
      await client.query('COMMIT')
      return { files, environment: process.env.CONTEXT === 'production' ? '운영 사이트 DB' : '현재 미리보기·개발 사이트 DB' }
    } catch {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error('CSV 내보내기에 실패했습니다. 현재 사이트의 DB 연결 상태를 확인한 후 다시 시도하세요.')
    } finally {
      client.release()
    }
  })
