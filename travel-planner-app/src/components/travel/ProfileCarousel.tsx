import { useEffect, useState } from 'react'

/** 生成方案时的等待体验：循环轮播已收集的需求画像 */
export default function ProfileCarousel({ profile }: { profile: Record<string, string> }) {
  const entries = Object.entries(profile).filter(([, v]) => v && String(v).trim())
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (entries.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % entries.length), 1600)
    return () => clearInterval(t)
  }, [entries.length])

  const current = entries.length ? entries[idx % entries.length] : null

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl rounded-bl-sm border border-amber-200 bg-white/80 px-5 py-4 text-sm">
      {current ? (
        <div key={idx} className="animate-profile-pop flex items-center gap-3 rounded-xl bg-amber-50/80 border border-amber-200 px-4 py-2.5">
          <span className="shrink-0 text-xs font-medium text-amber-700/80">{current[0]}</span>
          <span className="text-sm font-semibold text-amber-900">{current[1]}</span>
        </div>
      ) : (
        <div className="rounded-xl bg-amber-50/80 border border-amber-200 px-4 py-2.5 text-muted-foreground">
          正在整理你的需求…
        </div>
      )}

      {entries.length > 1 && (
        <div className="flex gap-1">
          {entries.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === idx % entries.length ? 'bg-amber-500' : 'bg-amber-200'}`}
            />
          ))}
        </div>
      )}

      <p className="text-muted-foreground">
        正在努力为这样的您构建方案<span className="animate-pulse">…</span>
      </p>
    </div>
  )
}
