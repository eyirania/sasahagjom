import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  getSubjectsWithItems,
  upsertAssessmentItem,
  deleteAssessmentItem,
} from '../server/subjects.functions'
import { useIdentity } from '../lib/identity-context'
import { isAdmin } from '../lib/auth'
import { maximumScore, weightedMaximum, formatPoints } from '../lib/grading'

export const Route = createFileRoute('/subjects')({
  loader: async () => {
    const subjects = await getSubjectsWithItems()
    return { subjects }
  },
  component: SubjectsPage,
})

type Item = {
  id: number
  subjectId: number
  name: string
  points: string | null
  weight: string
  repeatCount: number
  kind: string
  examSlot: string | null
  needsConfirmation: boolean
}

function examLabel(items: Item[]) {
  if (!items.length || items.every((item) => item.points === null)) return '평가 항목 미확정'
  const written = items.filter((i) => i.kind === 'written')
  const hasMidterm = written.some((i) => i.examSlot === 'midterm')
  const hasFinal = written.some((i) => i.examSlot === 'final')
  if (!written.length) return '지필평가 없음'
  if (hasMidterm && hasFinal) return '중간+기말고사'
  if (hasFinal) return '기말고사만'
  if (hasMidterm) return '중간고사만'
  return '지필평가 있음 (시기 확인 필요)'
}

function SubjectsPage() {
  const { subjects } = Route.useLoaderData() as { subjects: Awaited<ReturnType<typeof getSubjectsWithItems>> }
  const { user } = useIdentity()
  const admin = isAdmin(user as any)
  const [data, setData] = useState(subjects)

  const upsert = useServerFn(upsertAssessmentItem)
  const remove = useServerFn(deleteAssessmentItem)

  async function refresh() {
    const fresh = await getSubjectsWithItems()
    setData(fresh)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">1학년 2학기 평가 배점표</h1>
        <p className="text-sm text-gray-500 mt-1">
          전달받은 평가 요소와 배점만 반영했습니다. 미확정 항목의 이름과 만점은 빈칸이며, 부족한 배점은 자동으로 더하지 않습니다.
          {admin ? ' 관리자로 로그인 중이므로 아래에서 직접 수정할 수 있습니다.' : ' 관리자만 수정할 수 있습니다.'}
        </p>
      </div>

      {data.map((subject) => {
        const items = subject.items as Item[]
        const total = items.reduce(
          (sum, item) => sum + (weightedMaximum(item) ?? 0),
          0,
        )
        const missing = 100 - total

        return (
          <section key={subject.id} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">
                {subject.name}{' '}
                <span className="text-sm font-normal text-gray-400">
                  ({subject.category} · {subject.credits}학점
                  {subject.gradingType === 'pass_fail' ? ' · Pass/Fail' : ' · 등급'})
                </span>
              </h2>
              <span className="text-xs text-gray-500">{subject.gradingType === 'pass_fail' ? 'P 또는 F만 선택' : examLabel(items)}</span>
            </div>

            {subject.gradingType === 'pass_fail' ? (
              <p className="text-sm text-gray-500 mt-4">숫자 점수 없이 P/F 결과만 기록합니다.</p>
            ) : <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm mt-4 border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-2">평가 요소</th>
                  <th className="py-2 pr-2">원점수 만점</th>
                  <th className="py-2 pr-2">반영비율</th>
                  <th className="py-2 pr-2">반영 배점</th>
                  <th className="py-2 pr-2">반복</th>
                  <th className="py-2 pr-2">지필 여부</th>
                  <th className="py-2 pr-2">상태</th>
                  {admin && <th className="py-2">관리</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    admin={admin}
                    onSave={async (patch) => {
                      await upsert({
                        data: {
                          ...item,
                          ...patch,
                          points: (patch.points === undefined ? item.points : patch.points) === null
                            ? null : Number(patch.points ?? item.points),
                          weight: Number(patch.weight ?? item.weight),
                        } as any,
                      })
                      await refresh()
                    }}
                    onDelete={async () => {
                      await remove({ data: { id: item.id } })
                      await refresh()
                    }}
                  />
                ))}
                {(items.length === 0 || (missing > 0 && !items.some((item) => item.points === null))) && (
                  <tr className="border-b border-gray-100" aria-label="미확정 평가 항목">
                    <td className="py-3"></td><td></td><td></td><td></td><td></td><td></td>
                    <td className="text-amber-600 text-xs">미확정</td>
                    {admin && <td></td>}
                  </tr>
                )}
                <tr className="font-semibold border-t-2 border-gray-300">
                  <td className="py-2 pr-2">확인된 배점 합계</td>
                  <td></td><td></td>
                  <td className="py-2 pr-2">{items.some((item) => item.points !== null) ? formatPoints(total) : ''}</td>
                  <td className="py-2 pr-2" colSpan={admin ? 4 : 3}></td>
                </tr>
              </tbody>
            </table>
            </div>

            {missing > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                {total > 0 ? `확인된 배점은 ${formatPoints(total)}점입니다. ` : ''}
                나머지 평가 항목은 미확정이며, 이름·배점·기본점수를 임의로 추가하지 않습니다.
              </p>
            )}
            {missing < 0 && (
              <p className="text-xs text-red-600 mt-2">
                배점 합계가 100점을 {Math.abs(missing)}점 초과합니다. 확인이 필요합니다.
              </p>
            )}

            {admin && (
              <AddItemForm
                onAdd={async (values) => {
                  await upsert({ data: { subjectId: subject.id, ...values } as any })
                  await refresh()
                }}
              />
            )}
            </>}
          </section>
        )
      })}
    </div>
  )
}

