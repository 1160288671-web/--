import type { ApiMessage, ArchiveMeta, MapPoint, ModelReply, PlanRenderResult, TravelArchive } from '@/types'

export async function fetchConfig(): Promise<{ hasKey: boolean; model: string }> {
  const res = await fetch('/api/config')
  return res.json()
}

export async function sendChat(messages: ApiMessage[]): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data.content as string
}

/** 尝试抓取链接正文；失败返回 null */
export async function fetchUrlText(url: string): Promise<string | null> {
  try {
    const res = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json()
    return data.ok ? (data.text as string) : null
  } catch {
    return null
  }
}

/** 方案地图图片地址；服务端代理高德静态图（Key 不下发），v 用于按方案版本刷新 */
export function planMapUrl(points: MapPoint[], version = 1): string {
  return `/api/plan-map?points=${encodeURIComponent(JSON.stringify(points))}&v=${version}`
}

/** 方案 HTML 渲染结果地址（iframe / 下载 / 新窗口） */
export function planHtmlUrl(id: string): string {
  return `/api/plan/${id}.html`
}

export interface RenderPlanPayload {
  id?: string
  destination?: string
  profile: Record<string, string>
  planMarkdown: string
  planVersion: number
  mapPoints: MapPoint[]
  messages: ApiMessage[]
  lastUserMessage?: string
}

/** 让后端生成并保存方案 HTML 档案，返回档案 id 与访问地址 */
export async function renderPlan(payload: RenderPlanPayload): Promise<PlanRenderResult> {
  const res = await fetch('/api/plan/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `方案保存失败（${res.status}）`)
  return data as PlanRenderResult
}

/** 历史方案列表 */
export async function listPlans(): Promise<ArchiveMeta[]> {
  const res = await fetch('/api/plans')
  return res.json()
}

/** 读取单个档案（用于回看 / 继续调整） */
export async function getPlan(id: string): Promise<TravelArchive> {
  const res = await fetch(`/api/plan/${id}`)
  if (!res.ok) throw new Error('方案不存在')
  return res.json()
}

/** 从模型输出中稳健地提取 JSON（容忍 ```json 包裹或前后杂文本） */
export function parseModelReply(content: string): ModelReply {
  const cleaned = content.replace(/```(?:json)?/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        // fall through
      }
    }
    // 模型没按格式输出时，原样展示
    return { reply: content }
  }
}
