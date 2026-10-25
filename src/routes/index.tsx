import { createFileRoute, Link } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { user, ready } = useIdentity()

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
      <section className="pt-20 pb-24 lg:pt-32 lg:pb-32" aria-label="소개">
        <p className="text-[15px] text-gray-500 mb-6">세종과학예술영재학교 · 1학년 2학기</p>
        <h1 className="sw-display text-[clamp(56px,9vw,128px)] max-w-4xl">
          학점 관리,<br />한눈에.
        </h1>
        <p className="mt-10 text-[18px] leading-relaxed text-gray-700 max-w-xl">
          과목별 평가 배점을 확인하고, 학교 이메일(@sasa.hs.kr)로 로그인해 본인의 성적을 기록할 수 있습니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/subjects" className="btn-primary">평가 배점표 보기</Link>
          {ready && !user && <Link to="/login" className="btn-ghost !py-3.5">로그인</Link>}
          {ready && user && <Link to="/grades" className="btn-ghost !py-3.5">내 성적 입력</Link>}
        </div>
      </section>
    </div>
  )
}
