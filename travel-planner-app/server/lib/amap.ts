import { createHash } from 'crypto'

/** 高德地图服务端封装：地理编码 + 静态图（点位标注）。Key 与密钥只在服务端使用，绝不下发前端。 */

export interface MapPointInput {
  name: string
  city: string
  day: number
  seq: number
}

/** 按天取色（十六进制，不含 # 前缀；与 src/types/index.ts 的 DAY_COLORS 保持一致） */
const DAY_COLORS = [
  'E74C3C',
  '3498DB',
  '2ECC71',
  'F39C12',
  '9B59B6',
  '1ABC9C',
  'E67E22',
  '34495E',
  'E91E63',
  '7F8C8D',
]

/**
 * 生成高德 Web 服务数字签名：
 * sig = MD5( 请求参数（含 key）按参数名升序拼成 "k=v&k=v..."，再直接拼接私钥 )
 * 注意：签名用的是原始值（非 URL 编码），且必须为 utf-8。
 */
function sign(params: Record<string, string>, secret: string): string {
  const raw = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('md5').update(raw + secret, 'utf8').digest('hex')
}

/** 组装高德 Web 服务请求 URL：值做 urlencode；仅在提供密钥时追加 sig（对应控制台开启了数字签名） */
function buildUrl(path: string, params: Record<string, string>, secret?: string): string {
  const qs = Object.keys(params)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join('&')
  const sig = secret ? `&sig=${sign(params, secret)}` : ''
  return `https://restapi.amap.com${path}?${qs}${sig}`
}

/* ------------------------------ 请求限流 ------------------------------ */
// 高德 Web 服务（个人 key）有 QPS 上限（约 3 次/秒），且静态地图对并发更敏感。
// 一次性并发发起多天地图请求会触发 CUQPS_HAS_EXCEEDED_THE_LIMIT（10021）。
// 因此这里把所有请求串行化，并在每次请求间保持最小间隔。

const MIN_INTERVAL_MS = 400
let chain: Promise<unknown> = Promise.resolve()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 串行化请求并保持最小间隔，避免并发触发高德 QPS 限流 */
function throttle<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    await sleep(MIN_INTERVAL_MS)
    return task()
  })
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/* ------------------------------ 地理编码 ------------------------------ */

const geocodeCache = new Map<string, string>()

async function geocodeOnce(key: string, secret: string | undefined, name: string, city: string): Promise<string | null> {
  const url = buildUrl('/v3/geocode/geo', { key, address: name, city }, secret)
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) return null
  const data = (await r.json()) as { status?: string; geocodes?: { location?: string }[] }
  if (data.status !== '1') return null
  return data.geocodes?.[0]?.location || null
}

/** 单个地名 → 高德坐标（"经度,纬度"），带缓存 + 限流 + 重试；失败返回 null */
async function geocode(key: string, secret: string | undefined, name: string, city: string): Promise<string | null> {
  const cacheKey = `${city}\u0000${name}`
  const cached = geocodeCache.get(cacheKey)
  if (cached) return cached

  const loc = await throttle(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await geocodeOnce(key, secret, name, city)
      if (result) return result
      await sleep(400 * (attempt + 1))
    }
    return null
  })

  if (loc) geocodeCache.set(cacheKey, loc)
  return loc
}

/** 把 day 映射为标注文字（高德标注 label 仅支持 [0-9]/[A-Z]/单个中文） */
function dayLabel(day: number): string {
  return day <= 9 ? String(day) : String.fromCharCode(64 + (day - 9))
}

/* ------------------------------ 静态图 ------------------------------ */

/** 单次静态图请求的尺寸与样式选项 */
export interface PlanMapOptions {
  /** 图片尺寸 "宽*高"，默认 750*500；多点全景建议 1024*560 */
  size?: string
}

/** 高德 label 最大 15 字符 */
function clipLabel(s: string): string {
  return s.slice(0, 15)
}

async function staticMapOnce(secret: string | undefined, params: Record<string, string>): Promise<Buffer | null> {
  const url = buildUrl('/v3/staticmap', params, secret)
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!r.ok) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (!buf.length) return null
  // 高德限流/出错时返回 JSON 错误体（'{' = 0x7b），成功返回 PNG（0x89 开头）
  if (buf[0] === 0x7b) return null
  return buf
}

async function staticMap(secret: string | undefined, params: Record<string, string>): Promise<Buffer | null> {
  return throttle(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const buf = await staticMapOnce(secret, params)
      if (buf) return buf
      await sleep(500 * (attempt + 1))
    }
    return null
  })
}

/**
 * 根据点位列表生成静态地图图片字节。
 * 策略（点位标注为主，最多 10 个点）：
 * - 标记用 large 尺寸 + 按天配色 + 天编号（比默认 small 更大更清晰）；
 * - 额外叠加 labels 文本标签显示地名，便于多点全景时辨认；
 * - 不指定 location/zoom，高德会自动按所有标注取中心与缩放级别。
 * 无 Key / 全部定位失败 / 上游异常时返回 null，由调用方静默降级。
 */
export async function fetchPlanMap(
  key: string,
  secret: string | undefined,
  points: MapPointInput[],
  options?: PlanMapOptions,
): Promise<Buffer | null> {
  if (!key || !points?.length) return null

  const items = points.slice(0, 10).sort((a, b) => a.seq - b.seq)
  const located: Array<{ name: string; day: number; loc: string }> = []
  for (const p of items) {
    const loc = await geocode(key, secret, p.name, p.city)
    if (loc) located.push({ name: p.name, day: p.day, loc })
  }
  if (located.length === 0) return null

  // 标记：按天分组，large 尺寸 + 天编号（跨天区分）
  const byDay = new Map<number, string[]>()
  for (const it of located) {
    const locs = byDay.get(it.day)
    if (locs) locs.push(it.loc)
    else byDay.set(it.day, [it.loc])
  }
  const markerGroups: string[] = []
  for (const [day, locs] of byDay) {
    const color = DAY_COLORS[(day - 1) % DAY_COLORS.length]
    markerGroups.push(`large,0x${color},${dayLabel(day)}:${locs.join(';')}`)
  }

  // 文本标签：每个点显示地名（白底黑字加粗，更清晰）
  const labelGroups = located.map(
    (it) => `${clipLabel(it.name)},0,1,14,0x000000,0xFFFFFF:${it.loc}`,
  )

  const params: Record<string, string> = {
    key,
    size: options?.size || '750*500',
    scale: '2',
    markers: markerGroups.join('|'),
  }
  if (labelGroups.length) params.labels = labelGroups.join('|')

  return staticMap(secret, params)
}

/**
 * 生成单个城市/目的地的概览地图（用于某天无具体点位时的兜底，
 * 或封面无点位时展示目的地全景）。
 */
export async function fetchCityMap(
  key: string,
  secret: string | undefined,
  name: string,
  city?: string,
): Promise<Buffer | null> {
  if (!key || !name) return null
  const loc = await geocode(key, secret, name, city || '')
  if (!loc) return null

  const label = clipLabel(name)
  return staticMap(secret, {
    key,
    size: '750*500',
    scale: '2',
    location: loc,
    zoom: '10',
    markers: `large,0xE74C3C,${label.slice(0, 1).toUpperCase()}:${loc}`,
    labels: `${label},0,1,16,0x000000,0xFFFFFF:${loc}`,
  })
}
