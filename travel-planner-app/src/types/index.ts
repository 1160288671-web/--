export interface ModelReply {
  reply: string
  options?: string[]
  round?: number
  profile?: Record<string, string>
  ready_for_plan?: boolean
  plan?: string
  plan_version?: number
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
