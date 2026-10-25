import { createServerFn } from '@tanstack/react-start'
import { getUser } from '@netlify/identity'

export const ADMIN_EMAIL = 'eyirania@sasa.hs.kr'
export const ALLOWED_EMAIL_DOMAIN = 'sasa.hs.kr'

export const getServerUser = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getUser()
  return (user ?? null) as any
})

export function isAdmin(user: { email?: string; roles?: string[] } | null | undefined) {
  if (!user) return false
  return (
    user.email?.toLowerCase() === ADMIN_EMAIL ||
    (user.roles ?? []).includes('admin')
  )
}
