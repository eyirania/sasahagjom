import { createMiddleware } from '@tanstack/react-start'
import { isAdmin } from '../lib/auth'

async function currentUser() {
  const { getSessionUser } = await import('../server/session.server')
  return getSessionUser()
}

export const identityMiddleware = createMiddleware().server(async ({ next }) => {
  const user = await currentUser()
  return next({ context: { user } })
})

export const requireAuthMiddleware = createMiddleware().server(async ({ next }) => {
  const user = await currentUser()
  if (!user) throw new Error('Authentication required')
  return next({ context: { user } })
})

export const requireAdminMiddleware = createMiddleware().server(async ({ next }) => {
  const user = await currentUser()
  if (!user) throw new Error('Authentication required')
  if (!isAdmin(user)) throw new Error('Admin role required')
  return next({ context: { user } })
})
