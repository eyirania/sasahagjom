import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getSettings, oauthLogin } from '@netlify/identity'
import { useIdentity } from '../lib/identity-context'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { user, ready } = useIdentity()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [loginUrl, setLoginUrl] = useState('/login')

  useEffect(() => {
    setLoginUrl(new URL('/login', window.location.origin).href)
  }, [])

  useEffect(() => {
    if (ready && user) void navigate({ to: '/' })
  }, [ready, user, navigate])

  async function handleLogin() {
    setError('')
    setPending(true)
    try {
      const settings = await getSettings()
      if (!settings.providers.google) {
        setError('이 사이트에서 Google 로그인이 활성화되지 않았습니다. 사이트 관리자에게 문의하세요.')
        setPending(false)
        return
      }
      oauthLogin('google')
    } catch (err) {
      // The SDK throws after assigning the OAuth redirect URL.
      if (err instanceof Error && err.message === 'Redirecting to OAuth provider') return
      setError('Google 로그인을 시작하지 못했습니다. 아래 링크로 새 탭에서 열어 다시 시도하세요.')
      setPending(false)
    }
  }

  if (ready && user) {
    return null
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-xl shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">로그인</h1>
        <p className="text-sm text-gray-500 mb-6">
          학교 이메일(<span className="font-mono">@sasa.hs.kr</span>)로만 로그인할 수 있습니다.
        </p>
        <button
          onClick={handleLogin}
          disabled={!ready || pending}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 font-medium text-gray-700 hover:bg-gray-50"
        >
          {pending ? 'Google로 이동 중…' : 'Google로 로그인'}
        </button>
        {error && <p role="alert" className="text-sm text-red-700 mt-4">{error}</p>}
        <p className="text-sm text-gray-500 mt-4">
          미리보기 안에서 로그인이 막히면{' '}
          <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">현재 사이트를 새 탭에서 열기</a>를 이용하세요.
        </p>
        <p className="text-xs text-gray-400 mt-4">
          @sasa.hs.kr 이외의 이메일로 로그인하면 접근이 거부됩니다.
        </p>
      </div>
    </div>
  )
}
