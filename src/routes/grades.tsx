import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { getServerUser } from '../lib/auth'
import { getMyGrades, saveMyScore, saveMyResult } from '../server/scores.functions'
import { maximumScore, formatPoints, averageGpa, gradeScale, gradeForScore } from '../lib/grading'
import type { Assessment } from '../lib/grading'
import { analyzeSubject, isExamItem, targetRequirement, gpaFor } from '../lib/predict'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

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

type Grades = Awaited<ReturnType<typeof getMyGrades>>
type SortKey = 'default' | 'risk' | 'high' | 'name'

const pct = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`)
const fmtGpa = (gpa: number | null) => (gpa === null ? '—' : gpa.toFixed(2))

function GradesPage() {
  const { grades } = Route.useLoaderData() as { grades: Grades }
  const [data, setData] = useState(grades)
  const save = useServerFn(saveMyScore)
  const saveResult = useServerFn(saveMyResult)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [whatIf, setWhatIf] = useState(false)
  const [hypo, setHypo] = useState<Record<number, string>>({})
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [sort, setSort] = useState<SortKey>('default')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [hidePF, setHidePF] = useState(false)
  const [category, setCategory] = useState('all')

  function hypoScore(item: { id: number; points: string | null; repeatCount: number; myScore: string | null; weight: string }) {
    if (!whatIf || item.myScore !== null) return null
    const raw = (hypo[item.id] ?? '').trim()
    if (raw === '') return null
    const value = Number(raw)
    const max = maximumScore(item)
    if (!Number.isFinite(value) || value < 0 || (max !== null && value > max)) return null
    return value
  }

  const views = useMemo(() => data.map((subject) => {
    if (subject.gradingType === 'pass_fail') return { subject, analysis: null, usesHypo: false }
    const items = subject.items.map((item) => ({
      ...item,
      score: item.myScore ?? hypoScore(item),
    }))
    const usesHypo = subject.items.some((item) => hypoScore(item) !== null)
    return { subject, analysis: analyzeSubject(items), usesHypo }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, hypo, whatIf])

  const scenario = (pick: (a: NonNullable<(typeof views)[number]['analysis']>) => number | null) =>
    averageGpa(views.map((v) => ({
      credits: v.subject.credits,
      gpa: v.analysis ? gpaFor(pick(v.analysis)) : null,
    })))
  const expected = scenario((a) => a.expectedScore)
  const worst = scenario((a) => a.worstScore)
  const best = scenario((a) => a.bestScore)
  const confirmed = scenario((a) => a.confirmedScore)

  const categories = Array.from(new Set(data.map((s) => s.category)))
  const visible = views
    .filter((v) => category === 'all' || v.subject.category === category)
    .filter((v) => !(hidePF && v.subject.gradingType === 'pass_fail'))
    .filter((v) => {
      if (!onlyEmpty) return true
      if (v.subject.gradingType === 'pass_fail') return v.subject.myResult === null
      return v.subject.items.some((item) => item.points !== null && item.myScore === null)
    })
    .sort((a, b) => {
      if (sort === 'name') return a.subject.name.localeCompare(b.subject.name, 'ko')
      if (sort === 'default') return 0
      const sa = a.analysis?.expectedScore ?? null
      const sb = b.analysis?.expectedScore ?? null
      if (sa === null && sb === null) return 0
      if (sa === null) return 1
      if (sb === null) return -1
      return sort === 'risk' ? sa - sb : sb - sa
    })

  const chartViews = views.filter((v) => v.analysis && v.analysis.filledMax > 0)
  const chartData = {
    labels: chartViews.map((v) => v.subject.name),
    datasets: [
      {
        label: '지필 득점률 (%)',
        data: chartViews.map((v) => (v.analysis!.exam.rate === null ? null : Number((v.analysis!.exam.rate * 100).toFixed(1)))),
        backgroundColor: 'rgba(79, 107, 255, 0.75)',
        borderRadius: 4,
      },
      {
        label: '수행 득점률 (%)',
        data: chartViews.map((v) => (v.analysis!.perf.rate === null ? null : Number((v.analysis!.perf.rate * 100).toFixed(1)))),
        backgroundColor: 'rgba(46, 196, 182, 0.75)',
        borderRadius: 4,
      },
    ],
  }

  function exportCsv() {
    const esc = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const rows: (string | number)[][] = [['과목', '학점', '평가 요소', '구분', '만점', '반영비율(%)', '내 점수']]
    for (const subject of data) {
      if (subject.gradingType === 'pass_fail') {
        rows.push([subject.name, subject.credits, 'P/F 결과', 'P/F', '', '', subject.myResult ?? ''])
        continue
      }
      for (const item of subject.items) {
        const max = maximumScore(item)
        rows.push([
          subject.name, subject.credits, item.name,
          isExamItem(item) ? '지필' : '수행',
          max === null ? '' : formatPoints(max),
          max === null ? '' : formatPoints(Number(item.weight) * 100),
          item.myScore ?? '',
        ])
      }
    }
    const csv = '﻿' + rows.map((row) => row.map(esc).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'my_grades.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

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
            <h2 className="text-sm font-semibold text-gray-500">예상 평균 GPA · 이수학점 가중평균</h2>
            <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">
              {fmtGpa(expected.gpa)} <span className="text-base font-normal text-gray-400">/ 4.30</span>
            </p>
          </div>
          <p className="text-sm text-gray-500">{expected.subjectCount}과목 · {expected.credits}학점 반영</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <ScenarioCell label="최악 (빈칸 0점)" gpa={worst.gpa} />
          <ScenarioCell label="예상 (빈칸 득점률 대입)" gpa={expected.gpa} strong />
          <ScenarioCell label="최선 (빈칸 만점)" gpa={best.gpa} />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          입력한 점수가 하나라도 있는 과목만 포함합니다. 예상은 빈 지필 항목을 입력한 지필 득점률로, 빈 수행 항목을 입력한 수행 득점률로 채워 계산합니다
          (한쪽 입력이 없으면 다른 쪽 득점률을 사용). 입력한 항목만 기준으로 한 평균 GPA는 {fmtGpa(confirmed.gpa)}입니다.
          P/F 과목은 제외하고 등급 과목의 F는 GPA 0으로 포함하며, 최종 성적과 다를 수 있습니다.
        </p>
      </section>

      {mounted && chartViews.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm p-6" aria-label="지필 수행 득점률">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">과목별 지필 · 수행 득점률</h2>
          <p className="text-xs text-gray-500 mb-4">입력한 항목 기준 득점률입니다. 입력이 없는 쪽은 표시되지 않습니다.</p>
          <Bar
            data={chartData}
            options={{
              responsive: true,
              plugins: { legend: { position: 'bottom' } },
              scales: { y: { beginAtZero: true, max: 100 } },
            }}
          />
        </section>
      )}

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

      <section className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm" aria-label="보기 설정">
        <label className="flex items-center gap-2">
          정렬
          <select className="border rounded px-2 py-1" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="default">기본</option>
            <option value="risk">예상 점수 낮은 순 (위험 과목)</option>
            <option value="high">예상 점수 높은 순</option>
            <option value="name">이름 순</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          분류
          <select className="border rounded px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">전체</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />빈칸 있는 과목만</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={hidePF} onChange={(e) => setHidePF(e.target.checked)} />P/F 숨기기</label>
        <label className="flex items-center gap-1 font-medium text-indigo-700">
          <input type="checkbox" checked={whatIf} onChange={(e) => setWhatIf(e.target.checked)} />가정 입력 (저장 안 됨)
        </label>
        <button type="button" onClick={exportCsv} className="ml-auto border rounded px-3 py-1 hover:bg-gray-50">CSV 내보내기</button>
      </section>
      {whatIf && (
        <p className="-mt-4 text-xs text-indigo-700">
          가정 입력 모드: 빈칸 옆의 &quot;가정&quot; 칸에 점수를 넣으면 예상 등급과 GPA에 반영됩니다. 가정 점수는 저장되지 않고 새로고침하면 사라집니다.
        </p>
      )}

      {visible.map(({ subject, analysis, usesHypo }) => {
        const targetCut = targets[subject.id] ?? ''
        const requirement = analysis && targetCut !== '' ? targetRequirement(analysis, Number(targetCut)) : null
        const knownItems = subject.items.filter((item) => item.points !== null)
        const recorded = knownItems.filter((item) => item.myScore !== null).length
        const expectedGrade = analysis ? gradeForScore(analysis.expectedScore) : null
        const confirmedGrade = analysis ? gradeForScore(analysis.confirmedScore) : null
        const worstGrade = analysis ? gradeForScore(analysis.worstScore) : null
        const bestGrade = analysis ? gradeForScore(analysis.bestScore) : null
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
                <th className="py-2 pr-2">구분</th>
                <th className="py-2 pr-2">원점수 만점</th>
                <th className="py-2 pr-2">반영비율</th>
                <th className="py-2 pr-2">실제 받은 점수</th>
                <th className="py-2 pr-2">반영 점수</th>
              </tr>
            </thead>
            <tbody>
              {subject.items.map((item) => (
                <ScoreRow
                  key={item.id}
                  item={item}
                  whatIf={whatIf}
                  hypoValue={hypo[item.id] ?? ''}
                  onHypo={(value) => setHypo((current) => ({ ...current, [item.id]: value }))}
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
                <tr><td colSpan={6} className="py-4 text-gray-500">평가 항목이 아직 전달되지 않았습니다.</td></tr>
              )}
            </tbody>
          </table>
          </div>
          {analysis && knownItems.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-3 space-y-3">
              <p className="text-xs text-gray-500">
                {recorded} / {knownItems.length}개 항목 입력 · 확인된 배점 합계 {formatPoints(analysis.totalMax)}점
                {analysis.totalMax < 100 && ' (일부 배점이 아직 미정이라 100점 미만일 수 있습니다)'}
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <RateCell label="지필 득점률" rate={analysis.exam.rate} detail={`${formatPoints(analysis.exam.filledMax)} / ${formatPoints(analysis.exam.max)}점 입력`} color="bg-indigo-500" />
                <RateCell label="수행 득점률" rate={analysis.perf.rate} detail={`${formatPoints(analysis.perf.filledMax)} / ${formatPoints(analysis.perf.max)}점 입력`} color="bg-teal-500" />
              </div>
              <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-1">
                {analysis.expectedScore !== null && expectedGrade ? <>
                  <p className="font-semibold tabular-nums">
                    예상 등급 {expectedGrade.grade} · GPA {expectedGrade.gpa.toFixed(1)} · 예상 원점수 {formatPoints(analysis.expectedScore)} / 100점
                    {usesHypo && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-normal text-indigo-700">가정 포함</span>}
                  </p>
                  <p className="text-xs">
                    입력한 항목만 기준: {formatPoints(analysis.confirmedScore ?? 0)}점 ({confirmedGrade?.grade ?? '—'}) ·
                    가능 범위 {formatPoints(analysis.worstScore ?? 0)}점({worstGrade?.grade ?? '—'}) ~ {formatPoints(analysis.bestScore ?? 0)}점({bestGrade?.grade ?? '—'}) · 최종 성적이 아닙니다.
                  </p>
                </> : <p>만점이 알려진 항목의 점수를 저장하면 예상 등급과 GPA가 표시됩니다.</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  목표 등급
                  <select
                    className="border rounded px-2 py-1"
                    value={targetCut}
                    onChange={(e) => setTargets((current) => ({ ...current, [subject.id]: e.target.value }))}
                  >
                    <option value="">선택 안 함</option>
                    {gradeScale.filter((entry) => entry.grade !== 'F').map((entry) => (
                      <option key={entry.grade} value={entry.minimum}>{entry.grade} ({entry.minimum}점 이상)</option>
                    ))}
                  </select>
                </label>
                {requirement && <TargetMessage result={requirement} />}
              </div>
            </div>
          )}
          {subject.items.some((item) => item.points === null) && (
            <p className="text-xs text-amber-700 mt-3">만점이 미정인 점수는 저장만 하며, 계산에는 포함하지 않습니다.</p>
          )}
          </>}
        </section>
      )})}
      {visible.length === 0 && <p className="text-sm text-gray-500">조건에 맞는 과목이 없습니다.</p>}
    </div>
  )
}

function ScenarioCell({ label, gpa, strong }: { label: string; gpa: number | null; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-3 ${strong ? 'bg-emerald-50 text-emerald-900' : 'bg-gray-50 text-gray-700'}`}>
      <p className="text-xs">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? 'text-xl font-bold' : 'text-lg font-semibold'}`}>{fmtGpa(gpa)}</p>
    </div>
  )
}

function RateCell({ label, rate, detail, color }: { label: string; rate: number | null; detail: string; color: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="font-semibold tabular-nums">{pct(rate)}</span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-gray-200 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, (rate ?? 0) * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-400">{detail}</p>
    </div>
  )
}

function TargetMessage({ result }: { result: ReturnType<typeof targetRequirement> }) {
  if (result.status === 'achieved') {
    return <span className="text-emerald-700">이미 확정: 남은 항목을 0점 받아도 목표 등급입니다.</span>
  }
  if (result.status === 'impossible') {
    return <span className="text-red-600">남은 항목을 만점 받아도 목표 등급에 도달할 수 없습니다.</span>
  }
  return (
    <span className="text-gray-800">
      남은 항목(반영 {formatPoints(result.remainingMax)}점)에서 평균 <b className="tabular-nums">{pct(result.rate)}</b> 득점 필요
      <span className="text-gray-500"> (약 {formatPoints(result.neededPoints)}점)</span>
    </span>
  )
}

function ScoreRow({
  item,
  whatIf,
  hypoValue,
  onHypo,
  onSave,
}: {
  item: Assessment & { id: number; name: string; kind: string; myScore: string | null }
  whatIf: boolean
  hypoValue: string
  onHypo: (value: string) => void
  onSave: (score: number | null) => Promise<void>
}) {
  const maxScore = maximumScore(item)
  const [value, setValue] = useState(item.myScore ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const savedScore = useRef(item.myScore === null ? null : Number(item.myScore))
  const typed = value.trim() === '' ? null : Number(value)
  const converted = typed !== null && Number.isFinite(typed) ? typed * Number(item.weight) : null

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
      <td className="py-2 pr-2 text-xs text-gray-500">{isExamItem(item) ? '지필' : '수행'}</td>
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
          {whatIf && item.myScore === null && value.trim() === '' && maxScore !== null && (
            <input
              type="number"
              min={0}
              max={maxScore}
              step="0.01"
              placeholder="가정"
              aria-label={`${item.name} 가정 점수 (저장 안 됨)`}
              className="border border-dashed border-indigo-400 rounded px-2 py-1 w-20 bg-indigo-50"
              value={hypoValue}
              onChange={(e) => onHypo(e.target.value)}
            />
          )}
          <span className="text-xs text-gray-500" role="status">{saving ? '저장 중' : ''}</span>
          {error && <span className="text-red-500 text-xs">{error}</span>}
        </div>
      </td>
      <td className="py-2 pr-2 tabular-nums text-gray-700">
        {maxScore === null ? '' : `${converted === null ? '—' : formatPoints(converted)} / ${formatPoints(maxScore * Number(item.weight))}`}
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
