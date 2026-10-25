import { Link } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'
import { isAdmin } from '../lib/auth'

const linkClass = 'px-3 py-2 hover:bg-black hover:text-white'
const activeProps = { className: 'bg-black text-white' }

export function NavBar() {
  const { user, ready, logout } = useIdentity()
  const admin = isAdmin(user as any)

  return (
    <header className="bg-white border-b-2 border-black sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-5 lg:px-10 min-h-14 flex flex-wrap items-center justify-between gap-x-6">
        <div className="flex flex-wrap items-center gap-x-6">
          <Link to="/" className="font-extrabold tracking-tight text-lg py-3 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 bg-[#c90000]" aria-hidden />
            SASA 학점
          </Link>
          <nav className="flex flex-wrap items-center text-sm font-bold" aria-label="주 메뉴">
            <Link to="/subjects" className={linkClass} activeProps={activeProps}>평가 배점표</Link>
            {ready && user && <Link to="/grades" className={linkClass} activeProps={activeProps}>내 성적 입력</Link>}
            {admin && <Link to="/admin" className={linkClass} activeProps={activeProps}>관리자 통계</Link>}
          </nav>
        </div>
        <div className="text-sm py-2">
          {!ready ? null : user ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500 hidden sm:inline">{user.email}</span>
              <button onClick={() => logout()} className="plain font-bold px-3 py-2 border-2 border-black hover:bg-black hover:text-white">
                로그아웃
              </button>
            </div>
          ) : (
            <Link to="/login" className="font-bold px-3 py-2 border-2 border-black hover:bg-black hover:text-white">로그인</Link>
          )}
        </div>
      </div>
    </header>
  )
}
