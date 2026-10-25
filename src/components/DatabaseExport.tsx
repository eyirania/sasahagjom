import { useEffect, useState } from 'react'
import { exportDatabaseCsv } from '../server/exports.functions'

type ExportResult = Awaited<ReturnType<typeof exportDatabaseCsv>>

export function DatabaseExport() {
  const [result, setResult] = useState<ExportResult | null>(null)
  const [links, setLinks] = useState<{ filename: string; rowCount: number; url: string }[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const downloads = (result?.files ?? []).map((file) => ({
      filename: file.filename,
      rowCount: file.rowCount,
      url: URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' })),
    }))
    setLinks(downloads)
    return () => downloads.forEach((file) => URL.revokeObjectURL(file.url))
  }, [result])

  async function prepare() {
    setPending(true)
    setError('')
    setResult(null)
    try {
      setResult(await exportDatabaseCsv())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV를 준비하지 못했습니다. 다시 시도하세요.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-6" aria-labelledby="database-export-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="database-export-title" className="text-lg font-semibold text-gray-900">운영 DB CSV 내보내기</h2>
          <p className="text-sm text-gray-500 mt-1">5개 테이블의 모든 행과 컬럼을 같은 시점 기준으로 내보냅니다.</p>
          <p className="text-xs text-gray-500 mt-2">운영 사이트에서 관리자만 사용할 수 있습니다. 파일은 공개 저장 없이 이 브라우저에서 다운로드합니다.</p>
        </div>
        <button type="button" onClick={prepare} disabled={pending}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900">
          {pending ? '전체 데이터 준비 중…' : result ? '최신 데이터로 다시 준비' : 'CSV 5개 준비'}
        </button>
      </div>
      <div aria-live="polite" aria-busy={pending}>
        {pending && <p className="text-sm text-gray-500 mt-4">전체 데이터를 읽고 있습니다.</p>}
        {error && <p role="alert" className="text-sm text-red-700 mt-4">{error}</p>}
        {links.length > 0 && (
          <div className="overflow-x-auto mt-5">
            <table className="w-full text-sm text-left">
              <caption className="text-left text-xs text-gray-500 mb-3">준비한 CSV의 데이터 행 수입니다. 헤더는 행 수에 포함하지 않습니다.</caption>
              <thead><tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4">파일</th><th className="py-2 pr-4 text-right">행 수</th><th className="py-2 text-right">다운로드</th>
              </tr></thead>
              <tbody>{links.map((file) => (
                <tr key={file.filename} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-mono text-xs text-gray-700">{file.filename}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{file.rowCount.toLocaleString('ko-KR')}</td>
                  <td className="py-3 text-right"><a href={file.url} download={file.filename}
                    className="font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-label={`${file.filename} 다운로드`}>CSV 저장</a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
