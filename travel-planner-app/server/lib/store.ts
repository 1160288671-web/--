import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { MapPointInput } from './amap'

/** 一次行程调整记录（如买票后按到达时间修改第一天） */
export interface Adjustment {
  at: string
  note: string
  planVersion: number
}

/**
 * 用户旅行档案（存档 schema）
 * 保存到 server/data/plans/{id}.json，供历史回看与「买票后继续调整」。
 */
export interface TravelArchive {
  id: string
  createdAt: string
  updatedAt: string
  destination: string
  /** 需求画像（出发地/时长/预算/同行人…） */
  profile: Record<string, string>
  planMarkdown: string
  planVersion: number
  mapPoints: MapPointInput[]
  /** 生成方案那一刻的完整对话上下文（用于之后继续迭代） */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  adjustments: Adjustment[]
}

export interface ArchiveMeta {
  id: string
  createdAt: string
  destination: string
  planVersion: number
}

let dataRoot = path.resolve(process.cwd(), 'server', 'data', 'plans')

/** 在插件初始化时注入项目根目录，避免依赖 cwd */
export function initStore(root: string) {
  dataRoot = path.join(root, 'server', 'data', 'plans')
}

function ensureDir(): string {
  if (!existsSync(dataRoot)) mkdirSync(dataRoot, { recursive: true })
  return dataRoot
}

export function listArchives(): ArchiveMeta[] {
  const dir = ensureDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  const metas: ArchiveMeta[] = []
  for (const f of files) {
    const a = readArchive(f.replace(/\.json$/, ''))
    if (a) metas.push({ id: a.id, createdAt: a.createdAt, destination: a.destination, planVersion: a.planVersion })
  }
  return metas.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function readArchive(id: string): TravelArchive | null {
  if (!/^[\w-]+$/.test(id)) return null
  const file = path.join(ensureDir(), `${id}.json`)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as TravelArchive
  } catch {
    return null
  }
}

export function writeArchive(a: TravelArchive) {
  writeFileSync(path.join(ensureDir(), `${a.id}.json`), JSON.stringify(a, null, 2), 'utf8')
}

export function writeHtml(id: string, html: string): string {
  const file = path.join(ensureDir(), `${id}.html`)
  writeFileSync(file, html, 'utf8')
  return file
}

export function readHtml(id: string): string | null {
  if (!/^[\w-]+$/.test(id)) return null
  const file = path.join(ensureDir(), `${id}.html`)
  if (!existsSync(file)) return null
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}
