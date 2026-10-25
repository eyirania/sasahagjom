import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getServerUser, logoutServer } from './auth'

export type User = { id: string; email: string; name: string; roles: string[] }

interface IdentityContextValue {
  user: User | null
  ready: boolean
  logout: () => Promise<void>
}

const IdentityContext = createContext<IdentityContextValue | null>(null)

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getServerUser().then((u) => {
      setUser((u as User | null) ?? null)
      setReady(true)
    })
  }, [])

  const logout = async () => {
    await logoutServer()
    setUser(null)
    window.location.href = import.meta.env.BASE_URL
  }

  return (
    <IdentityContext.Provider value={{ user, ready, logout }}>
      {children}
    </IdentityContext.Provider>
  )
}

export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be used within an IdentityProvider')
  return ctx
}
