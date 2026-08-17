import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  fetchConfig,
  fetchUrlText,
  getPlan,
  parseModelReply,
  planHtmlUrl,
  renderPlan,
  sendChat,
} from '@/lib/api'
import type { ApiMessage, ChatTurn, ModelReply } from '@/types'
import { ROUND_LABELS } from '@/types'
import ProfilePanel from '@/components/travel/ProfilePanel'
import PlanViewer from '@/components/travel/PlanViewer'
import ProfileCarousel from '@/components/travel/ProfileCarousel'
import HistoryDrawer from '@/components/travel/HistoryDrawer'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

function messageToTurn(m: ApiMessage): ChatTurn {
  if (m.role === 'user') {
    return {
      role: 'user',
      text: m.content === '[GENERATE_PLAN]' ? '📝 生成我的旅行方案' : m.content,
      raw: m.content,
    }
  }
  const p = parseModelReply(m.content)
  return { role: 'assistant', text: p.reply, raw: m.content, options: p.options, round: p.round }
}

export default function Home() {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [round, setRound] = useState(0)
  const [readyForPlan, setReadyForPlan] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [planVersion, setPlanVersion] = useState(0)
  const [destination, setDestination] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [model, setModel] = useState('')
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [currentArchiveId, setCurrentArchiveId] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<Record<string, string>>({})
  const destinationRef = useRef('')

  const savePlan = useCallback(
    async (parsed: ModelReply, assistantTurn: ChatTurn, allTurns: ChatTurn[]) => {
      const fullTurns = [...allTurns, assistantTurn]
      const messages: ApiMessage[] = fullTurns.map((t) => ({ role: t.role, content: t.raw }))
      const lastUser = [...allTurns].reverse().find((t) => t.role === 'user')
      try {
        const result = await renderPlan({
          id: currentArchiveId || undefined,
          destination: parsed.destination || destinationRef.current || '我的旅行',
          profile: profileRef.current,
          planMarkdown: parsed.plan || '',
          planVersion: parsed.plan_version || 1,
          mapPoints: parsed.map_points || [],
          messages,
          lastUserMessage: lastUser?.text,
        })
        setCurrentArchiveId(result.id)
        setViewerUrl(planHtmlUrl(result.id))
      } catch (e) {
        setError(`方案已生成，但网页保存失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [currentArchiveId],
  )

  const ask = useCallback(
    async (allTurns: ChatTurn[]) => {
      setLoading(true)
      setError(null)
      try {
        const messages: ApiMessage[] = allTurns.map((t) => ({ role: t.role, content: t.raw }))
        const raw = await sendChat(messages)
        const parsed: ModelReply = parseModelReply(raw)

        if (parsed.profile) {
          profileRef.current = { ...profileRef.current, ...parsed.profile }
          setProfile((p) => ({ ...p, ...parsed.profile }))
        }
        if (typeof parsed.round === 'number') setRound(parsed.round)
        if (parsed.ready_for_plan) setReadyForPlan(true)
        if (parsed.destination) {
          destinationRef.current = parsed.destination
          setDestination(parsed.destination)
        }

        const turn: ChatTurn = {
          role: 'assistant',
          text: parsed.reply,
          raw,
          options: parsed.options,
          round: parsed.round,
        }
        setTurns([...allTurns, turn])

        if (parsed.plan) {
          setPlan(parsed.plan)
          setPlanVersion(parsed.plan_version || 1)
          await savePlan(parsed, turn, allTurns)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
        setGenerating(false)
      }
    },
    [savePlan],
  )

  // 初始化：检查配置并自动开场
  useEffect(() => {
    fetchConfig()
      .then((cfg) => {
        setHasKey(cfg.hasKey)
        setModel(cfg.model)
        if (cfg.hasKey) {
          const opener: ChatTurn = { role: 'user', text: '（开始咨询）', raw: '你好，我想定制一次旅行。' }
          setTurns([opener])
          ask([opener])
        }
      })
      .catch(() => setHasKey(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, loading])

  const pickOption = (opt: string) => {
    setInput((prev) => {
      const p = prev.trim()
      if (!p) return opt
      if (p.includes(opt)) return prev
      return `${p}，${opt}`
    })
  }

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || loading) return
    setInput('')
    if (plan) setGenerating(true) // 迭代阶段，回复会是新方案
    let raw = t
    const urlMatch = t.match(/https?:\/\/[^\s，。)）]+/)
    if (urlMatch) {
      setLoading(true)
      const content = await fetchUrlText(urlMatch[0])
      setLoading(false)
      raw = content
        ? `${t}\n【链接内容】${content}`
        : `${t}\n（系统提示：该链接内容抓取失败，可能有登录墙，请用户简单描述一下链接里的旅行是什么样的）`
    }
    const next: ChatTurn[] = [...turns, { role: 'user', text: t, raw }]
    setTurns(next)
    ask(next)
  }

  const generatePlan = () => {
    if (loading) return
    setGenerating(true)
    const next: ChatTurn[] = [
      ...turns,
      { role: 'user', text: '📝 生成我的旅行方案', raw: '[GENERATE_PLAN]' },
    ]
    setTurns(next)
    ask(next)
  }

  const continuePlan = async (id: string) => {
    try {
      const a = await getPlan(id)
      profileRef.current = a.profile
      destinationRef.current = a.destination
      setProfile(a.profile)
      setDestination(a.destination)
      setPlan(a.planMarkdown)
      setPlanVersion(a.planVersion)
      setCurrentArchiveId(a.id)
      setReadyForPlan(true)
      setRound(4)
      setTurns(a.messages.map(messageToTurn))
      setViewerUrl(null)
      setHistoryOpen(false)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const viewArchive = async (id: string) => {
    try {
      const a = await getPlan(id)
      setDestination(a.destination)
      setPlanVersion(a.planVersion)
      setViewerUrl(planHtmlUrl(id))
      setHistoryOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant')
  const showReminder = readyForPlan && !plan && !loading

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-sky-50">
      <header className="border-b bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">✈️ 旅行定制助手</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {model && <span>模型：{model}</span>}
            {hasKey === false && <span className="text-red-500 font-medium">未配置 API Key</span>}
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              🗂️ 历史方案
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左：对话区 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {hasKey === false && (
            <Card className="border-red-200 bg-red-50/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">🔑 需要先配置 API Key</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>1. 到 <a className="text-blue-600 underline" href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noreferrer">platform.moonshot.cn</a> 创建 API Key</p>
                <p>2. 在项目根目录复制 <code>.env.example</code> 为 <code>.env</code>，填入 Key</p>
                <p>3. 重启 <code>npm run dev</code></p>
              </CardContent>
            </Card>
          )}

          {/* 轮次进度 */}
          <div className="flex items-center gap-1.5">
            {ROUND_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    i < round
                      ? 'bg-emerald-100 text-emerald-700'
                      : i === round
                        ? 'bg-amber-500 text-white'
                        : 'bg-white/60 text-muted-foreground'
                  }`}
                >
                  {i + 1}. {label}
                </div>
                {i < ROUND_LABELS.length - 1 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>

          {/* 消息列表 */}
          <Card className="flex-1 border-amber-200/60 bg-white/70">
            <ScrollArea className="h-[52vh]">
              <CardContent className="py-4 space-y-4">
                {turns.map((t, i) => (
                  <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        t.role === 'user'
                          ? 'bg-amber-500 text-white rounded-br-sm'
                          : 'bg-white border border-amber-100 rounded-bl-sm'
                      }`}
                    >
                      {t.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown>{t.text}</ReactMarkdown>
                        </div>
                      ) : (
                        t.text
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    {generating ? (
                      <ProfileCarousel profile={profile} />
                    ) : (
                      <div className="rounded-2xl rounded-bl-sm bg-white border border-amber-100 px-4 py-2.5 text-sm text-muted-foreground">
                        思考中…
                      </div>
                    )}
                  </div>
                )}
                <div ref={bottomRef} />
              </CardContent>
            </ScrollArea>
          </Card>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* 生成方案提醒 */}
          {showReminder && (
            <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3">
              <span className="text-sm text-emerald-800">
                ✅ 你的需求已经够清楚啦，点击右侧「生成方案」按钮，我马上为你定制！
              </span>
            </div>
          )}

          {/* 快捷选项：点选暂存进输入框，可组合编辑 */}
          {!loading && lastAssistant?.options && lastAssistant.options.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">💡 点选会填入下方输入框，可组合多个、可再编辑后发送</p>
              <div className="flex flex-wrap gap-2">
                {lastAssistant.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => pickOption(opt)}
                    className="rounded-full border border-amber-300 bg-white/80 px-3.5 py-1.5 text-sm hover:bg-amber-100 active:bg-amber-200 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 输入区 */}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder={hasKey ? '输入你的回答…（Enter 发送，Shift+Enter 换行）' : '请先配置 API Key'}
              disabled={!hasKey || loading}
              className="min-h-[44px] max-h-32 bg-white/80"
            />
            <div className="flex flex-col gap-2">
              <Button onClick={() => send(input)} disabled={!hasKey || loading || !input.trim()}>
                发送
              </Button>
              <Button
                variant="outline"
                onClick={generatePlan}
                disabled={!hasKey || loading || turns.length < 3}
                className={showReminder ? 'border-emerald-500 text-emerald-600 animate-pulse' : ''}
                title={readyForPlan ? '信息已足够，点击生成方案' : '也可以随时提前生成（会基于现有信息）'}
              >
                生成方案
              </Button>
            </div>
          </div>
        </div>

        {/* 右：画像 + 方案入口 */}
        <div className="flex flex-col gap-4">
          <ProfilePanel profile={profile} />
          {plan && (
            <Card className="border-emerald-200 bg-white/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>✅ 方案已生成</span>
                  <span className="text-xs font-normal text-emerald-600">v{planVersion}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {destination ? `${destination}的` : '你的'}定制方案已保存为网页，可查看、下载，也可继续对话调整。
                </p>
                <Button
                  className="w-full"
                  disabled={!currentArchiveId}
                  onClick={() => currentArchiveId && setViewerUrl(planHtmlUrl(currentArchiveId))}
                >
                  🗺️ 查看完整方案
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!currentArchiveId}
                  onClick={() => currentArchiveId && window.open(planHtmlUrl(currentArchiveId), '_blank')}
                >
                  ↗ 新窗口打开
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <PlanViewer
        htmlUrl={viewerUrl}
        destination={destination}
        planVersion={planVersion}
        onClose={() => setViewerUrl(null)}
      />
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onView={viewArchive}
        onContinue={continuePlan}
      />
    </div>
  )
}
