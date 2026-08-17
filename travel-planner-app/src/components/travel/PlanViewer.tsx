import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface PlanViewerProps {
  htmlUrl: string | null
  destination?: string
  planVersion?: number
  onClose: () => void
}

/** 全屏方案查看器：iframe 展示后端生成的 HTML 方案，支持下载 / 新窗口打开 */
export default function PlanViewer({ htmlUrl, destination, planVersion, onClose }: PlanViewerProps) {
  useEffect(() => {
    if (!htmlUrl) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [htmlUrl, onClose])

  if (!htmlUrl) return null

  const title = destination || '我的旅行'
  const filename = `${title}-旅行方案.html`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2.5 text-white">
        <div className="min-w-0 truncate text-sm font-semibold">
          🗺️ {title}定制方案{planVersion ? ` · v${planVersion}` : ''}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={htmlUrl}
            download={filename}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 transition-colors"
          >
            ⬇ 下载 HTML
          </a>
          <a
            href={htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 transition-colors"
          >
            ↗ 新窗口
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            ✕ 关闭
          </Button>
        </div>
      </div>
      <iframe src={htmlUrl} title="定制旅行方案" className="min-h-0 w-full flex-1 border-0" />
    </div>
  )
}
