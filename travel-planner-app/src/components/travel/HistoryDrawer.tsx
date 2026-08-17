import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { listPlans } from '@/lib/api'
import type { ArchiveMeta } from '@/types'

interface HistoryDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onView: (id: string) => void
  onContinue: (id: string) => void
}

/** 历史方案抽屉：回看或继续调整已存档的方案 */
export default function HistoryDrawer({ open, onOpenChange, onView, onContinue }: HistoryDrawerProps) {
  const [items, setItems] = useState<ArchiveMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    listPlans()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [open])

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] overflow-y-auto sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>🗂️ 历史方案</SheetTitle>
          <SheetDescription>回看或继续调整你之前定制的行程</SheetDescription>
        </SheetHeader>

        <div className="mt-2 flex-1 space-y-3 px-4 pb-6">
          {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-muted-foreground">还没有保存过方案，先去定制一份吧。</p>
          )}
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border border-amber-200 bg-white/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-amber-900">{it.destination}</span>
                <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                  v{it.planVersion}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{fmt(it.createdAt)}</p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onView(it.id)}>
                  查看
                </Button>
                <Button size="sm" onClick={() => onContinue(it.id)}>
                  继续调整
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
