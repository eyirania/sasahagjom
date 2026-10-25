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
    <div className="max-w-7xl mx-auto px-5 lg:px-10">
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-8 py-12 lg:py-20 border-b-2 border-black">
        <div className="lg:col-span-9">
          <h1 className="sw-display text-[clamp(52px,10vw,148px)]">로그인</h1>
        </div>
        <div className="lg:col-span-3 flex flex-col justify-end gap-4">
          <p className="text-[17px]">
            학교 이메일(<span className="font-mono">@sasa.hs.kr</span>)로만 로그인할 수 있습니다.
          </p>
          {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
          <button
            onClick={() => { window.location.href = `${import.meta.env.BASE_URL}auth/google` }}
            className="w-full bg-black text-white font-bold px-5 py-3 border-2 border-black hover:!bg-white hover:!text-black"
          >
            Google로 로그인
          </button>
          <p className="text-xs text-gray-500">@sasa.hs.kr 이외의 이메일로 로그인하면 접근이 거부됩니다.</p>
        </div>
      </section>
    </div>
  )
}
