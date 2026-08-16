import type { Connect, Plugin } from 'vite'
import { SYSTEM_PROMPT } from './prompts/system-prompt'
import { readBody, sendJson } from './lib/http'
import { chatCompletion, resolveLlmConfig, type ChatMessage } from './lib/llm'
import { fetchPageText } from './lib/url-fetch'

// 兼容任意 OpenAI 格式的 API（DeepSeek / Moonshot 等），通过 .env 配置：
//   LLM_API_KEY   —— API Key（兼容旧变量名 MOONSHOT_API_KEY）
//   LLM_BASE_URL  —— 如 https://api.deepseek.com/v1 或 https://api.moonshot.cn/v1
//   LLM_MODEL     —— 如 deepseek-chat 或 kimi-k2-0905-preview

export function travelApiPlugin(env: Record<string, string>): Plugin {
  const llm = resolveLlmConfig(env)

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url === '/api/config' && req.method === 'GET') {
      sendJson(res, 200, { hasKey: Boolean(llm.key), model: llm.model })
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
