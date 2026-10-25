import { createServerFn } from '@tanstack/react-start'

export const ADMIN_EMAIL = 'eyirania@sasa.hs.kr'
export const ALLOWED_EMAIL_DOMAIN = 'sasa.hs.kr'

export const getServerUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { getSessionUser } = await import('../server/session.server')
  return (await getSessionUser()) as any
})

export const logoutServer = createServerFn({ method: 'POST' }).handler(async () => {
  const { destroySession } = await import('../server/session.server')
  await destroySession()
  return null
})

export function isAdmin(user: { email?: string; roles?: string[] } | null | undefined) {
  if (!user) return false
  return (
    user.email?.toLowerCase() === ADMIN_EMAIL ||
    (user.roles ?? []).includes('admin')
  )
}
