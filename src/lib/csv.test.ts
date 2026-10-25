import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeCsv } from './csv.ts'

test('preserves PostgreSQL text values, NULL, empty strings, precision and CSV escaping', () => {
  const csv = encodeCsv(
    ['id', 'student_id', 'name', 'score', 'updated_at', 'note', 'flag', 'empty'],
    [['12', '3', '세종, "학생"\n이름', '001.2300', '2026-10-25 05:34:22.123456', null, 'false', '']],
  )
  assert.equal(csv,
    '"id","student_id","name","score","updated_at","note","flag","empty"\r\n' +
    '"12","3","세종, ""학생""\n이름","001.2300","2026-10-25 05:34:22.123456",,"false",""\r\n',
  )
  assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(csv)), csv)
})

test('empty tables retain their original column headers', () => {
  assert.equal(encodeCsv(['id', 'subject_id', 'result', 'updated_at'], []),
    '"id","subject_id","result","updated_at"\r\n')
})
