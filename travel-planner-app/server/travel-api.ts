import { randomUUID } from 'node:crypto'
import type { Connect, Plugin } from 'vite'
import { SYSTEM_PROMPT } from './prompts/system-prompt'
import { readBody, sendJson } from './lib/http'
import { chatCompletion, resolveLlmConfig, type ChatMessage } from './lib/llm'
import { fetchPageText } from './lib/url-fetch'
import { fetchPlanMap, type MapPointInput } from './lib/amap'
import { buildPlanHtml } from './lib/render-plan'
import { initStore, listArchives, readArchive, readHtml, writeArchive, writeHtml } from './lib/store'

// 兼容任意 OpenAI 格式的 API（DeepSeek / Moonshot 等），通过 .env 配置：
//   LLM_API_KEY   —— API Key（兼容旧变量名 MOONSHOT_API_KEY）
//   LLM_BASE_URL  —— 如 https://api.deepseek.com/v1 或 https://api.moonshot.cn/v1
//   LLM_MODEL     —— 如 deepseek-chat 或 kimi-k2-0905-preview

export function travelApiPlugin(env: Record<string, string>, root: string): Plugin {
  const llm = resolveLlmConfig(env)
  initStore(root)

  const amapKey = () => env.AMAP_KEY || process.env.AMAP_KEY || ''
  const amapSecret = () => env.AMAP_SECRET || process.env.AMAP_SECRET || ''

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url === '/api/config' && req.method === 'GET') {
      sendJson(res, 200, { hasKey: Boolean(llm.key), model: llm.model })
      return
    }

    // 方案地图：服务端用高德地理编码 + 静态图生成 PNG 并代理返回（Key/密钥不下发前端）
    if (req.url?.startsWith('/api/plan-map') && req.method === 'GET') {
      let points: MapPointInput[] = []
      try {
        const q = new URL(req.url, 'http://localhost').searchParams.get('points') || '[]'
        points = JSON.parse(q)
      } catch {
        points = []
      }
      if (!amapKey() || !Array.isArray(points) || points.length === 0) {
        res.statusCode = 404
        res.end()
        return
      }
      const img = await fetchPlanMap(amapKey(), amapSecret() || undefined, points)
      if (!img) {
        res.statusCode = 404
        res.end()
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'no-store')
      res.end(img)
      return
    }

    // 抓取用户粘贴的链接正文（小红书等登录墙站点会失败，前端需优雅降级）
    if (req.url === '/api/fetch-url' && req.method === 'POST') {
      const { url } = JSON.parse(await readBody(req))
      if (!/^https?:\/\//.test(url || '')) {
        sendJson(res, 400, { error: '无效链接' })
        return
      }
      sendJson(res, 200, await fetchPageText(url))
      return
    }

    // 生成并保存方案 HTML（存档）
    if (req.url === '/api/plan/render' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req)) as {
          id?: string
          destination?: string
          profile?: Record<string, string>
          planMarkdown?: string
          planVersion?: number
          mapPoints?: MapPointInput[]
          messages?: Array<{ role: 'user' | 'assistant'; content: string }>
          lastUserMessage?: string
        }

        const existing = body.id ? readArchive(body.id) : null
        const id = existing?.id || randomUUID()
        const planVersion = body.planVersion || existing?.planVersion || 1
        const now = new Date().toISOString()

        const html = await buildPlanHtml({
          key: amapKey(),
          secret: amapSecret() || undefined,
          destination: body.destination || '我的旅行',
          profile: body.profile || {},
          planMarkdown: body.planMarkdown || '',
          mapPoints: Array.isArray(body.mapPoints) ? body.mapPoints : [],
        })
        writeHtml(id, html)

        const adjustments = existing?.adjustments || []
        if (existing && planVersion > existing.planVersion && body.lastUserMessage) {
          adjustments.push({ at: now, note: body.lastUserMessage, planVersion })
        }

        writeArchive({
          id,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          destination: body.destination || existing?.destination || '我的旅行',
          profile: body.profile || existing?.profile || {},
          planMarkdown: body.planMarkdown || existing?.planMarkdown || '',
          planVersion,
          mapPoints: Array.isArray(body.mapPoints) ? body.mapPoints : existing?.mapPoints || [],
          messages: body.messages || existing?.messages || [],
          adjustments,
        })

        sendJson(res, 200, {
          id,
          planVersion,
          updatedAt: now,
          htmlUrl: `/api/plan/${id}.html`,
        })
      } catch (e) {
        sendJson(res, 500, { error: `方案保存失败：${e instanceof Error ? e.message : String(e)}` })
      }
      return
    }

    // 历史方案列表
    if (req.url === '/api/plans' && req.method === 'GET') {
      sendJson(res, 200, listArchives())
      return
    }

    // 读取方案 HTML（供 iframe / 下载 / 新窗口打开）
    const htmlMatch = req.url?.match(/^\/api\/plan\/([\w-]+)\.html$/)
    if (htmlMatch && req.method === 'GET') {
      const html = readHtml(htmlMatch[1])
      if (!html) {
        res.statusCode = 404
        res.end()
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(html)
      return
    }

    // 读取单个档案（用于历史回看 / 继续调整）
    const planMatch = req.url?.match(/^\/api\/plan\/([\w-]+)$/)
    if (planMatch && req.method === 'GET') {
      const archive = readArchive(planMatch[1])
      if (!archive) {
        res.statusCode = 404
        res.end()
        return
      }
      sendJson(res, 200, archive)
      return
    }

    if (req.url === '/api/chat' && req.method === 'POST') {
      if (!llm.key) {
        sendJson(res, 500, {
          error: '尚未配置 API Key。请在项目根目录创建 .env 文件（可参考 .env.example），然后重启 npm run dev。',
        })
        return
      }
      const body = JSON.parse(await readBody(req))
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(body.messages || []),
      ]
      const result = await chatCompletion(llm, messages)
      if (result.ok) {
        sendJson(res, 200, { content: result.content })
      } else {
        sendJson(res, result.status, { error: result.message })
      }
      return
    }

    next()
  }

  return {
    name: 'travel-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
