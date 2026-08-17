export interface MapPoint {
  /** 标准地名，如"厦门大学" */
  name: string
  /** 所属城市，如"厦门"（地理编码必需） */
  city: string
  /** 行程第几天（1 起） */
  day: number
  /** 当天顺序（1 起） */
  seq: number
}

export interface ModelReply {
  reply: string
  options?: string[]
  round?: number
  profile?: Record<string, string>
  ready_for_plan?: boolean
  plan?: string
  plan_version?: number
  /** 方案目的地简短名称（生成/迭代方案时输出，用于封面标题） */
  destination?: string
  /** 方案地图点位（生成/迭代方案时输出，最多 10 个） */
  map_points?: MapPoint[]
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  /** 展示文本 */
  text: string
  /** 发送给 API 的原始内容（assistant 为模型原始输出） */
  raw: string
  options?: string[]
  round?: number
}

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 一次行程调整记录（如买票后按到达时间改行程） */
export interface Adjustment {
  at: string
  note: string
  planVersion: number
}

/** 历史方案列表条目 */
export interface ArchiveMeta {
  id: string
  createdAt: string
  destination: string
  planVersion: number
}

/** 用户旅行档案（存档） */
export interface TravelArchive {
  id: string
  createdAt: string
  updatedAt: string
  destination: string
  profile: Record<string, string>
  planMarkdown: string
  planVersion: number
  mapPoints: MapPoint[]
  messages: ApiMessage[]
  adjustments: Adjustment[]
}

/** 方案 HTML 渲染结果 */
export interface PlanRenderResult {
  id: string
  planVersion: number
  updatedAt: string
  htmlUrl: string
}

export const ROUND_LABELS = ['快速定位', '骨架信息', '动机与偏好', '细节与底线'] as const

export const PROFILE_KEYS = [
  '出发地',
  '可接受邻近机场',
  '出行时间',
  '具体日期',
  '日期弹性',
  '时长',
  '预算',
  '预算结构',
  '同行人',
  '目的地意向',
  '旅行动机',
  '参照样本',
  '玩法倾向',
  '美食游玩导向',
  '必体验清单',
  '出片意愿',
  '餐饮要求',
  '住宿要求',
  '交通偏好',
  '节奏偏好',
  '雷区底线',
  '证件健康',
  '其他',
] as const

/** 地图按天取色的调色板（十六进制，不含 # 前缀；与 server/lib/amap.ts 保持一致） */
export const DAY_COLORS = [
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
] as const
