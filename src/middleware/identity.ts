import { createMiddleware } from '@tanstack/react-start'
import { getUser, type User } from '@netlify/identity'
import { isAdmin } from '../lib/auth'

export const identityMiddleware = createMiddleware().server(async ({ next }) => {
  const user: User | null = (await getUser()) ?? null
  return next({ context: { user } })
})

export const requireAuthMiddleware = createMiddleware().server(async ({ next }) => {
  const user = await getUser()
  if (!user) throw new Error('Authentication required')
  return next({ context: { user } })
})

export const requireAdminMiddleware = createMiddleware().server(async ({ next }) => {
  const user = await getUser()
  if (!user) throw new Error('Authentication required')
  if (!isAdmin(user)) throw new Error('Admin role required')
  return next({ context: { user } })
})
