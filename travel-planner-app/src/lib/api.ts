import type { ApiMessage, ModelReply } from '@/types'

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
