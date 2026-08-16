import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { travelApiPlugin } from './server/travel-api'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
    base: './',
    plugins: [inspectAttr(), react(), travelApiPlugin(env)],
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
});
