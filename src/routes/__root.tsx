import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import '../styles.css'
import { IdentityProvider } from '../lib/identity-context'
import { NavBar } from '../components/NavBar'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '세종과학예술영재학교 학점 관리' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body>
        <IdentityProvider>
          <NavBar />
          {children}
        </IdentityProvider>
        <Scripts />
      </body>
    </html>
  )
}
