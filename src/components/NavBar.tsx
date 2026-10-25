import { Link } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'
import { isAdmin } from '../lib/auth'

export function NavBar() {
  const { user, ready, logout } = useIdentity()
  const admin = isAdmin(user as any)

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-gray-900">
            세종과학예술영재학교 학점 관리
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-sm text-gray-600">
            <Link to="/subjects" className="hover:text-gray-900">
              평가 배점표
            </Link>
            {ready && user && (
              <Link to="/grades" className="hover:text-gray-900">
                내 성적 입력
              </Link>
            )}
            {admin && (
              <Link to="/admin" className="hover:text-gray-900 font-medium text-blue-600">
                관리자 통계
              </Link>
            )}
          </nav>
        </div>
        <div className="text-sm">
          {!ready ? null : user ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-500">{user.email}</span>
              <button
                onClick={() => logout()}
                className="text-gray-500 hover:text-gray-900"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <Link to="/login" className="text-blue-600 font-medium">
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
