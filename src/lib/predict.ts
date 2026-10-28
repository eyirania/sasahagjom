import { gradeForScore, maximumScore, weightedMaximum, weightedScore } from './grading'

export type PredictItem = {
  name: string
  kind: string
  points: string | null
  weight: string
  repeatCount: number
  score: string | number | null
  examSlot?: string | null
  /** 서버가 계산한 이 빈 항목의 예상 득점률(0~1)과 흔들림 폭. 없으면 본인 득점률로 대체 */
  predRate?: number | null
  predSd?: number | null
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
  /** 수행 득점률도 예상값도 없어 채우지 않고 둔 수행 항목의 반영 만점 합 (예상 점수 계산에서 제외) */
  unfilledMax: number
  worstScore: number | null
  bestScore: number | null
}

export function isExamItem(item: { kind: string; name: string }) {
  return item.kind === 'written' || /고사/.test(item.name)
}

const clean = (n: number) => Number(n.toFixed(10))

export function analyzeSubject(items: PredictItem[]): SubjectAnalysis {
  const exam = { max: 0, filledMax: 0, earned: 0, predMax: 0 }
  const perf = { max: 0, filledMax: 0, earned: 0, predMax: 0 }
  let predAdd = 0

  for (const item of items) {
    const max = weightedMaximum(item)
    if (max === null || !Number.isFinite(max) || max <= 0) continue
    const group = isExamItem(item) ? exam : perf
    group.max += max
    const earned = weightedScore(item, item.score)
    if (earned !== null && Number.isFinite(earned)) {
      group.filledMax += max
      group.earned += earned
    } else if (item.predRate !== null && item.predRate !== undefined && Number.isFinite(item.predRate)) {
      group.predMax += max
      predAdd += max * Math.min(1, Math.max(0, item.predRate))
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
  let unfilledMax = 0

  if (filledMax > 0 && totalMax > 0) {
    confirmedScore = clean((earned / filledMax) * 100)
    const examFill = examRate ?? perfRate ?? 0
    const perfRemain = perf.max - perf.filledMax - perf.predMax
    // 수행은 수행 득점률로만 채운다. 수행 입력도 예상값도 없으면 지필로 채우지 않고 계산에서 뺀다.
    unfilledMax = perfRate === null ? perfRemain : 0
    const perfFill = perfRate ?? 0
    const expected = earned + predAdd + (exam.max - exam.filledMax - exam.predMax) * examFill + perfRemain * perfFill
    expectedScore = clean((expected / (totalMax - unfilledMax)) * 100)
    worstScore = clean((earned / totalMax) * 100)
    bestScore = clean(((earned + (totalMax - filledMax)) / totalMax) * 100)
  }

  return {
    totalMax,
    filledMax,
    earned,
    exam: { max: exam.max, filledMax: exam.filledMax, earned: exam.earned, rate: examRate },
    perf: { max: perf.max, filledMax: perf.filledMax, earned: perf.earned, rate: perfRate },
    confirmedScore,
    expectedScore,
    unfilledMax,
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

export type EmptyItemModel = {
  name: string
  max: number // 반영 만점
  base: number // 예상 득점률
  sd: number // 흔들림 폭
  kind: 'exam' | 'perf'
  points: number // 원점수 만점
  examSlot: string | null
}

const populationSd = (xs: number[]) => {
  if (xs.length < 2) return null
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

/** 아직 비어 있는 항목마다 예상 득점률과 흔들림 폭을 정리한다. */
export function emptyItemModels(items: PredictItem[], analysis: SubjectAnalysis): EmptyItemModel[] {
  const filledRates = { exam: [] as number[], perf: [] as number[] }
  for (const item of items) {
    const max = maximumScore(item)
    if (max === null || max <= 0 || item.score === null || item.score === undefined) continue
    filledRates[isExamItem(item) ? 'exam' : 'perf'].push(Number(item.score) / max)
  }
  const own = (kind: 'exam' | 'perf') => {
    const rate = kind === 'exam' ? analysis.exam.rate ?? analysis.perf.rate : analysis.perf.rate ?? analysis.exam.rate
    const spread = populationSd(filledRates[kind])
    return { rate: rate ?? 0, sd: Math.max(0.04, spread ?? (kind === 'exam' ? 0.08 : 0.12)) }
  }
  const out: EmptyItemModel[] = []
  for (const item of items) {
    const wMax = weightedMaximum(item)
    const pMax = maximumScore(item)
    if (wMax === null || wMax <= 0 || pMax === null || (item.score !== null && item.score !== undefined)) continue
    const kind = isExamItem(item) ? 'exam' : 'perf'
    const fallback = own(kind)
    const hasPred = item.predRate !== null && item.predRate !== undefined && Number.isFinite(item.predRate)
    if (kind === 'perf' && !hasPred && analysis.perf.rate === null) continue // 채우지 않고 둔 수행
    out.push({
      name: item.name,
      max: wMax,
      base: hasPred ? Math.min(1, Math.max(0, item.predRate!)) : fallback.rate,
      sd: hasPred && item.predSd ? Math.max(0.03, item.predSd) : fallback.sd,
      kind,
      points: pMax,
      examSlot: item.examSlot ?? null,
    })
  }
  return out
}

export type FinalResult =
  | { status: 'achieved'; name: string }
  | { status: 'impossible'; name: string }
  | { status: 'needed'; name: string; rawScore: number; outOf: number }

/** 현재 추세로 다른 빈 항목을 채웠을 때, 기말(없으면 마지막 빈 지필)에서 목표 점수를 넘기려면 몇 점이 필요한지 */
export function finalRequirement(items: PredictItem[], analysis: SubjectAnalysis, targetScore: number): FinalResult | null {
  if (analysis.totalMax <= 0 || analysis.filledMax <= 0) return null
  const empties = emptyItemModels(items, analysis)
  const exams = empties.filter((e) => e.kind === 'exam')
  const target = exams.find((e) => e.examSlot === 'final') ?? exams[exams.length - 1]
  if (!target) return null
  const others = empties.filter((e) => e !== target).reduce((sum, e) => sum + e.max * e.base, 0)
  const need = clean((targetScore / 100) * (analysis.totalMax - analysis.unfilledMax) - analysis.earned - others)
  if (need <= 1e-9) return { status: 'achieved', name: target.name }
  const rate = need / target.max
  if (rate > 1 + 1e-9) return { status: 'impossible', name: target.name }
  return { status: 'needed', name: target.name, rawScore: rate * target.points, outOf: target.points }
}
