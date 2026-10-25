export type Assessment = {
  points: string | null
  weight: string
  repeatCount: number
}

export const gradeScale = [
  { grade: 'A+', minimum: 89.5, gpa: 4.3 },
  { grade: 'A0', minimum: 84.5, gpa: 4.0 },
  { grade: 'A-', minimum: 79.5, gpa: 3.7 },
  { grade: 'B+', minimum: 74.5, gpa: 3.3 },
  { grade: 'B0', minimum: 69.5, gpa: 3.0 },
  { grade: 'B-', minimum: 64.5, gpa: 2.7 },
  { grade: 'C+', minimum: 59.5, gpa: 2.3 },
  { grade: 'C0', minimum: 54.5, gpa: 2.0 },
  { grade: 'C-', minimum: 49.5, gpa: 1.7 },
  { grade: 'F', minimum: 0, gpa: 0 },
] as const

export function gradeForScore(score: number | null) {
  if (score === null || !Number.isFinite(score) || score < 0) return null
  return gradeScale.find((entry) => score >= entry.minimum) ?? null
}

export function predictGrade(items: (Assessment & { score: string | number | null })[]) {
  let earned = 0
  let possible = 0

  for (const item of items) {
    const maximum = weightedMaximum(item)
    const score = weightedScore(item, item.score)
    if (maximum === null || maximum <= 0 || score === null || !Number.isFinite(maximum) || !Number.isFinite(score)) continue
    earned += score
    possible += maximum
  }

  if (possible <= 0) return null
  const score = Number((earned / possible * 100).toFixed(10))
  const grade = gradeForScore(score)
  return grade ? { score, grade: grade.grade, gpa: grade.gpa, earned, possible } : null
}

export function averageGpa(subjects: { credits: number; gpa: number | null }[]) {
  let credits = 0
  let total = 0
  let subjectCount = 0

  for (const subject of subjects) {
    if (subject.gpa === null || !Number.isFinite(subject.gpa) || subject.credits <= 0) continue
    credits += subject.credits
    total += subject.gpa * subject.credits
    subjectCount += 1
  }

  return { gpa: credits > 0 ? total / credits : null, credits, subjectCount }
}

export function maximumScore(item: Assessment) {
  return item.points === null ? null : Number(item.points) * item.repeatCount
}

export function weightedMaximum(item: Assessment) {
  const maximum = maximumScore(item)
  return maximum === null ? null : maximum * Number(item.weight)
}

export function weightedScore(item: Assessment, score: string | number | null) {
  return item.points === null || score === null ? null : Number(score) * Number(item.weight)
}

export function formatPoints(value: number) {
  return Number(value.toFixed(2)).toString()
}
