import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'
import { db } from '../../db/index.js'
import { sessions, students } from '../../db/schema.js'
import { ADMIN_EMAIL, ALLOWED_EMAIL_DOMAIN } from '../lib/auth'

export const SESSION_COOKIE = 'sasa_session'
const SESSION_DAYS = 30

// 빌드 때 정해지는 접두어 (예: "/p/sahak"). 쿠키 경로로도 쓴다.
export const BASE_PATH = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')

// Caddy/Cloudflare 뒤에서는 요청 URL이 아니라 이 값을 기준으로 주소를 만든다.
export function publicOrigin() {
  const origin = process.env.PUBLIC_ORIGIN
  if (!origin) throw new Error('PUBLIC_ORIGIN is not set')
  return origin.replace(/\/$/, '')
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: publicOrigin().startsWith('https://'),
    sameSite: 'lax' as const,
    path: BASE_PATH || '/',
    maxAge: maxAgeSeconds,
  }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export type SessionUser = { id: string; email: string; name: string; roles: string[] }

export function isAllowedEmail(email: string) {
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}

/** Google 계정(sub)과 학생 레코드를 연결한다. 기존 Netlify 시절 레코드는 이메일로 찾아 sub를 붙인다. */
export async function linkStudent(profile: { sub: string; email: string; name: string }) {
  const email = profile.email.toLowerCase()
  const bySub = await db.select().from(students).where(eq(students.identityUserId, profile.sub)).limit(1)
  if (bySub[0]) return bySub[0]

  const byEmail = await db.select().from(students).where(eq(students.email, email)).limit(1)
  if (byEmail[0]) {
    const [updated] = await db
      .update(students)
      .set({ identityUserId: profile.sub })
      .where(eq(students.id, byEmail[0].id))
      .returning()
    return updated
  }

  const [created] = await db
    .insert(students)
    .values({ identityUserId: profile.sub, email, name: profile.name || email })
    .returning()
  return created
}

export async function createSession(profile: { sub: string; email: string; name: string }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({
    id: hash(token),
    sub: profile.sub,
    email: profile.email.toLowerCase(),
    name: profile.name,
    expiresAt,
  })
  setCookie(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60))
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const [row] = await db.select().from(sessions).where(eq(sessions.id, hash(token))).limit(1)
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.id))
    return null
  }
  const email = row.email.toLowerCase()
  return {
    id: row.sub,
    email,
    name: row.name,
    roles: email === ADMIN_EMAIL ? ['admin'] : ['student'],
  }
}

export async function destroySession() {
  const token = getCookie(SESSION_COOKIE)
  if (token) await db.delete(sessions).where(eq(sessions.id, hash(token)))
  deleteCookie(SESSION_COOKIE, { path: BASE_PATH || '/' })
}
