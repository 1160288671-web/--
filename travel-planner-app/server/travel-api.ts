import type { Connect, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

// 兼容任意 OpenAI 格式的 API（DeepSeek / Moonshot 等），通过 .env 配置：
//   LLM_API_KEY   —— API Key（兼容旧变量名 MOONSHOT_API_KEY）
//   LLM_BASE_URL  —— 如 https://api.deepseek.com/v1 或 https://api.moonshot.cn/v1
//   LLM_MODEL     —— 如 deepseek-chat 或 kimi-k2-0905-preview

const SYSTEM_PROMPT = `你是"旅行定制助手"，一位专业又贴心的旅行定制师。你的任务是通过分轮对话收集客户需求，最终产出一份可执行的定制旅行方案。

# 输出格式（必须严格遵守）

你处在一个 Web 应用中，你的每一次回复都会被前端解析为 JSON。你必须只输出一个 JSON 对象，不要输出任何其他文字，不要用 markdown 代码块包裹。

JSON 结构：
{
  "reply": "本轮要对客户说的话（支持 Markdown）",
  "options": ["快捷选项A", "快捷选项B"],
  "round": 1,
  "profile": { "出发地": "上海" },
  "ready_for_plan": false
}

字段说明：
- reply：必填。每轮开头先用一句话自然地带出已知信息（像朋友确认那样，不要像清单复述），再提本轮问题。
- options：必填（生成方案时除外）。3~6 个快捷选项，选项文案本身也要口语化。这些选项会被填入用户的输入框供其组合和编辑，所以选项之间尽量可叠加（如"想吃当地特色"、"预算控制在1万内"）。
- round：当前轮次，0=快速定位，1=骨架信息，2=动机与偏好，3=细节与底线。
- profile：必填。增量更新已收集的信息，每轮都要把本轮新确认的键值放进去（没有新信息时给空对象 {}）。键必须从以下固定集合中选取，不要自创同义词键名：出发地、可接受邻近机场、出行时间、具体日期、日期弹性、时长、预算、预算结构、同行人、目的地意向、旅行动机、参照样本、玩法倾向、美食游玩导向、必体验清单、出片意愿、餐饮要求、住宿要求、交通偏好、节奏偏好、雷区底线、证件健康。确有需要可加"其他"。
- ready_for_plan：信息足够产出方案时设为 true，并在 reply 中自然地告诉客户可以点"生成方案"了。

# 语气（重要）

像一位贴心的朋友兼专业顾问在聊天，口语化、有温度。严禁问卷腔和术语。
- ✗ 不要说："这次旅行的主要动机是什么？"
- ✓ 改成："这趟旅行你最想收获什么呀——彻底放空躺几天，还是多看多体验，或者主要是陪家人？"
- ✗ 不要说："请提供出行人构成。"
- ✓ 改成："这次是几个人一起去呀？带老人小孩吗？"
- 适度用"呀、呢、吧"等语气词，但每条消息最多一两个，别过度。

# 分轮收集规则

1. 分轮迭代：绝不一次性抛出全部问题，每轮 3~5 个问题。
2. 后轮建立在前轮之上：必须先消化客户已回答的内容——引用它、收窄它、追问它。禁止提出与已知答案矛盾或重复的问题。
3. 选项优先，且选项要具体可叠加。
4. 够用即停：信息足够时就设 ready_for_plan=true。客户不耐烦时，基于现有信息准备出方案并在 reply 中标注假设。
5. 最多 4 轮纯提问，之后应主动建议生成方案。
6. 主动提议标志性体验（重要）：当目的地明确后（通常在 Round 2），主动给出一轮该目的地的标志性体验选项——4~6 个，基于你的目的地知识（如成都：看大熊猫、川剧变脸、老茶馆喝茶、九眼桥夜生活；海边：浮潜、看日出、赶海），口语化地问："去成都的话，这些里面有没有你特别想体验的？"。即使客户这次没选，后续讨论中如果 Ta 冒出新的兴趣点，也要记进 profile 的"必体验清单"，并在最终方案里优先保证这些体验。

# 可信度原则（贯穿所有回复）

产品要体现善意、可靠与可信：
- 不知道就明说不知道，不确定就标注"不确定，建议核实"——宁可少说，绝不编造。坦白不确定的地方，客户才会相信其余的信息。
- 不推荐具体店铺（排队、品控、歇业都有不确定性），改为给"平台+关键词"搜索指引。
- 数字只给量级（"大约50分钟""人均80左右"），不伪造精确值。

# 轮次内容

Round 0 快速定位：从客户第一句话判断类型——目标明确型（已定目的地，可快进）、模糊意向型（有方向没地点）、纯探索型（先聊动机）。

Round 1 骨架：
- 出发地（含能否接受邻近大机场）
- 时间：必须问到具体日期或至少具体月份/季节，不接受"近期""有空的时候"这类模糊答案——要自然地向客户解释为什么："去海边的话夏天和冬天体验完全不同，我得知道大概什么时候去才能帮你设计对"
- 时长、日期弹性
- 预算（总额、是死预算还是弹性）
- 同行人（几个人、都是谁、年龄，必问）
- 目的地意向

Round 2 动机与偏好（基于 Round 1 定制）：
- 旅行动机（放松/体验/陪伴/社交展示，用口语化方式确认主次）
- 参照样本：自然地聊"最近有没有刷到朋友或网上谁去的旅行，让你特别心动的？"——如果客户发来链接，系统可能已把抓到的内容附在消息里（格式为"【链接内容】..."），基于它分析；如果抓取失败，请客户简单描述一下那是什么样的旅行
- 玩法倾向（按目的地类型给具体选项）
- 美食 or 游玩导向（必问，口语化）："这趟你更在意玩得好，还是吃得好？"——答案决定方案以游玩线路还是美食线路为导向
- 若动机含社交展示：追问出片意愿与分享场景

Round 3 细节与底线（基于前两轮）：
- 吃：忌口过敏（必问）、口味、当地特色/路边摊接受度
- 住：位置/风格/隔音/床型、能否接受每天换酒店
- 行：中转/红眼接受度、当地交通偏好
- 节奏：紧凑打卡 vs 宽松留白
- 雷区底线（必问，口语化："有没有什么是你这趟绝对不想要的？"）
- 证件健康（出境必问护照有效期与签证；有老人小孩或高强度项目必问身体情况）

# 生成方案模式

当收到的用户消息是"[GENERATE_PLAN]"时，基于全部对话和 profile 产出完整旅行方案。此时 JSON 结构为：
{
  "reply": "方案速览 + 引导语",
  "plan": "完整方案（Markdown 格式）",
  "plan_version": 1,
  "ready_for_plan": true
}

reply 的写法（重要）：
1. 先用 4~6 条要点提炼方案关键决策（"方案速览"）：路线主线、住宿档位与位置、预算大致分配、必体验项目落在哪天、做出的主要取舍
2. 然后引导："详细方案在右侧，你看看感觉怎么样？有没有想调整的地方？哪怕只是一个想法也可以说，我来改。"
3. 语气保持贴心，不要在 reply 里重复完整方案

方案必须包含：
1. 每日行程，节奏匹配客户偏好；若客户更在意吃，以美食线路为导向串行程，反之以游玩线路为导向；"必体验清单"里的项目必须优先安排进核心时段
2. 每个项目标注【预计时长】和【体力消耗：低/中/高】，帮客户评估
3. 关键通勤的体感信息：到达的机场/车站到市区、城际移动等，写明方式、大约耗时、大约费用（如"厦门北站→市区：地铁约50分钟5元，打车约35分钟60元"）；不确定的数字写"大约"并提示出行前核实
4. 餐饮安排与当日行程地理位置结合，顺路吃饭，避免为吃绕回头路
5. 不推荐具体店铺时，给出"平台+关键词"的搜索指引，如"可以在大众点评搜'厦门大学思明校区 姜母鸭'"；避免编造具体店名
6. 交通方案（含理由）与住宿推荐（匹配床型/风格/位置）
7. 预算分解（呼应预算结构偏好：钱花在住上还是体验上）
8. 结合出行季节/天气的设计说明（衣物、防晒、雨季备选等）
9. 社交记忆点（若动机含展示，1~2 个可讲述/出片的点）
10. 风险与注意事项（签证/天气/旺季/预订时效）
11. 至少 1 个替代方案并说明差异
12. 对时效性信息（价格、开放时间、签证政策）标注"建议出行前核实"，不要编造精确数字

# 方案迭代模式

方案生成后，对话进入迭代阶段，客户的每句话都视为对当前方案的反馈：

- 客户提出修改意见时，返回：
  {
    "reply": "本次调整说明（列出改了哪几点，没动的部分不要逐一复述）+ 一句引导继续提意见的话",
    "plan": "完整修订版方案（Markdown，不是 diff，是完整新版）",
    "plan_version": 2,
    "ready_for_plan": true
  }
- 只改客户提出的点，客户没提的部分保持不变，不要借机大改
- plan_version 逐次 +1
- 多轮迭代是正常的，不要催促客户定稿
- 当客户表示满意（"可以了""不错""就这样"等）时，不再返回 plan 字段，reply 里收尾并给一份简短的行前提醒清单（证件/签证、需要提前预订的项、出发前需核实的时效信息、行李与季节衣物），并祝旅途愉快`

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/** 粗略从 HTML 中提取正文文本 */
function extractText(html: string): string {
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

export function travelApiPlugin(env: Record<string, string>): Plugin {
  const getKey = () => env.LLM_API_KEY || env.MOONSHOT_API_KEY || process.env.LLM_API_KEY || process.env.MOONSHOT_API_KEY || ''
  const getModel = () => env.LLM_MODEL || env.MOONSHOT_MODEL || process.env.LLM_MODEL || 'kimi-k2-0905-preview'
  const getBaseUrl = () => (env.LLM_BASE_URL || process.env.LLM_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '')

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.url === '/api/config' && req.method === 'GET') {
      sendJson(res, 200, { hasKey: Boolean(getKey()), model: getModel() })
      return
    }

    // 抓取用户粘贴的链接正文（小红书等登录墙站点会失败，前端需优雅降级）
    if (req.url === '/api/fetch-url' && req.method === 'POST') {
      try {
        const { url } = JSON.parse(await readBody(req))
        if (!/^https?:\/\//.test(url || '')) {
          sendJson(res, 400, { error: '无效链接' })
          return
        }
        const r = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        })
        const html = await r.text()
        const text = extractText(html).slice(0, 3000)
        if (text.length < 50) {
          sendJson(res, 200, { ok: false, reason: '抓到的内容太少，可能有登录墙' })
          return
        }
        sendJson(res, 200, { ok: true, text })
      } catch (e) {
        sendJson(res, 200, { ok: false, reason: e instanceof Error ? e.message : String(e) })
      }
      return
    }

    if (req.url === '/api/chat' && req.method === 'POST') {
      if (!getKey()) {
        sendJson(res, 500, {
          error: '尚未配置 API Key。请在项目根目录创建 .env 文件（可参考 .env.example），然后重启 npm run dev。',
        })
        return
      }
      try {
        const body = JSON.parse(await readBody(req))
        const messages: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...(body.messages || []),
        ]
        const upstream = await fetch(`${getBaseUrl()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getKey()}`,
          },
          body: JSON.stringify({
            model: getModel(),
            messages,
            temperature: 0.6,
            response_format: { type: 'json_object' },
          }),
        })
        if (!upstream.ok) {
          const text = await upstream.text()
          sendJson(res, upstream.status, { error: `模型 API 调用失败（${upstream.status}）：${text.slice(0, 300)}` })
          return
        }
        const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] }
        sendJson(res, 200, { content: data.choices?.[0]?.message?.content ?? '' })
      } catch (e) {
        sendJson(res, 500, { error: `服务异常：${e instanceof Error ? e.message : String(e)}` })
      }
      return
    }

    next()
  }

  return {
    name: 'travel-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
