// 맥미니에서 돌리는 프로덕션 서버. `pnpm build` 후 `node server.mjs`로 실행한다.
// 정적 파일(dist/client)은 직접 내보내고, 나머지는 TanStack Start 핸들러가 처리한다.
import { serve } from 'srvx'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import app from './dist/server/server.js'

const BASE_PATH = '/p/sahak' // vite.config.ts의 BASE_PATH와 같아야 한다
const CLIENT_DIR = fileURLToPath(new URL('./dist/client/', import.meta.url))
const PORT = Number(process.env.PORT ?? 5000)

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.map': 'application/json',
}

async function serveStatic(pathname) {
  if (!pathname.startsWith(`${BASE_PATH}/`)) return null
  const rel = decodeURIComponent(pathname.slice(BASE_PATH.length + 1))
  if (!rel) return null
  const file = normalize(join(CLIENT_DIR, rel))
  if (!file.startsWith(CLIENT_DIR.endsWith(sep) ? CLIENT_DIR : CLIENT_DIR + sep)) return null
  try {
    if (!(await stat(file)).isFile()) return null
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }
    // 해시가 붙은 assets 파일은 오래 캐시해도 된다
    headers['cache-control'] = rel.startsWith('assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600'
    return new Response(await readFile(file), { headers })
  } catch {
    return null
  }
}

serve({
  port: PORT,
  hostname: '127.0.0.1', // 외부에서 직접 못 들어오게 하고 Caddy/터널로만 받는다
  async fetch(request) {
    const { pathname } = new URL(request.url)
    return (await serveStatic(pathname)) ?? app.fetch(request)
  },
})
console.log(`sasahagjom listening on 127.0.0.1:${PORT}${BASE_PATH}/`)
