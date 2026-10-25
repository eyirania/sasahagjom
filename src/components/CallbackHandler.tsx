import { useEffect, useState } from 'react'
import { handleAuthCallback } from '@netlify/identity'

const AUTH_HASH_PATTERN =
  /^#(confirmation_token|recovery_token|invite_token|email_change_token|access_token)=/

export function CallbackHandler({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.hash.slice(1)).has('error')) {
      setError(true)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } else if (AUTH_HASH_PATTERN.test(window.location.hash)) {
      handleAuthCallback().catch(() => setError(true))
    }
  }, [])

  return <>{error && <div role="alert" className="bg-red-50 text-red-800 p-4 text-sm">
    Google 로그인을 완료하지 못했습니다. 사이트를 새 탭에서 열고 학교 계정으로 다시 로그인하세요.
    {' '}<a href="/login" className="underline">로그인으로 이동</a>
  </div>}{children}</>
}
