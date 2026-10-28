// 서버 전용으로 쓰는 계산. 결과에는 항목별 "예상 득점률"과 "흔들림 폭"만 담고,
// 다른 학생의 점수·통계 값은 어떤 형태로도 내보내지 않는다.
export type PeerItem = {
  id: number
  subjectId: number
  max: number | null // 원점수 만점 (points × repeatCount)
  isExam: boolean
}
export type PeerRow = { studentId: number; itemId: number; score: number }
export type ItemPrediction = { rate: number; sd: number }

export const MIN_PEERS = 5

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const round2 = (x: number) => Math.round(x * 100) / 100

/**
 * 내가 아직 점수를 넣지 않은 항목마다 예상 득점률을 낸다.
 * 내가 점수를 넣은 항목에서 "그 항목의 일반적인 수준 대비 내 위치"를 구하고(과목별 지필/수행 따로, 표본이 적으면 전체 쪽으로 당김),
 * 빈 항목의 일반적인 수준에 그 위치를 더한다. 비교 표본이 MIN_PEERS명 미만인 항목은 건너뛴다(호출 측이 자기 득점률로 대체).
 */
export function computePredictions(
  items: PeerItem[],
  rows: PeerRow[],
  meId: number,
  minPeers = MIN_PEERS,
): Map<number, ItemPrediction> {
  const byItem = new Map<number, PeerRow[]>()
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? []
    list.push(row)
    byItem.set(row.itemId, list)
  }

  type Stat = { m: number; s: number; n: number }
  const stats = new Map<number, Stat>()
  const mine = new Map<number, number>() // itemId -> 내 득점률
  for (const item of items) {
    if (item.max === null || item.max <= 0) continue
    const list = byItem.get(item.id) ?? []
    const peers = list.filter((r) => r.studentId !== meId).map((r) => clamp01(r.score / item.max!))
    const myRow = list.find((r) => r.studentId === meId)
    if (myRow) mine.set(item.id, clamp01(myRow.score / item.max))
    if (peers.length >= minPeers) stats.set(item.id, { m: mean(peers), s: sd(peers), n: peers.length })
  }

  // 내 위치(내 득점률 − 그 항목의 일반적인 수준)를 과목·지필/수행별로 모은다
  type Kind = 'exam' | 'perf'
  const kindOf = (item: PeerItem): Kind => (item.isExam ? 'exam' : 'perf')
  const pooled = { exam: [] as number[], perf: [] as number[] }
  const bySubject = new Map<string, number[]>()
  for (const item of items) {
    const stat = stats.get(item.id)
    const rate = mine.get(item.id)
    if (!stat || rate === undefined) continue
    const d = rate - stat.m
    pooled[kindOf(item)].push(d)
    const key = `${item.subjectId}:${kindOf(item)}`
    bySubject.set(key, [...(bySubject.get(key) ?? []), d])
  }
  const all = [...pooled.exam, ...pooled.perf]
  const out = new Map<number, ItemPrediction>()
  if (all.length === 0) return out

  // 전체(지필/수행별) 위치는 0 쪽으로 당기고, 과목별 위치는 전체 위치 쪽으로 당긴다
  const base = (kind: Kind) => {
    const xs = pooled[kind].length > 0 ? pooled[kind] : all
    return { delta: xs.reduce((a, b) => a + b, 0) / (xs.length + 2), spread: xs.length >= 2 ? sd(xs) / Math.sqrt(xs.length) : 0.08 }
  }
  const baseModel = { exam: base('exam'), perf: base('perf') }

  for (const item of items) {
    if (mine.has(item.id)) continue
    const stat = stats.get(item.id)
    if (!stat || item.max === null || item.max <= 0) continue
    const kind = kindOf(item)
    const own = bySubject.get(`${item.subjectId}:${kind}`) ?? []
    const { delta: pooledDelta, spread } = baseModel[kind]
    const delta = (own.reduce((a, b) => a + b, 0) + 2 * pooledDelta) / (own.length + 2)
    out.set(item.id, {
      rate: round2(clamp01(stat.m + delta)),
      sd: round2(Math.max(0.03, Math.sqrt(stat.s ** 2 + spread ** 2))),
    })
  }
  return out
}
