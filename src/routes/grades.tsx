import { createFileRoute, redirect } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { getServerUser } from '../lib/auth'
import { getMyGrades, saveMyScore, saveMyResult } from '../server/scores.functions'
import { maximumScore, weightedMaximum, weightedScore, formatPoints, predictGrade, averageGpa, gradeScale } from '../lib/grading'
import type { Assessment } from '../lib/grading'

export const Route = createFileRoute('/grades')({
  beforeLoad: async () => {
    const user = await getServerUser()
    if (!user) throw redirect({ to: '/login' })
  },
  loader: async () => {
    const grades = await getMyGrades()
    return { grades }
  },
  component: GradesPage,
})

function GradesPage() {
  const { grades } = Route.useLoaderData() as { grades: Awaited<ReturnType<typeof getMyGrades>> }
  const [data, setData] = useState(grades)
  const save = useServerFn(saveMyScore)
  const saveResult = useServerFn(saveMyResult)
  const predictions = new Map(data.map((subject) => [
    subject.id,
    subject.gradingType === 'pass_fail' ? null : predictGrade(subject.items.map((item) => ({ ...item, score: item.myScore }))),
  ]))
  const summary = averageGpa(data.map((subject) => ({
    credits: subject.credits,
    gpa: predictions.get(subject.id)?.gpa ?? null,
  })))

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">내 성적 입력</h1>
        <p className="text-sm text-gray-500 mt-1">
          1회고사·2회고사는 100점 만점으로 입력하세요. 배점에 맞춰 자동 환산됩니다. 엔터를 누르거나 다른 곳을 클릭하면 저장되며, 점수를 지우면 미입력으로 저장됩니다.
        </p>
      </div>

      <section className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-emerald-600" aria-label="예측 평균 GPA">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-500">예측 평균 GPA · 이수학점 가중평균</h2>
            <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
              {summary.gpa?.toFixed(2) ?? '—'} <span className="text-base font-normal text-gray-400">/ 4.30</span>
            </p>
          </div>
          <p className="text-sm text-gray-500">{summary.subjectCount}과목 · {summary.credits}학점 반영</p>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          저장된 항목의 반영 점수 합계 ÷ 해당 항목의 반영 만점 합계 × 100으로 예측합니다.
          빈칸·만점 미정 항목·P/F 과목은 제외하고, 등급 과목의 F는 GPA 0으로 포함합니다.
          예측 GPA는 Σ(과목 GPA × 이수학점) ÷ Σ이수학점이며, 최종 성적과 다를 수 있습니다.
        </p>
      </section>

      <details className="bg-white rounded-xl shadow-sm p-5">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">원점수 등급 및 GPA 기준</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead><tr className="text-gray-500 border-b border-gray-200"><th className="py-2">등급</th><th>원점수 기준</th><th>GPA</th></tr></thead>
            <tbody>
              {gradeScale.map((entry) => (
                <tr key={entry.grade} className="border-b border-gray-100">
                  <td className="py-2 font-medium">{entry.grade}</td>
                  <td>{entry.grade === 'F' ? '49.5점 미만' : `${entry.minimum}점 이상`}</td>
                  <td>{entry.gpa.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {data.map((subject) => {
        const knownItems = subject.items.filter((item) => item.points !== null)
        const totalPossible = knownItems.reduce((sum, item) => sum + (weightedMaximum(item) ?? 0), 0)
        const total = knownItems.reduce((sum, item) => sum + (weightedScore(item, item.myScore) ?? 0), 0)
        const recorded = knownItems.filter((item) => item.myScore !== null).length
        const prediction = predictions.get(subject.id)
        return (
        <section key={subject.id} className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {subject.name}{' '}
            <span className="text-sm font-normal text-gray-400">({subject.category})</span>
            <span className="text-sm font-normal text-gray-400"> · {subject.credits}학점</span>
          </h2>
          {subject.gradingType === 'pass_fail' ? (
            <ResultInput
              initialValue={subject.myResult}
              subjectName={subject.name}
              onSave={async (result) => {
                await saveResult({ data: { subjectId: subject.id, result } })
                setData((current) => current.map((entry) => entry.id === subject.id ? { ...entry, myResult: result } : entry))
              }}
            />
          ) : <>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-2">평가 요소</th>
                <th className="py-2 pr-2">원점수 만점</th>
                <th className="py-2 pr-2">반영비율</th>
                <th className="py-2 pr-2">실제 받은 점수</th>
              </tr>
            </thead>
            <tbody>
              {subject.items.map((item) => (
                <ScoreRow
                  key={item.id}
                  item={item}
                  onSave={async (score) => {
                    await save({ data: { assessmentItemId: item.id, score } })
                    setData((current) => current.map((entry) => entry.id === subject.id ? {
                      ...entry,
                      items: entry.items.map((assessment) => assessment.id === item.id ? {
                        ...assessment,
                        myScore: score === null ? null : String(score),
                      } : assessment),
                    } : entry))
                  }}
                />
              ))}
              {subject.items.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-gray-500">평가 항목이 아직 전달되지 않았습니다.</td></tr>
              )}
            </tbody>
          </table>
          </div>
          {knownItems.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-3">
              <p className="font-semibold text-gray-900">
                입력한 점수의 반영 합계: {recorded ? formatPoints(total) : '—'} / {formatPoints(totalPossible)}점
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {recorded} / {knownItems.length}개 항목 입력 · 빈칸은 미입력으로 유지되며 합계에 더하지 않습니다.
                {totalPossible < 100 && ' 반영 합계는 확인된 배점 그대로 유지하며, 부족한 점수를 추가하지 않습니다.'}
              </p>
              <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {prediction ? <>
                  <p className="font-semibold tabular-nums">예측 등급 {prediction.grade} · GPA {prediction.gpa.toFixed(1)} · 예측 원점수 {formatPoints(prediction.score)} / 100점</p>
                  <p className="mt-1 text-xs">입력 항목 기준: {formatPoints(prediction.earned)} / {formatPoints(prediction.possible)}점 × 100 · 저장된 점수로 예측하며 최종 성적이 아닙니다.</p>
                </> : <p>만점이 알려진 항목의 점수를 저장하면 예측 등급과 GPA가 표시됩니다.</p>}
              </div>
            </div>
          )}
          {subject.items.some((item) => item.points === null) && (
            <p className="text-xs text-amber-700 mt-3">만점이 미정인 점수는 저장만 하며, 계산에는 포함하지 않습니다.</p>
          )}
          </>}
        </section>
      )})}
    </div>
  )
}

function ScoreRow({
  item,
  onSave,
}: {
  item: Assessment & { id: number; name: string; myScore: string | null }
  onSave: (score: number | null) => Promise<void>
}) {
  const maxScore = maximumScore(item)
  const [value, setValue] = useState(item.myScore ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const savedScore = useRef(item.myScore === null ? null : Number(item.myScore))

  async function persist() {
    const score = value.trim() === '' ? null : Number(value)
    if (pending.current || score === savedScore.current) return
    pending.current = true
    setError('')
    setSaving(true)
    try {
      if (score !== null && (!Number.isFinite(score) || score < 0 || (maxScore !== null && score > maxScore))) {
        throw new Error(maxScore === null ? '0 이상의 점수를 입력하세요.' : `0~${maxScore}점 사이로 입력하세요.`)
      }
      await onSave(score)
      savedScore.current = score
    } catch (error: any) {
      setError(error.message || '저장 실패')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-2">
        {item.name}
        {item.repeatCount > 1 ? ` (×${item.repeatCount}회 합계)` : ''}
      </td>
      <td className="py-2 pr-2">{maxScore === null ? '' : formatPoints(maxScore)}</td>
      <td className="py-2 pr-2">{maxScore === null ? '' : `${formatPoints(Number(item.weight) * 100)}%`}</td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={maxScore ?? undefined}
            step="0.01"
            aria-label={item.name ? `${item.name} 실제 받은 점수` : '실제 받은 점수'}
            className="border rounded px-2 py-1 w-20"
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => { void persist() }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
          />
          <span className="text-xs text-gray-500" role="status">{saving ? '저장 중' : ''}</span>
          {error && <span className="text-red-500 text-xs">{error}</span>}
        </div>
      </td>
    </tr>
  )
}

function ResultInput({
  initialValue,
  subjectName,
  onSave,
}: {
  initialValue: string | null
  subjectName: string
  onSave: (result: 'P' | 'F' | null) => Promise<void>
}) {
  const [value, setValue] = useState(initialValue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <select
        aria-label={`${subjectName} P/F 결과`}
        className="border rounded px-3 py-2"
        value={value}
        disabled={saving}
        onChange={async (event) => {
          const nextValue = event.target.value
          setValue(nextValue)
          setSaving(true)
          setError('')
          try {
            await onSave(nextValue === 'P' || nextValue === 'F' ? nextValue : null)
          } catch (error: any) {
            setValue(initialValue ?? '')
            setError(error.message || '저장 실패')
          } finally {
            setSaving(false)
          }
        }}
      >
        <option value="">미입력</option>
        <option value="P">P</option>
        <option value="F">F</option>
      </select>
      <span className="text-xs text-gray-500" role="status">{saving ? '저장 중' : ''}</span>
      {error && <span role="alert" className="text-red-500">{error}</span>}
    </div>
  )
}
