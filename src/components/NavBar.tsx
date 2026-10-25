import { Link } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'
import { isAdmin } from '../lib/auth'

const linkClass = 'px-4 py-2 rounded-3xl hover:bg-black/5'
const activeProps = { className: 'bg-black/[0.06]' }

export function NavBar() {
  const { user, ready, logout } = useIdentity()
  const admin = isAdmin(user as any)

  return (
    <header className="bg-[#fdfdf7]/95 sticky top-0 z-10 border-b border-black/10">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-10 min-h-16 flex flex-wrap items-center justify-between gap-x-6">
        <div className="flex flex-wrap items-center gap-x-6">
          <Link to="/" className="text-xl font-medium tracking-tight py-3">SASA 학점</Link>
          <nav className="flex flex-wrap items-center text-[15px]" aria-label="주 메뉴">
            <Link to="/subjects" className={linkClass} activeProps={activeProps}>평가 배점표</Link>
            {ready && user && <Link to="/grades" className={linkClass} activeProps={activeProps}>내 성적 입력</Link>}
            {admin && <Link to="/admin" className={linkClass} activeProps={activeProps}>관리자 통계</Link>}
          </nav>
        </div>
        <div className="text-[15px] py-2">
          {!ready ? null : user ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500 hidden sm:inline">{user.email}</span>
              <button onClick={() => logout()} className="plain btn-ghost">로그아웃</button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary text-[15px] !py-2">로그인</Link>
          )}
        </div>
      </div>
    </header>
  )
}
