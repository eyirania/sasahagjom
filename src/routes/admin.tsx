import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useEffect, useState } from 'react'
import { getServerUser } from '../lib/auth'
import { isAdmin } from '../lib/auth'
import { getAdminStats } from '../server/scores.functions'
import { formatPoints } from '../lib/grading'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await getServerUser()
    if (!user) throw redirect({ to: '/login' })
    if (!isAdmin(user as any)) throw redirect({ to: '/' })
  },
  loader: async () => {
    const stats = await getAdminStats()
    return { stats }
  },
  component: AdminPage,
})

function AdminPage() {
  const { stats } = Route.useLoaderData() as { stats: Awaited<ReturnType<typeof getAdminStats>> }
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const chartSubjects = stats.subjectStats.filter((subject) => subject.gradingType !== 'pass_fail' && subject.totalPossible !== null)
  const chartData = {
    labels: chartSubjects.map((subject) => subject.name),
    datasets: [
      {
        label: '평균 예측 원점수 (100점 기준)',
        data: chartSubjects.map((subject) => subject.averagePredictedScore),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderRadius: 4,
      },
    ],
  }

  const splitChartData = {
    labels: stats.splitStats.filter((s) => s.exam.n > 0 || s.perf.n > 0).map((s) => s.name),
    datasets: [
      {
        label: '지필 평균 득점률 (%)',
        data: stats.splitStats.filter((s) => s.exam.n > 0 || s.perf.n > 0).map((s) => (s.exam.mean === null ? null : Number((s.exam.mean * 100).toFixed(1)))),
        backgroundColor: 'rgba(79, 107, 255, 0.75)',
        borderRadius: 4,
      },
      {
        label: '수행 평균 득점률 (%)',
        data: stats.splitStats.filter((s) => s.exam.n > 0 || s.perf.n > 0).map((s) => (s.perf.mean === null ? null : Number((s.perf.mean * 100).toFixed(1)))),
        backgroundColor: 'rgba(46, 196, 182, 0.75)',
        borderRadius: 4,
      },
    ],
  }
  const itemsBySubject = new Map<number, typeof stats.itemStats>()
  for (const item of stats.itemStats) {
    const list = itemsBySubject.get(item.subjectId) ?? []
    list.push(item)
    itemsBySubject.set(item.subjectId, list)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">관리자 통계</h1>
        <p className="text-sm text-gray-500 mt-1">
          등록된 학생 {stats.studentCount}명의 과목별 성적 통계입니다.
          원점수에 반영비율을 적용하며, 확인된 항목의 입력 점수만 합산합니다. 미입력·미확정 점수는 추가하지 않습니다.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          예측 원점수는 학생별 입력 항목의 반영 점수 합계 ÷ 해당 항목의 반영 만점 합계 × 100입니다.
          평균등급은 평균 예측 원점수에 등급 기준을 적용하며, 평균 GPA는 학생별 과목 GPA의 평균입니다.
          빈칸·만점 미정 항목·P/F 과목은 예측에서 제외하며, 예측치는 최종 성적과 다를 수 있습니다.
        </p>
      </div>

      {mounted && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">과목별 평균 예측 원점수</h2>
          <Bar
            data={chartData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, max: 100 } },
            }}
          />
        </div>
      )}

      {mounted && splitChartData.labels.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">과목별 지필 · 수행 평균 득점률</h2>
          <p className="text-xs text-gray-500 mb-4">학생별 득점률(입력한 항목 기준)의 평균입니다. 해당 영역을 입력한 학생이 없으면 표시하지 않습니다.</p>
          <Bar
            data={splitChartData}
            options={{
              responsive: true,
              plugins: { legend: { position: 'bottom' } },
              scales: { y: { beginAtZero: true, max: 100 } },
            }}
          />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">지필 · 수행 분석 · 입력률</h2>
        <p className="text-xs text-gray-500 mb-4">득점률은 학생별 (입력 항목의 반영 점수 ÷ 반영 만점). 표본 수(n)가 작으면 해석에 주의하세요.</p>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-4">과목</th>
              <th className="py-2 pr-4">입력 학생</th>
              <th className="py-2 pr-4">입력률</th>
              <th className="py-2 pr-4">지필 평균 (n)</th>
              <th className="py-2 pr-4">지필 표준편차</th>
              <th className="py-2 pr-4">수행 평균 (n)</th>
              <th className="py-2 pr-4">수행 표준편차</th>
              <th className="py-2 pr-4">예상 원점수 평균</th>
            </tr>
          </thead>
          <tbody>
            {stats.splitStats.map((s) => (
              <tr key={s.subjectId} className="border-b border-gray-100">
                <td className="py-2 pr-4">{s.name}</td>
                <td className="py-2 pr-4">{s.entered} / {stats.studentCount}</td>
                <td className="py-2 pr-4">{s.enteredRate === null ? '—' : `${(s.enteredRate * 100).toFixed(0)}%`}</td>
                <td className="py-2 pr-4">{s.exam.mean === null ? '—' : `${(s.exam.mean * 100).toFixed(1)}% (${s.exam.n})`}</td>
                <td className="py-2 pr-4">{s.exam.sd === null ? '—' : `${(s.exam.sd * 100).toFixed(1)}%p`}</td>
                <td className="py-2 pr-4">{s.perf.mean === null ? '—' : `${(s.perf.mean * 100).toFixed(1)}% (${s.perf.n})`}</td>
                <td className="py-2 pr-4">{s.perf.sd === null ? '—' : `${(s.perf.sd * 100).toFixed(1)}%p`}</td>
                <td className="py-2 pr-4">{s.expected.mean === null ? '—' : s.expected.mean.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">항목별 점수 분포</h2>
        <p className="text-xs text-gray-500 mb-4">원점수 기준 통계이며 막대는 득점률 구간(0~10%, … 90~100%)별 학생 수입니다. 과목을 눌러 펼치세요.</p>
        <div className="space-y-2">
          {stats.splitStats.map((s) => {
            const items = itemsBySubject.get(s.subjectId) ?? []
            if (items.length === 0) return null
            return (
              <details key={s.subjectId} className="border border-gray-100 rounded-lg">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-800">
                  {s.name} <span className="text-gray-400 font-normal">· 입력 {s.entered}명</span>
                </summary>
                <div className="overflow-x-auto px-4 pb-3">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="py-2 pr-3">항목</th><th className="pr-3">구분</th><th className="pr-3">만점</th>
                        <th className="pr-3">n</th><th className="pr-3">평균</th><th className="pr-3">중앙값</th>
                        <th className="pr-3">표준편차</th><th className="pr-3">최저~최고</th><th>분포</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const top = Math.max(1, ...item.histogram)
                        return (
                          <tr key={item.itemId} className="border-b border-gray-50">
                            <td className="py-2 pr-3">{item.name}</td>
                            <td className="pr-3 text-xs text-gray-500">{item.isExam ? '지필' : '수행'}</td>
                            <td className="pr-3">{formatPoints(item.pointsMax)}</td>
                            <td className="pr-3">{item.n}</td>
                            <td className="pr-3 tabular-nums">{item.mean === null ? '—' : item.mean.toFixed(2)}</td>
                            <td className="pr-3 tabular-nums">{item.median === null ? '—' : item.median.toFixed(2)}</td>
                            <td className="pr-3 tabular-nums">{item.sd === null ? '—' : item.sd.toFixed(2)}</td>
                            <td className="pr-3 tabular-nums">{item.min === null ? '—' : `${formatPoints(item.min)} ~ ${formatPoints(item.max ?? item.min)}`}</td>
                            <td>
                              <div className="flex items-end gap-px h-8" aria-label="득점률 분포">
                                {item.histogram.map((count, index) => (
                                  <div
                                    key={index}
                                    title={`${index * 10}~${(index + 1) * 10}%: ${count}명`}
                                    className="w-2 bg-indigo-400 rounded-sm"
                                    style={{ height: `${Math.max(count > 0 ? 12 : 3, (count / top) * 100)}%`, opacity: count > 0 ? 1 : 0.25 }}
                                  />
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">과목별 상세 통계</h2>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-4">과목</th>
              <th className="py-2 pr-4">구분</th>
              <th className="py-2 pr-4">배점 합계</th>
              <th className="py-2 pr-4">응답 학생 수</th>
              <th className="py-2 pr-4">평균 반영 합계</th>
              <th className="py-2 pr-4">최고</th>
              <th className="py-2 pr-4">최저</th>
              <th className="py-2 pr-4">예측 학생 수</th>
              <th className="py-2 pr-4">평균 예측 원점수</th>
              <th className="py-2 pr-4">평균등급 (예측)</th>
              <th className="py-2 pr-4">평균 GPA (예측)</th>
              <th className="py-2 pr-4">P/F 결과</th>
            </tr>
          </thead>
          <tbody>
            {stats.subjectStats.map((s) => (
              <tr key={s.subjectId} className="border-b border-gray-100">
                <td className="py-2 pr-4">{s.name}</td>
                <td className="py-2 pr-4">{s.gradingType === 'pass_fail' ? 'P/F' : '등급'}</td>
                <td className="py-2 pr-4">{s.totalPossible === null ? '—' : formatPoints(s.totalPossible)}</td>
                <td className="py-2 pr-4">{s.studentsRecorded}</td>
                <td className="py-2 pr-4">{s.average?.toFixed(1) ?? '-'}</td>
                <td className="py-2 pr-4">{s.max === null ? '-' : formatPoints(s.max)}</td>
                <td className="py-2 pr-4">{s.min === null ? '-' : formatPoints(s.min)}</td>
                <td className="py-2 pr-4">{s.gradingType === 'pass_fail' ? '—' : s.studentsPredicted}</td>
                <td className="py-2 pr-4">{s.averagePredictedScore?.toFixed(2) ?? '—'}</td>
                <td className="py-2 pr-4 font-semibold">{s.averageGrade ?? '—'}</td>
                <td className="py-2 pr-4 tabular-nums">{s.averageGpa?.toFixed(2) ?? '—'}</td>
                <td className="py-2 pr-4">{s.gradingType === 'pass_fail' ? `P ${s.passes}명 / F ${s.fails}명` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">학생별 예측 평균 GPA</h2>
        <p className="text-xs text-gray-500 mb-4">이수학점 가중평균 · P/F 제외 · 등급 과목의 F는 0점으로 포함 · 저장된 점수 기준</p>
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead><tr className="text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">학생</th><th className="pr-4">이메일</th><th className="pr-4">반영 과목 수</th><th className="pr-4">반영 학점</th><th>예측 평균 GPA / 4.30</th>
          </tr></thead>
          <tbody>
            {stats.students.map((student) => (
              <tr key={student.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{student.name}</td>
                <td className="pr-4 text-gray-400">{student.email}</td>
                <td className="pr-4">{student.gradedSubjects}</td>
                <td className="pr-4">{student.gpaCredits}</td>
                <td className="font-semibold tabular-nums">{student.averageGpa?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
            {stats.students.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-gray-400">아직 로그인한 학생이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
