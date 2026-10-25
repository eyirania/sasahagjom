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
    <div className="max-w-[1280px] mx-auto px-5 lg:px-10">
      <section className="pt-20 pb-24 lg:pt-32 grid lg:grid-cols-12 gap-10">
        <h1 className="sw-display text-[clamp(56px,9vw,128px)] lg:col-span-7">로그인</h1>
        <div className="lg:col-span-5 card p-9 self-end space-y-5">
          <p className="text-[18px] leading-snug">
            학교 이메일(<span className="font-mono">@sasa.hs.kr</span>)로만 로그인할 수 있습니다.
          </p>
          {error && <p role="alert" className="rounded-xl bg-[#fff0ea] px-4 py-3 text-[15px] text-[#c23000]">{error}</p>}
          <button
            onClick={() => { window.location.href = `${import.meta.env.BASE_URL}auth/google` }}
            className="btn-primary w-full"
          >
            Google로 로그인
          </button>
          <p className="text-sm text-gray-500">@sasa.hs.kr 이외의 이메일로 로그인하면 접근이 거부됩니다.</p>
        </div>
      </section>
    </div>
  )
}
