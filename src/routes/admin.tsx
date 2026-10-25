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
