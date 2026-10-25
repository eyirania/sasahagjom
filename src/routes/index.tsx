import { createFileRoute, Link } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { user, ready } = useIdentity()

  return (
    <div className="min-h-[70vh] bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          세종과학예술영재학교 1학년 2학기 학점 관리
        </h1>
        <p className="text-gray-600 mb-8">
          과목별 평가 배점을 확인하고, 학교 이메일(@sasa.hs.kr)로 로그인해 본인의 성적을 기록할 수 있습니다.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            to="/subjects"
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            평가 배점표 보기
          </Link>
          {ready && !user && (
            <Link
              to="/login"
              className="border border-gray-300 px-5 py-2.5 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            >
              로그인
            </Link>
          )}
          {ready && user && (
            <Link
              to="/grades"
              className="border border-gray-300 px-5 py-2.5 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            >
              내 성적 입력
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
