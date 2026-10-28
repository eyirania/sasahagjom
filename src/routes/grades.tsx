import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { getServerUser } from '../lib/auth'
import { getMyGrades, getMyPredictions, saveMyScore, saveMyResult } from '../server/scores.functions'
import { maximumScore, formatPoints, averageGpa, gradeScale, gradeForScore } from '../lib/grading'
import type { Assessment } from '../lib/grading'
import { analyzeSubject, emptyItemModels, finalRequirement, isExamItem, targetRequirement, gpaFor } from '../lib/predict'
import type { FinalResult } from '../lib/predict'
import { simulateGpa } from '../lib/montecarlo'

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
type SortKey = 'default' | 'name' | 'score-desc' | 'score-asc' | 'gpa-desc' | 'risk'

const pct = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`)
const fmtGpa = (gpa: number | null) => (gpa === null ? '—' : gpa.toFixed(2))

/** 현재 등급 기준으로 위/아래 등급 경계까지의 거리 */
function boundary(score: number) {
  const index = gradeScale.findIndex((entry) => score >= entry.minimum)
  const current = gradeScale[index]
  const up = index > 0 ? gradeScale[index - 1] : null
  return {
    current: current.grade,
    toDown: score - current.minimum,
    up: up?.grade ?? null,
    toUp: up ? up.minimum - score : null,
  }
}

function badgeClass(grade: string | null) {
  if (!grade) return 'bg-white text-gray-400'
  if (grade.startsWith('A')) return 'bg-black text-white'
  if (grade.startsWith('B')) return 'bg-white text-black'
  return 'bg-[#fff0ea] text-[#c23000]'
}

function GradesPage() {
  const { grades } = Route.useLoaderData() as { grades: Grades }
  const [data, setData] = useState(grades)
  const save = useServerFn(saveMyScore)
  const saveResult = useServerFn(saveMyResult)
  const fetchPredictions = useServerFn(getMyPredictions)

  const [whatIf, setWhatIf] = useState(false)
  const [hypo, setHypo] = useState<Record<number, string>>({})
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [goalManual, setGoalManual] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('default')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [hidePF, setHidePF] = useState(false)
  const [category, setCategory] = useState('all')

  /** 점수를 저장할 때마다 빈 항목의 예상치를 서버에서 다시 받는다 */
  async function refreshPredictions() {
    try {
      const preds = (await fetchPredictions()) as Record<string, { rate: number; sd: number }>
      setData((current) => current.map((entry) => ({
        ...entry,
        items: entry.items.map((item) => ({ ...item, predRate: preds[item.id]?.rate ?? null, predSd: preds[item.id]?.sd ?? null })),
      })))
    } catch {
      /* 예측 갱신 실패는 조용히 무시 (기존 값 유지) */
    }
  }

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
    const items = subject.items.map((item) => ({ ...item, score: item.myScore ?? hypoScore(item) }))
    if (subject.gradingType === 'pass_fail') {
      return { subject, items, analysis: null, usesHypo: false, remaining: 0, grade: null as ReturnType<typeof gradeForScore> }
    }
    const analysis = analyzeSubject(items)
    return {
      subject,
      items,
      analysis,
      usesHypo: subject.items.some((item) => hypoScore(item) !== null),
      remaining: Math.max(0, analysis.totalMax - analysis.filledMax),
      grade: gradeForScore(analysis.expectedScore),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, hypo, whatIf])

  type View = (typeof views)[number]
  const scenario = (pick: (a: NonNullable<View['analysis']>) => number | null) =>
    averageGpa(views.map((v) => ({
      credits: v.subject.credits,
      gpa: v.analysis ? gpaFor(pick(v.analysis)) : null,
    })))
  const expected = scenario((a) => a.expectedScore)
  const worst = scenario((a) => a.worstScore)
  const best = scenario((a) => a.bestScore)
  const confirmed = scenario((a) => a.confirmedScore)

  // ---- 요약 통계
  const graded = views.filter((v) => v.analysis)
  const withData = graded.filter((v) => v.analysis!.filledMax > 0)
  const complete = graded.filter((v) => v.analysis!.filledMax > 0 && v.remaining <= 1e-9)
  const pending = graded.filter((v) => v.remaining > 1e-9 || v.analysis!.filledMax <= 0)
  const topView = [...withData].sort((a, b) => b.analysis!.expectedScore! - a.analysis!.expectedScore!)[0]
  const riskViews = withData
    .map((v) => ({ v, b: boundary(v.analysis!.expectedScore!) }))
    .filter(({ b }) => (b.toUp !== null && b.toUp > 0 && b.toUp <= 2) || (b.toDown >= 0 && b.toDown <= 2))
    .sort((a, b) => Math.min(a.b.toUp ?? 99, a.b.toDown) - Math.min(b.b.toUp ?? 99, b.b.toDown))
  const pfCount = views.filter((v) => v.subject.gradingType === 'pass_fail').length

  // ---- 과목군별 평균 (예상 원점수, 100점 기준)
  const groupAverages = Array.from(
    withData.reduce((map, v) => {
      const list = map.get(v.subject.category) ?? []
      list.push(v.analysis!.expectedScore!)
      return map.set(v.subject.category, list)
    }, new Map<string, number[]>()),
  ).map(([name, scores]) => ({ name, avg: scores.reduce((a, b) => a + b, 0) / scores.length, count: scores.length }))

  // ---- 목표 평점: 과목 카드에서 고른 목표 등급들로부터 계산 (고른 게 없으면 직접 입력)
  const cutOf = (id: number) => targets[id] ?? ''
  const targetGpaOf = (id: number) => {
    const cut = cutOf(id)
    return cut === '' ? null : gradeScale.find((entry) => entry.minimum === Number(cut))?.gpa ?? null
  }
  const targetCount = views.filter((v) => v.analysis && targetGpaOf(v.subject.id) !== null).length
  const derivedGoal = averageGpa(views.map((v) => ({
    credits: v.subject.credits,
    gpa: !v.analysis ? null : targetGpaOf(v.subject.id) ?? gpaFor(v.analysis.expectedScore),
  })))
  const autoGoal = targetCount > 0 && goalManual === null
  const goalValue = autoGoal ? derivedGoal.gpa ?? NaN : Number(goalManual ?? '4.0')
  function goalStatus() {
    if (!Number.isFinite(goalValue) || goalValue <= 0) return { kind: 'info' as const, text: '유효한 목표 평점을 입력해 주세요.' }
    if (expected.gpa !== null && expected.gpa >= goalValue - 1e-9) {
      return { kind: 'ok' as const, text: `현재 예상으로도 ${goalValue.toFixed(2)} 달성 가능 (현재 ${expected.gpa.toFixed(2)})` }
    }
    let confW = 0, confG = 0, remainW = 0, bestG = 0
    for (const v of graded) {
      const w = v.subject.credits
      if (w <= 0) continue
      const a = v.analysis!
      if (a.filledMax > 0 && v.remaining <= 1e-9) {
        confW += w
        confG += (gpaFor(a.expectedScore) ?? 0) * w
        bestG += (gpaFor(a.expectedScore) ?? 0) * w
      } else {
        remainW += w
        bestG += (a.filledMax > 0 ? gpaFor(a.bestScore) ?? 4.3 : 4.3) * w
      }
    }
    const totalW = confW + remainW
    if (totalW > 0 && bestG / totalW < goalValue) {
      return { kind: 'bad' as const, text: `남은 항목을 모두 만점 받아도 ${goalValue.toFixed(2)} 달성 불가 (최선 ${(bestG / totalW).toFixed(2)})` }
    }
    if (remainW <= 0 || expected.gpa === null) return { kind: 'info' as const, text: '점수를 입력하면 목표까지 필요한 평점을 알려줘요.' }
    const need = (goalValue * totalW - confG) / remainW
    const gap = goalValue - expected.gpa
    return {
      kind: 'info' as const,
      text: `목표까지 ${gap.toFixed(2)} 부족. 남은 과목 평균 ${Math.min(Math.max(need, 0), 4.3).toFixed(2)} 필요${need > 4.3 ? ' · 4.3 초과로 어려움' : ''}`,
    }
  }
  const goalResult = goalStatus()

  // ---- 5단계 시나리오 (과목별 빈 항목 점수를 정규분포로 2,000번 뽑아 만든 평점 분포)
  const mc = useMemo(() => simulateGpa(
    views
      .filter((v) => v.analysis && v.analysis.filledMax > 0 && v.analysis.totalMax > 0)
      .map((v) => ({
        credits: v.subject.credits,
        earned: v.analysis!.earned,
        totalMax: v.analysis!.totalMax - v.analysis!.unfilledMax,
        empties: emptyItemModels(v.items, v.analysis!),
      })),
    Number.isFinite(goalValue) && goalValue > 0 ? goalValue : null,
  ), [views, goalValue])
  const lowerGpa = mc && expected.gpa !== null && worst.gpa !== null ? Math.max(worst.gpa, Math.min(mc.lower, expected.gpa)) : null
  const upperGpa = mc && expected.gpa !== null && best.gpa !== null ? Math.min(best.gpa, Math.max(mc.upper, expected.gpa)) : null

  // ---- 필터 / 정렬
  const categories = Array.from(new Set(data.map((s) => s.category)))
  const riskKey = (v: View) => {
    const score = v.analysis?.expectedScore
    if (score === null || score === undefined) return 99
    const b = boundary(score)
    return Math.min(b.toUp ?? 99, b.toDown)
  }
  const visible = views
    .filter((v) => category === 'all' || v.subject.category === category)
    .filter((v) => !(hidePF && v.subject.gradingType === 'pass_fail'))
    .filter((v) => {
      if (!onlyEmpty) return true
      if (v.subject.gradingType === 'pass_fail') return v.subject.myResult === null
      return v.subject.items.some((item) => item.points !== null && item.myScore === null)
    })
    .sort((a, b) => {
      if (sort === 'default') return 0
      if (sort === 'name') return a.subject.name.localeCompare(b.subject.name, 'ko')
      if (sort === 'risk') return riskKey(a) - riskKey(b)
      const sa = a.analysis?.expectedScore ?? null
      const sb = b.analysis?.expectedScore ?? null
      if (sa === null && sb === null) return 0
      if (sa === null) return 1
      if (sb === null) return -1
      if (sort === 'gpa-desc') return (gpaFor(sb) ?? -1) - (gpaFor(sa) ?? -1) || sb - sa
      return sort === 'score-asc' ? sa - sb : sb - sa
    })

  const allExpanded = visible.length > 0 && visible.every((v) => expanded[v.subject.id])

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
    <div className="max-w-[1280px] mx-auto px-5 lg:px-10 pt-12 pb-24 space-y-14">
      <div>
        <h1 className="sw-display text-[clamp(44px,7vw,96px)] pb-3">내 성적 입력</h1>
        <p className="text-[17px] max-w-3xl mt-2">
          지필(1·2회고사)은 100점 만점으로 입력하세요. 반영비율(0.3, 0.25 등)을 곱해 자동 환산됩니다. 엔터를 누르거나 다른 곳을 클릭하면 저장되며, 점수를 지우면 미입력으로 저장됩니다.
        </p>
      </div>

      {/* ============ HERO ============ */}
      <section className="grid gap-x-8 gap-y-8 lg:grid-cols-12" aria-label="예측 평균 GPA">
        <div className="lg:col-span-9">
          <h2 className="sw-label"><span className="sw-flag mr-2">예상</span>전체 평점 · 이수학점 가중평균</h2>
          <p className="mt-4 sw-display tabular-nums text-[clamp(64px,13vw,148px)] hero-gpa">
            {fmtGpa(expected.gpa)} <span className="text-[clamp(16px,2vw,28px)] font-medium tracking-normal text-gray-400">/ 4.30</span>
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-3 text-sm">
            <Meta label="입력 항목 기준 평점" value={fmtGpa(confirmed.gpa)} />
            <Meta label="총 이수 학점" value={String(expected.credits)} />
            <Meta label="반영 과목" value={`${expected.subjectCount}과목`} />
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            입력한 점수가 하나라도 있는 과목만 포함하고, 비어 있는 항목은 입력한 점수를 바탕으로 추정합니다.
            P/F 과목은 제외합니다. 최종 성적과 다를 수 있습니다.
          </p>
        </div>

        <div className="lg:col-span-3 card p-7 space-y-6 self-start">
          <div>
            <h3 className="sw-label">시나리오 분석</h3>
            <ScenarioRow label="최악 (빈칸 0점)" value={fmtGpa(worst.gpa)} tone="text-red-600" />
            <ScenarioRow label="하위 50%" value={fmtGpa(lowerGpa)} tone="text-gray-700" />
            <ScenarioRow label="평균" value={fmtGpa(expected.gpa)} tone="text-emerald-700" strong />
            <ScenarioRow label="상위 50%" value={fmtGpa(upperGpa)} tone="text-gray-700" />
            <ScenarioRow label="최선 (빈칸 만점)" value={fmtGpa(best.gpa)} tone="text-indigo-600" />
            {worst.gpa !== null && best.gpa !== null && expected.gpa !== null && (
              <RangeBar
                points={[worst.gpa, lowerGpa, expected.gpa, upperGpa, best.gpa]}
                goal={Number.isFinite(goalValue) && goalValue > 0 ? goalValue : null}
              />
            )}
            <p className="mt-2 text-xs text-gray-500">하위·상위 50%는 남은 점수가 흔들릴 때 낮은 쪽·높은 쪽 절반의 평균 평점이에요.</p>
          </div>
          <div className="border-t border-black/10 pt-5">
            <h3 className="sw-label">목표 평점</h3>
            {autoGoal ? (
              <div className="mt-2">
                <p className="text-4xl font-light tabular-nums" aria-label="목표 평점">
                  {fmtGpa(derivedGoal.gpa)} <span className="text-sm text-gray-400">/ 4.3</span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  목표 등급을 고른 {targetCount}과목 + 나머지는 예상 기준 ·{' '}
                  <button type="button" className="plain underline" onClick={() => setGoalManual(derivedGoal.gpa === null ? '4.0' : derivedGoal.gpa.toFixed(2))}>직접 입력</button>
                </p>
              </div>
            ) : (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={4.3} step={0.01}
                    aria-label="목표 평점"
                    className="px-2 py-1 w-24 font-medium"
                    value={goalManual ?? '4.0'}
                    onChange={(e) => setGoalManual(e.target.value)}
                  />
                  <span className="text-sm text-gray-400">/ 4.3</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {targetCount > 0
                    ? <button type="button" className="plain underline" onClick={() => setGoalManual(null)}>목표 등급({targetCount}과목)으로 계산</button>
                    : '과목을 펼쳐 목표 등급을 고르면 자동으로 계산돼요.'}
                </p>
              </div>
            )}
            <p className={`mt-2 text-xs ${goalResult.kind === 'ok' ? 'text-emerald-700' : goalResult.kind === 'bad' ? 'text-red-600' : 'text-gray-600'}`}>
              {goalResult.text}
            </p>
            {mc && mc.probability !== null && (
              <p className="mt-1 text-sm font-medium">달성 확률 약 {Math.round(mc.probability * 100)}%</p>
            )}
          </div>
        </div>
      </section>

      {/* ============ 요약 통계 ============ */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="요약 통계">
        <Stat plane="plane-yellow" label="입력 완료 과목" value={String(complete.length)} sub={`/ ${graded.length} 과목`} />
        <Stat plane="bg-white" label="빈칸 남은 과목" value={String(pending.length)} sub="아직 채울 항목 있음" />
        <Stat
          plane="plane-blue"
          label="최고 예상 과목"
          value={topView ? topView.subject.name : '—'}
          sub={topView ? `${formatPoints(topView.analysis!.expectedScore!)}점 · ${topView.grade?.grade ?? ''}` : '—'}
          small
        />
        <Stat
          plane="plane-red"
          label="위험 과목"
          value={riskViews[0] ? riskViews[0].v.subject.name : '—'}
          sub={riskViews[0]
            ? (riskViews[0].b.toUp !== null && riskViews[0].b.toUp > 0 && riskViews[0].b.toUp <= 2
              ? `${riskViews[0].b.up}까지 ${riskViews[0].b.toUp.toFixed(1)}점 부족`
              : `${riskViews[0].b.current} 경계 (${riskViews[0].b.toDown.toFixed(1)}점 여유)`)
            : withData.length ? '안정권' : '—'}
          small
        />
        <Stat plane="bg-white" label="P/F 과목" value={String(pfCount)} sub="평점 계산 제외" />
      </section>

      {/* ============ 과목군별 평균 ============ */}
      {groupAverages.length > 0 && (
        <section aria-label="과목군별 평균">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-2xl font-normal tracking-tight">과목군별 평균</h2>
            <span className="text-xs text-gray-400">예상 원점수 · 100점 기준</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {groupAverages.map((group) => (
              <div key={group.name} className="p-5 card">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-gray-700">{group.name}</span>
                  <span className="font-semibold tabular-nums">{group.avg.toFixed(1)}</span>
                </div>
                <div className="mt-2 h-2 bg-gray-100 overflow-hidden">
                  <div className="h-full bg-black" style={{ width: `${Math.min(100, Math.max(0, group.avg))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <details className="card px-6 py-4">
        <summary className="cursor-pointer sw-label">원점수 등급 및 GPA 기준</summary>
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

      {/* ============ 컨트롤 ============ */}
      <section className="card px-6 py-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm" aria-label="보기 설정">
        <label className="flex items-center gap-2">
          정렬
          <select className="px-2 py-1" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="default">기본순</option>
            <option value="name">과목명순</option>
            <option value="score-desc">예상 점수 ↓</option>
            <option value="score-asc">예상 점수 ↑</option>
            <option value="gpa-desc">평점 높은 순</option>
            <option value="risk">위험 과목 우선</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          과목군
          <select className="px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">전체</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />빈칸 있는 과목만</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={hidePF} onChange={(e) => setHidePF(e.target.checked)} />P/F 숨기기</label>
        <label className="flex items-center gap-1 text-[#c23000]">
          <input type="checkbox" checked={whatIf} onChange={(e) => setWhatIf(e.target.checked)} />가정 입력 (저장 안 됨)
        </label>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn-ghost !py-1.5 text-sm"
            onClick={() => setExpanded(Object.fromEntries(visible.map((v) => [v.subject.id, !allExpanded])))}
          >
            {allExpanded ? '전체 접기' : '전체 펼치기'}
          </button>
          <button type="button" onClick={exportCsv} className="btn-ghost !py-1.5 text-sm">CSV 내보내기</button>
        </span>
      </section>
      {whatIf && (
        <p className="-mt-4 text-xs text-indigo-700">
          가정 입력 모드: 과목을 펼쳐 빈칸 옆의 &quot;가정&quot; 칸에 점수를 넣으면 예상 등급과 GPA에 반영됩니다. 가정 점수는 저장되지 않고 새로고침하면 사라집니다.
        </p>
      )}

      {/* ============ 과목 카드 ============ */}
      <section className="grid gap-4" aria-label="과목">
      {visible.map(({ subject, items: viewItems, analysis, usesHypo, remaining, grade }) => {
        const isOpen = !!expanded[subject.id]
        const isPF = subject.gradingType === 'pass_fail'
        const targetCut = targets[subject.id] ?? ''
        const requirement = analysis && targetCut !== '' ? targetRequirement(analysis, Number(targetCut)) : null
        const finalReq = analysis && targetCut !== '' ? finalRequirement(viewItems, analysis, Number(targetCut)) : null
        const knownItems = subject.items.filter((item) => item.points !== null)
        const recorded = knownItems.filter((item) => item.myScore !== null).length
        const confirmedGrade = analysis ? gradeForScore(analysis.confirmedScore) : null
        const worstGrade = analysis ? gradeForScore(analysis.worstScore) : null
        const bestGrade = analysis ? gradeForScore(analysis.bestScore) : null
        const progress = analysis && analysis.totalMax > 0 ? (analysis.filledMax / analysis.totalMax) * 100 : 0

        const flags: { text: string; tone: string }[] = []
        if (isPF) flags.push({ text: 'P/F', tone: 'bg-gray-100 text-gray-600' })
        if (analysis && (remaining > 1e-9 || analysis.filledMax <= 0)) {
          flags.push({ text: `빈칸 ${formatPoints(remaining)}점`, tone: 'bg-amber-50 text-amber-700' })
        }
        if (analysis && analysis.expectedScore !== null) {
          const b = boundary(analysis.expectedScore)
          if (b.toUp !== null && b.toUp > 0 && b.toUp <= 2) flags.push({ text: `${b.up}까지 ${b.toUp.toFixed(1)}점`, tone: 'bg-orange-50 text-orange-700' })
          else if (b.toDown >= 0 && b.toDown <= 2) flags.push({ text: `${b.current} 경계`, tone: 'bg-orange-50 text-orange-700' })
          else flags.push({ text: `${b.current} 안정`, tone: 'bg-emerald-50 text-emerald-700' })
        }
        if (requirement) {
          const label = gradeScale.find((entry) => entry.minimum === Number(targetCut))?.grade ?? '목표'
          if (requirement.status === 'achieved') flags.push({ text: `🎯 ${label} 달성`, tone: 'bg-indigo-50 text-indigo-700' })
          else if (requirement.status === 'impossible') flags.push({ text: `🎯 ${label} 불가`, tone: 'bg-red-50 text-red-700' })
          else flags.push({ text: `🎯 ${label} ${(requirement.rate * 100).toFixed(0)}% 필요`, tone: 'bg-indigo-50 text-indigo-700' })
        }
        if (usesHypo) flags.push({ text: '가정 포함', tone: 'bg-indigo-100 text-indigo-700' })

        const scoreText = isPF
          ? (subject.myResult === 'P' ? 'Pass' : subject.myResult === 'F' ? 'Fail' : '—')
          : analysis?.expectedScore != null ? formatPoints(analysis.expectedScore) : '—'
        const badgeText = isPF ? (subject.myResult ?? '—') : grade?.grade ?? '—'

        return (
        <article key={subject.id} className="card overflow-hidden">
          <button
            type="button"
            aria-expanded={isOpen}
            className="plain w-full text-left p-6 hover:bg-black/[0.03]"
            onClick={() => setExpanded((current) => ({ ...current, [subject.id]: !current[subject.id] }))}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-medium tracking-tight truncate">
                  {subject.name}{' '}
                  <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">{subject.category}</span>
                </h2>
              </div>
              <span className={`circle w-11 h-11 shrink-0 flex items-center justify-center border border-black/10 text-base font-medium ${badgeClass(isPF ? (subject.myResult === 'P' ? 'A' : subject.myResult === 'F' ? 'F' : null) : grade?.grade ?? null)}`}>{badgeText}</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden>
                <path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
              <Num label="예상 점수" value={scoreText} />
              <Num label="예상 평점" value={isPF ? '—' : grade ? grade.gpa.toFixed(2) : '—'} em />
              <Num label="학점" value={String(subject.credits)} />
              <Num label="남은 배점" value={isPF ? '—' : formatPoints(remaining)} />
            </div>
            {!isPF && (
              <div className="mt-3 h-1.5 rounded bg-gray-100 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
              </div>
            )}
            {flags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {flags.map((flag) => <span key={flag.text} className={`rounded-3xl px-2.5 py-0.5 text-[13px] font-medium ${flag.tone}`}>{flag.text}</span>)}
              </div>
            )}
          </button>

          {isOpen && (
            <div className="border-t border-black/10 p-6">
              {isPF ? (
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
                        await refreshPredictions()
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
                  <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-1">
                    {analysis.expectedScore !== null && grade ? <>
                      <p className="font-semibold tabular-nums">
                        예상 등급 {grade.grade} · GPA {grade.gpa.toFixed(1)} · 예상 원점수 {formatPoints(analysis.expectedScore)} / 100점
                      </p>
                      <p className="text-xs">
                        입력한 항목만 기준: {formatPoints(analysis.confirmedScore ?? 0)}점 ({confirmedGrade?.grade ?? '—'}) ·
                        가능 범위 {formatPoints(analysis.worstScore ?? 0)}점({worstGrade?.grade ?? '—'}) ~ {formatPoints(analysis.bestScore ?? 0)}점({bestGrade?.grade ?? '—'}) ·
                        최종 성적이 아닙니다.
                      </p>
                    </> : <p>만점이 알려진 항목의 점수를 저장하면 예상 등급과 GPA가 표시됩니다.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      목표 등급
                      <select
                        className="px-2 py-1"
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
                  <div className="text-sm">
                    {finalReq && <FinalMessage result={finalReq} />}
                  </div>
                </div>
              )}
              {subject.items.some((item) => item.points === null) && (
                <p className="text-xs text-amber-700 mt-3">만점이 미정인 점수는 저장만 하며, 계산에는 포함하지 않습니다.</p>
              )}
              </>}
            </div>
          )}
        </article>
      )})}
      {visible.length === 0 && <p className="text-sm text-gray-500">조건에 맞는 과목이 없습니다.</p>}
      </section>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-5 py-4">
      <dt className="sw-label text-gray-500">{label}</dt>
      <dd className="mt-1 text-3xl font-normal tracking-tight tabular-nums">{value}</dd>
    </div>
  )
}

