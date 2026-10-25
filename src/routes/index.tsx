import { createFileRoute, Link } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { user, ready } = useIdentity()
  const btn = 'inline-block font-bold px-5 py-3 border-2 border-black'

  return (
    <div className="max-w-7xl mx-auto px-5 lg:px-10">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-10 py-12 lg:py-20 border-b-2 border-black">
        <div className="lg:col-span-9">
          <p className="sw-label mb-6"><span className="sw-flag mr-2">2026</span>1학년 2학기</p>
          <h1 className="sw-display text-[clamp(52px,10vw,148px)]">
            학점 관리
          </h1>
        </div>
        <div className="lg:col-span-3 flex flex-col justify-end gap-6">
          <p className="text-[17px] leading-relaxed">
            과목별 평가 배점을 확인하고, 학교 이메일(@sasa.hs.kr)로 로그인해 본인의 성적을 기록할 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/subjects" className={`${btn} bg-black text-white hover:bg-white hover:text-black`}>평가 배점표 보기</Link>
            {ready && !user && <Link to="/login" className={`${btn} hover:bg-black hover:text-white`}>로그인</Link>}
            {ready && user && <Link to="/grades" className={`${btn} hover:bg-black hover:text-white`}>내 성적 입력</Link>}
          </div>
        </div>
      </section>
    </div>
  )
}
