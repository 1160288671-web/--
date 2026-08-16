export interface LlmConfig {
  key: string
  model: string
  baseUrl: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatResult =
  | { ok: true; content: string }
  | { ok: false; status: number; message: string }

/** 从 .env 注入的变量 + 进程环境变量解析出 LLM 配置（兼容旧变量名 MOONSHOT_*） */
export function resolveLlmConfig(env: Record<string, string>): LlmConfig {
  return {
    key: env.LLM_API_KEY || env.MOONSHOT_API_KEY || process.env.LLM_API_KEY || process.env.MOONSHOT_API_KEY || '',
    model: env.LLM_MODEL || env.MOONSHOT_MODEL || process.env.LLM_MODEL || 'kimi-k2-0905-preview',
    baseUrl: (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, ''),
  }
}

/** 调用任意 OpenAI 兼容的 /chat/completions 接口，返回首个 choice 的文本内容 */
export async function chatCompletion(cfg: LlmConfig, messages: ChatMessage[]): Promise<ChatResult> {
  try {
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }),
    })
    if (!upstream.ok) {
      const text = await upstream.text()
      return { ok: false, status: upstream.status, message: `模型 API 调用失败（${upstream.status}）：${text.slice(0, 300)}` }
    }
    const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] }
    return { ok: true, content: data.choices?.[0]?.message?.content ?? '' }
  } catch (e) {
    return { ok: false, status: 500, message: `服务异常：${e instanceof Error ? e.message : String(e)}` }
  }
}