function ItemRow({
  item,
  admin,
  onSave,
  onDelete,
}: {
  item: Item
  admin: boolean
  onSave: (patch: Partial<Item>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(item.name)
  const [points, setPoints] = useState(item.points ?? '')
  const [weight, setWeight] = useState(formatPoints(Number(item.weight) * 100))
  const [repeatCount, setRepeatCount] = useState(item.repeatCount)
  const [kind, setKind] = useState(item.kind)
  const [examSlot, setExamSlot] = useState(item.examSlot ?? '')
  const [needsConfirmation, setNeedsConfirmation] = useState(item.needsConfirmation)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!editing) {
    return (
      <tr className="border-b border-gray-100">
        <td className="py-2 pr-2">{item.name}</td>
        <td className="py-2 pr-2">{item.points === null ? '' : formatPoints(maximumScore(item)!)}</td>
        <td className="py-2 pr-2">{item.points === null ? '' : `${formatPoints(Number(item.weight) * 100)}%`}</td>
        <td className="py-2 pr-2">{item.points === null ? '' : formatPoints(weightedMaximum(item)!)}</td>
        <td className="py-2 pr-2">{item.repeatCount > 1 ? `×${item.repeatCount}회` : '-'}</td>
        <td className="py-2 pr-2">{item.kind === 'written' ? '지필' : '수행'}</td>
        <td className="py-2 pr-2">
          {item.needsConfirmation ? (
            <span className="text-amber-600">확인 필요</span>
          ) : (
            <span className="text-emerald-600">확정</span>
          )}
        </td>
        {admin && (
          <td className="py-2 flex gap-2">
            <button className="text-blue-600 hover:underline" onClick={() => setEditing(true)}>
              수정
            </button>
            <button className="text-red-500 hover:underline" onClick={onDelete}>
              삭제
            </button>
          </td>
        )}
      </tr>
    )
  }

  return (
    <tr className="border-b border-gray-100 bg-blue-50/40">
      <td className="py-2 pr-2">
        <input className="border rounded px-1 w-28" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={0}
          step="0.01"
          aria-label="원점수 만점"
          className="border rounded px-1 w-16"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
        />
      </td>
      <td className="py-2 pr-2">
        <input type="number" min={0.01} max={100} step="0.01" aria-label="반영비율 (%)"
          className="border rounded px-1 w-16" value={weight} onChange={(event) => setWeight(event.target.value)} />
      </td>
      <td className="py-2 pr-2">{points === '' ? '' : formatPoints(Number(points) * repeatCount * Number(weight) / 100)}</td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={1}
          className="border rounded px-1 w-14"
          value={repeatCount}
          onChange={(e) => setRepeatCount(Number(e.target.value))}
        />
      </td>
      <td className="py-2 pr-2">
        <select className="border rounded px-1" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="written">지필</option>
          <option value="performance">수행</option>
        </select>
        {kind === 'written' && (
          <select
            className="border rounded px-1 ml-1"
            value={examSlot}
            onChange={(e) => setExamSlot(e.target.value)}
          >
            <option value="">-</option>
            <option value="midterm">중간고사</option>
            <option value="final">기말고사</option>
          </select>
        )}
      </td>
      <td className="py-2 pr-2">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={needsConfirmation}
            onChange={(e) => setNeedsConfirmation(e.target.checked)}
          />
          확인 필요
        </label>
      </td>
      <td className="py-2 flex gap-2">
        <button
          disabled={saving}
          className="text-emerald-600 hover:underline"
          onClick={async () => {
            setSaving(true)
            setError('')
            try {
              await onSave({
                name,
                points: points === '' ? null : points,
                weight: String(Number(weight) / 100),
                repeatCount,
                kind,
                examSlot: kind === 'written' ? (examSlot || null) : null,
                needsConfirmation,
              })
              setEditing(false)
            } catch (error: any) {
              setError(error.message || '저장 실패')
            } finally {
              setSaving(false)
            }
          }}
        >
          저장
        </button>
        <button className="text-gray-500 hover:underline" onClick={() => setEditing(false)}>
          취소
        </button>
        {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
      </td>
    </tr>
  )
}

function AddItemForm({
  onAdd,
}: {
  onAdd: (values: {
    name: string
    points: number | null
    weight: number
    repeatCount: number
    kind: string
    examSlot: string | null
    needsConfirmation: boolean
  }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [points, setPoints] = useState('')
  const [weight, setWeight] = useState('100')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) {
    return (
      <button className="text-sm text-blue-600 hover:underline mt-3" onClick={() => setOpen(true)}>
        + 평가 요소 추가
      </button>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <input
        className="border rounded px-2 py-1"
        placeholder="평가 요소 이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="number"
        min={0}
        step="0.01"
        className="border rounded px-2 py-1 w-20"
        placeholder="만점"
        value={points}
        onChange={(e) => setPoints(e.target.value)}
      />
      <input type="number" min={0.01} max={100} step="0.01" aria-label="반영비율 (%)"
        className="border rounded px-2 py-1 w-20" value={weight} onChange={(event) => setWeight(event.target.value)} />
      <span>% 반영</span>
      <button
        disabled={saving}
        className="text-emerald-600 hover:underline"
        onClick={async () => {
          setSaving(true)
          setError('')
          try {
            await onAdd({
              name,
              points: points === '' ? null : Number(points),
              weight: Number(weight) / 100,
              repeatCount: 1,
              kind: 'performance',
              examSlot: null,
              needsConfirmation: true,
            })
            setName('')
            setPoints('')
            setWeight('100')
            setOpen(false)
          } catch (error: any) {
            setError(error.message || '추가 실패')
          } finally {
            setSaving(false)
          }
        }}
      >
        추가
      </button>
      <button className="text-gray-500 hover:underline" onClick={() => setOpen(false)}>
        취소
      </button>
      {error && <span role="alert" className="text-red-500 text-xs">{error}</span>}
    </div>
  )
}