function ScenarioRow({ label, value, tone, strong }: { label: string; value: string; tone: string; strong?: boolean }) {
  return (
    <div className="mt-2 flex items-baseline justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`tabular-nums ${tone} ${strong ? 'text-lg font-medium' : 'font-semibold'}`}>{value}</span>
    </div>
  )
}

function Stat({ label, value, sub, small, plane }: { label: string; value: string; sub: string; small?: boolean; plane: string }) {
  return (
    <div className={`p-5 rounded-[18px] shadow-sm ${plane}`}>
      <p className="sw-label">{label}</p>
      <p className={`mt-1 font-medium tracking-tight truncate ${small ? 'text-lg' : 'text-4xl font-light tabular-nums'}`}>{value}</p>
      <p className="mt-0.5 text-sm font-medium truncate">{sub}</p>
    </div>
  )
}

function Num({ label, value, em }: { label: string; value: string; em?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`font-semibold tabular-nums ${em ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
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
      남은 항목(반영 {formatPoints(result.remainingMax)}점)에서 고르게 <b className="tabular-nums">{pct(result.rate)}</b> 득점 필요
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

function FinalMessage({ result }: { result: FinalResult }) {
  if (result.status === 'achieved') {
    return <span className="text-emerald-700">현재 추세라면 {result.name}에서 0점을 받아도 목표 등급이에요.</span>
  }
  if (result.status === 'impossible') {
    return <span className="text-red-600">현재 추세로는 {result.name}을(를) 만점 받아도 목표 등급이 어려워요.</span>
  }
  return (
    <span className="text-gray-800">
      현재 추세라면 {result.name}에서 <b className="tabular-nums">{Math.ceil(result.rawScore)}점</b> 이상 필요해요
      <span className="text-gray-500"> ({formatPoints(result.outOf)}점 만점)</span>
    </span>
  )
}

/** 최악~최선 범위를 한 줄로 보여 주고, 다섯 지점과 목표를 표시 */
function RangeBar({ points, goal }: { points: (number | null)[]; goal: number | null }) {
  const pos = (g: number) => `${Math.min(100, Math.max(0, (g / 4.3) * 100))}%`
  const valid = points.filter((g): g is number => g !== null)
  return (
    <div className="relative mt-4 h-2 rounded-full bg-black/10" role="img" aria-label="시나리오 평점 범위">
      <div className="absolute h-2 rounded-full bg-[#0096f7]/30" style={{ left: pos(Math.min(...valid)), width: `calc(${pos(Math.max(...valid))} - ${pos(Math.min(...valid))})` }} />
      {valid.map((g, i) => (
        <span key={i} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" style={{ left: pos(g) }} />
      ))}
      {goal !== null && (
        <span className="absolute -top-1 h-4 w-0.5 bg-[#ff4000]" style={{ left: pos(goal) }} title="목표" />
      )}
    </div>
  )
}
