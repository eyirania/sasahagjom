import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { completeGoogleLogin } = await import('../server/oauth.server')
        const { linkStudent, createSession, BASE_PATH, publicOrigin } = await import('../server/session.server')
        const home = `${publicOrigin()}${BASE_PATH}/`
        try {
          const profile = await completeGoogleLogin(new URL(request.url))
          await linkStudent(profile)
          await createSession(profile)
          return new Response(null, { status: 302, headers: { location: home } })
        } catch (e) {
          const message = e instanceof Error ? e.message : '로그인에 실패했습니다.'
          return new Response(null, {
            status: 302,
            headers: { location: `${home}login?error=${encodeURIComponent(message)}` },
          })
        }
      },
    },
  },
})
