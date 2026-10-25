import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

// 사이트가 올라가는 경로. hahyn.com/p/sahak 로 서비스한다.
const BASE_PATH = '/p/sahak'

const config = defineConfig({
  base: `${BASE_PATH}/`,
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart({ router: { basepath: BASE_PATH } }),
    viteReact(),
  ],
})

export default config
