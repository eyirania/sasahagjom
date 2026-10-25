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
    <section className="grid grid-cols-1 lg:grid-cols-12 border-b-4 border-black">
      <div className="lg:col-span-8 px-5 lg:px-10 py-12 lg:py-20 lg:border-r-4 border-black">
        <h1 className="sw-display text-[clamp(56px,10vw,148px)] lg:ml-[max(0px,calc((100vw-80rem)/2))]">로그인</h1>
      </div>
      <div className="lg:col-span-4 plane-red px-5 lg:px-10 py-12 lg:py-20 flex flex-col justify-center gap-5">
        <p className="text-[17px] font-semibold">
          학교 이메일(<span className="font-mono">@sasa.hs.kr</span>)로만 로그인할 수 있습니다.
        </p>
        {error && <p role="alert" className="bg-white border-[3px] border-black px-3 py-2 text-[15px] font-bold !text-[#cc0000]">{error}</p>}
        <button
          onClick={() => { window.location.href = `${import.meta.env.BASE_URL}auth/google` }}
          className="hard-shadow plane-blue border-4 border-black px-6 py-4 font-extrabold text-lg hover:!bg-white hover:!text-black"
        >
          Google로 로그인 →
        </button>
        <p className="text-sm font-medium">@sasa.hs.kr 이외의 이메일로 로그인하면 접근이 거부됩니다.</p>
      </div>
    </section>
  )
}
