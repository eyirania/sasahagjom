export type Described = {
  n: number
  mean: number | null
  median: number | null
  sd: number | null
  min: number | null
  max: number | null
}

export function describe(values: number[]): Described {
  const n = values.length
  if (n === 0) return { n, mean: null, median: null, sd: null, min: null, max: null }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const mid = Math.floor(n / 2)
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const sd = Math.sqrt(sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n) // 모표준편차
  return { n, mean, median, sd, min: sorted[0], max: sorted[n - 1] }
}

/** 0~1 득점률을 bins개 구간으로 센다. 1.0은 마지막 구간에 포함. */
export function histogram(rates: number[], bins = 10) {
  const counts = new Array(bins).fill(0) as number[]
  for (const rate of rates) {
    if (!Number.isFinite(rate)) continue
    const index = Math.min(bins - 1, Math.max(0, Math.floor(rate * bins)))
    counts[index] += 1
  }
  return counts
}
