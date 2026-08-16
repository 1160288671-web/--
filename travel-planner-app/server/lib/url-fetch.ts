/** 粗略从 HTML 中提取正文文本 */
export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface FetchPageResult {
  ok: boolean
  text?: string
  reason?: string
}

/** 抓取网页正文并提取为纯文本（截断到 3000 字）；登录墙或异常时返回 ok:false */
export async function fetchPageText(url: string): Promise<FetchPageResult> {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })
    const html = await r.text()
    const text = extractText(html).slice(0, 3000)
    if (text.length < 50) {
      return { ok: false, reason: '抓到的内容太少，可能有登录墙' }
    }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
