import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/google')({
  server: {
    handlers: {
      GET: async () => {
        const { buildGoogleAuthUrl } = await import('../server/oauth.server')
        return new Response(null, { status: 302, headers: { location: buildGoogleAuthUrl() } })
      },
    },
  },
})
