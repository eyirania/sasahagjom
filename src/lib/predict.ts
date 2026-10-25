import { gradeForScore, weightedMaximum, weightedScore } from './grading'

export type PredictItem = {
  name: string
  kind: string
  points: string | null
  weight: string
  repeatCount: number
  score: string | number | null
}

export type GroupStat = {
  max: number // 만점이 알려진 반영 만점 합
  filledMax: number // 점수가 입력된 항목의 반영 만점 합
  earned: number // 입력된 항목의 반영 점수 합
  rate: number | null // 득점률 (0~1), 입력이 없으면 null
}

export type SubjectAnalysis = {
  totalMax: number
  filledMax: number
  earned: number
  exam: GroupStat
  perf: GroupStat
  /** 입력한 항목만 기준 (earned / filledMax × 100) */
  confirmedScore: number | null
  /** 빈 지필은 지필 득점률, 빈 수행은 수행 득점률로 채운 예상 최종 (100점 기준) */
  expectedScore: number | null
  worstScore: number | null
  bestScore: number | null
}

export function isExamItem(item: { kind: string; name: string }) {
  return item.kind === 'written' || /고사/.test(item.name)
}

const clean = (n: number) => Number(n.toFixed(10))

export function analyzeSubject(items: PredictItem[]): SubjectAnalysis {
  const exam = { max: 0, filledMax: 0, earned: 0 }
  const perf = { max: 0, filledMax: 0, earned: 0 }

  for (const item of items) {
    const max = weightedMaximum(item)
    if (max === null || !Number.isFinite(max) || max <= 0) continue
    const group = isExamItem(item) ? exam : perf
    group.max += max
    const earned = weightedScore(item, item.score)
    if (earned !== null && Number.isFinite(earned)) {
      group.filledMax += max
      group.earned += earned
    }
  }

  const rate = (g: { filledMax: number; earned: number }) => (g.filledMax > 0 ? g.earned / g.filledMax : null)
  const examRate = rate(exam)
  const perfRate = rate(perf)

  const totalMax = exam.max + perf.max
  const filledMax = exam.filledMax + perf.filledMax
  const earned = exam.earned + perf.earned

  let confirmedScore: number | null = null
  let expectedScore: number | null = null
  let worstScore: number | null = null
  let bestScore: number | null = null

  if (filledMax > 0 && totalMax > 0) {
    confirmedScore = clean((earned / filledMax) * 100)
    const examFill = examRate ?? perfRate ?? 0
    const perfFill = perfRate ?? examRate ?? 0
    const expected = earned + (exam.max - exam.filledMax) * examFill + (perf.max - perf.filledMax) * perfFill
    expectedScore = clean((expected / totalMax) * 100)
    worstScore = clean((earned / totalMax) * 100)
    bestScore = clean(((earned + (totalMax - filledMax)) / totalMax) * 100)
  }

  return {
    totalMax,
    filledMax,
    earned,
    exam: { ...exam, rate: examRate },
    perf: { ...perf, rate: perfRate },
    confirmedScore,
    expectedScore,
    worstScore,
    bestScore,
  }
}

export type TargetResult =
  | { status: 'achieved' }
  | { status: 'impossible' }
  | { status: 'needed'; rate: number; remainingMax: number; neededPoints: number }

/** 목표 점수(원점수 기준 하한)를 넘기려면 남은 항목에서 평균 몇 %를 받아야 하는지 */
export function targetRequirement(analysis: SubjectAnalysis, targetScore: number): TargetResult {
  const { totalMax, filledMax, earned } = analysis
  if (totalMax <= 0) return { status: 'impossible' }
  const needed = clean((targetScore / 100) * totalMax - earned)
  if (needed <= 0) return { status: 'achieved' }
  const remainingMax = totalMax - filledMax
  if (remainingMax <= 1e-9) return { status: 'impossible' }
  const rate = needed / remainingMax
  if (rate > 1 + 1e-9) return { status: 'impossible' }
  return { status: 'needed', rate, remainingMax, neededPoints: needed }
}

export function gpaFor(score: number | null) {
  return gradeForScore(score)?.gpa ?? null
}
