import { createFileRoute, Link } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { user, ready } = useIdentity()

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 border-b-4 border-black" aria-label="소개">
      <div className="lg:col-span-8 px-5 lg:px-10 py-12 lg:py-20 lg:border-r-4 border-black">
        <div className="max-w-3xl ml-auto lg:ml-[max(0px,calc((100vw-80rem)/2))]">
          <p className="sw-label mb-6"><span className="sw-flag mr-2">2026</span>1학년 2학기</p>
          <h1 className="sw-display text-[clamp(56px,10vw,148px)]">학점<br />관리</h1>
          <p className="mt-8 text-[17px] max-w-xl leading-relaxed">
            과목별 평가 배점을 확인하고, 학교 이메일(@sasa.hs.kr)로 로그인해 본인의 성적을 기록할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="lg:col-span-4 plane-red px-5 lg:px-10 py-12 lg:py-20 flex flex-col items-start justify-center gap-8">
        {ready && user ? (
          <Link to="/grades" className="circle hard-shadow bg-white border-4 border-black w-44 h-44 flex flex-col items-center justify-center font-extrabold text-xl text-center leading-tight hover:bg-black hover:text-white">
            내 성적<br />입력 →
          </Link>
        ) : (
          <Link to="/login" className="circle hard-shadow bg-white border-4 border-black w-44 h-44 flex flex-col items-center justify-center font-extrabold text-xl text-center leading-tight hover:bg-black hover:text-white">
            로그인 →
          </Link>
        )}
        <Link to="/subjects" className="hard-shadow plane-blue border-4 border-black px-6 py-4 font-extrabold text-lg hover:bg-white hover:!text-black">
          평가 배점표 보기
        </Link>
      </div>
    </section>
  )
}
