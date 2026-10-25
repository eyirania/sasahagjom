import { createHash, randomBytes } from 'node:crypto'
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'
import { ALLOWED_EMAIL_DOMAIN } from '../lib/auth'
import { BASE_PATH, publicOrigin } from './session.server'

const TX_COOKIE = 'sasa_oauth'

export const redirectUri = () => `${publicOrigin()}${BASE_PATH}/auth/callback`

function env(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const txCookie = (maxAge: number) => ({
  httpOnly: true,
  secure: publicOrigin().startsWith('https://'),
  sameSite: 'lax' as const,
  path: BASE_PATH || '/',
  maxAge,
})

/** Google 로그인 시작: state와 PKCE verifier를 쿠키에 두고 Google 주소를 돌려준다. */
export function buildGoogleAuthUrl() {
  const state = randomBytes(16).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  setCookie(TX_COOKIE, `${state}.${verifier}`, txCookie(600))

  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    hd: ALLOWED_EMAIL_DOMAIN, // 학교 계정 선택 화면 힌트일 뿐이고, 실제 검사는 아래 이메일 검사가 한다
    prompt: 'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/** 콜백 처리: state 검증 → 코드 교환 → 프로필 조회. 실패하면 Error를 던진다. */
export async function completeGoogleLogin(url: URL) {
  const tx = getCookie(TX_COOKIE)
  deleteCookie(TX_COOKIE, { path: BASE_PATH || '/' })
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!tx || !code || !state) throw new Error('로그인 요청이 올바르지 않습니다.')
  const [savedState, verifier] = tx.split('.')
  if (!savedState || !verifier || savedState !== state) throw new Error('로그인 요청이 올바르지 않습니다.')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  if (!tokenRes.ok) throw new Error('Google 인증에 실패했습니다.')
  const { access_token } = (await tokenRes.json()) as { access_token?: string }
  if (!access_token) throw new Error('Google 인증에 실패했습니다.')

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!infoRes.ok) throw new Error('Google 계정 정보를 가져오지 못했습니다.')
  const info = (await infoRes.json()) as {
    sub?: string
    email?: string
    email_verified?: boolean
    name?: string
  }
  if (!info.sub || !info.email) throw new Error('Google 계정 정보가 올바르지 않습니다.')
  if (!info.email_verified) throw new Error('확인되지 않은 이메일입니다.')
  if (!info.email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new Error(`@${ALLOWED_EMAIL_DOMAIN} 학교 계정으로만 로그인할 수 있습니다.`)
  }
  return { sub: info.sub, email: info.email.toLowerCase(), name: info.name ?? info.email }
}
