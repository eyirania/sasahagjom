import type { Handler, HandlerEvent } from '@netlify/functions'

const ADMIN_EMAIL = 'eyirania@sasa.hs.kr'
const ALLOWED_DOMAIN = '@sasa.hs.kr'

const handler: Handler = async (event: HandlerEvent) => {
  const payload = JSON.parse(event.body || '{}')
  const email: string = (payload.user?.email || '').toLowerCase()

  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: `Only ${ALLOWED_DOMAIN} school email addresses may register.`,
      }),
    }
  }

  const roles = email === ADMIN_EMAIL ? ['admin'] : ['student']

  return {
    statusCode: 200,
    body: JSON.stringify({
      app_metadata: { roles },
    }),
  }
}

export { handler }
