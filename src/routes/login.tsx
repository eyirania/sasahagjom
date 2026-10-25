import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useIdentity } from '../lib/identity-context'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { user, ready } = useIdentity()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(new URLSearchParams(window.location.search).get('error'))
  }, [])

  if (ready && user) {
    navigate({ to: '/' })
    return null
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-xl shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">로그인</h1>
        <p className="text-sm text-gray-500 mb-6">
          학교 이메일(<span className="font-mono">@sasa.hs.kr</span>)로만 로그인할 수 있습니다.
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button
          onClick={() => { window.location.href = `${import.meta.env.BASE_URL}auth/google` }}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 font-medium text-gray-700 hover:bg-gray-50"
        >
          Google로 로그인
        </button>
        <p className="text-xs text-gray-400 mt-4">
          @sasa.hs.kr 이외의 이메일로 로그인하면 접근이 거부됩니다.
        </p>
      </div>
    </div>
  )
}
