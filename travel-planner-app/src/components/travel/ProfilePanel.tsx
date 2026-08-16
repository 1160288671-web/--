import { PROFILE_KEYS } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

const HARD_KEYS = new Set(['餐饮要求', '雷区底线', '证件健康'])

export default function ProfilePanel({ profile }: { profile: Record<string, string> }) {
  const filled = Object.keys(profile).length
  const knownKeys = PROFILE_KEYS.filter((k) => profile[k])
  const extraKeys = Object.keys(profile).filter((k) => !(PROFILE_KEYS as readonly string[]).includes(k))
  const allKeys = [...knownKeys, ...extraKeys]
  return (
    <Card className="h-full border-amber-200/60 bg-white/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>🧭 需求画像</span>
          <span className="text-xs font-normal text-muted-foreground">已收集 {filled} 项</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[52vh] pr-3">
          {filled === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              随着对话进行，你的需求会实时汇总在这里
            </p>
          ) : (
            <dl className="space-y-2.5">
              {allKeys.map((k) => (
                <div key={k} className="rounded-lg bg-amber-50/70 px-3 py-2">
                  <dt className="text-xs text-amber-700/80 font-medium">
                    {k}
                    {HARD_KEYS.has(k) && <span className="ml-1 text-red-500">⚠</span>}
                  </dt>
                  <dd className="text-sm mt-0.5">{profile[k]}</dd>
                </div>
              ))}
            </dl>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
