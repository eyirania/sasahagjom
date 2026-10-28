import { gradeForScore } from './grading'
import type { EmptyItemModel } from './predict'

export type McSubject = { credits: number; earned: number; totalMax: number; empties: EmptyItemModel[] }
export type McResult = { lower: number; mean: number; upper: number; probability: number | null }

/** 고정 시드 난수(같은 입력이면 항상 같은 결과) */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(rand: () => number) {
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** 과목별 빈 항목 점수를 정규분포로 뽑아 전체 평점의 분포를 만든다. */
export function simulateGpa(subjects: McSubject[], goal: number | null, runs = 2000, seed = 20261028): McResult | null {
  const live = subjects.filter((s) => s.credits > 0 && s.totalMax > 0)
  if (live.length === 0) return null
  const totalCredits = live.reduce((a, s) => a + s.credits, 0)
  const rand = mulberry32(seed)
  const results: number[] = []
  for (let i = 0; i < runs; i++) {
    let total = 0
    for (const s of live) {
      const zShared = { exam: normal(rand), perf: normal(rand) }
      let score = s.earned
      for (const e of s.empties) {
        const r = e.base + e.sd * (0.6 * zShared[e.kind] + 0.8 * normal(rand))
        score += e.max * Math.min(1, Math.max(0, r))
      }
      total += (gradeForScore((score / s.totalMax) * 100)?.gpa ?? 0) * s.credits
    }
    results.push(total / totalCredits)
  }
  results.sort((a, b) => a - b)
  const half = Math.floor(results.length / 2)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    lower: avg(results.slice(0, half)),
    mean: avg(results),
    upper: avg(results.slice(results.length - half)),
    probability: goal === null ? null : results.filter((g) => g >= goal - 1e-9).length / results.length,
  }
}
