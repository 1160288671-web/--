# ✈️ 旅行定制助手

一个「定制化旅行方案」Web 应用：通过分轮对话收集客户需求，最终产出可执行的定制旅行方案（每日行程、交通、住宿、预算分解、风险提示、替代方案）。

技术上是一个 React 19 + TypeScript + Vite 单页应用，前端调用同源 Vite 插件暴露的 `/api/*` 接口，由服务端把请求转发到任意 OpenAI 兼容的 LLM（DeepSeek / Moonshot 等）。核心方法论来自仓库根的 `custom-travel-plan` skill，详见《项目结构说明.md》。

---

## 快速开始

1. 安装依赖（首次运行由 `start.ps1` 自动完成）：

   ```bash
   npm install --cache .npm-cache
   ```

2. 配置 LLM：

   ```bash
   cp .env.example .env
   # 编辑 .env，填入 LLM_API_KEY（及可选的 LLM_BASE_URL / LLM_MODEL）
   ```

3. 启动开发服务器（端口 3000）：

   ```bash
   npm run dev
   ```

   Windows 用户也可直接运行 `.\start.ps1`（自动装依赖、检查 `.env`、启动服务）。

   打开 http://localhost:3000/ 即可对话。

## 环境变量（`.env`）

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `LLM_API_KEY` | 是 | API Key（兼容旧变量名 `MOONSHOT_API_KEY`） | `sk-...` |
| `LLM_BASE_URL` | 否 | API 地址（不带 `/chat/completions` 后缀） | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 否 | 模型名称 | `deepseek-chat` |
| `AMAP_KEY` | 否 | 高德开放平台「Web服务」Key，用于方案地图；未配置时地图自动隐藏 | `在高德控制台创建` |
| `AMAP_SECRET` | 否 | 高德数字签名「私钥/安全密钥」；若为该 Key 开启了数字签名则必填 | `在高德控制台查看` |

`.env` 已加入 `.gitignore`，不会被提交。

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（Vite + API 中间件） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | ESLint 检查 |

## 目录结构

```
travel-planner-app/
├── index.html                 # Web 应用入口
├── vite.config.ts             # Vite 配置：端口、@ 别名、注册 travelApiPlugin
├── package.json               # 依赖与脚本
├── tailwind.config.js         # Tailwind 主题（shadcn 配置）
├── postcss.config.js          # PostCSS 处理
├── tsconfig*.json             # TypeScript 配置（app / node）
├── .env.example               # 环境变量模板
├── .env                       # 本地配置（已 gitignore）
│
├── server/                    # 服务端（Vite 插件内嵌 API）
│   ├── travel-api.ts          # 插件入口：装配 /api/config、/api/chat、/api/fetch-url、/api/plan-map、/api/plan/render、/api/plans、/api/plan/:id(.html)
│   ├── prompts/
│   │   └── system-prompt.ts   # SYSTEM_PROMPT：旅行定制师的角色、分轮规则与输出 JSON 协议
│   ├── lib/
│   │   ├── llm.ts             # resolveLlmConfig / chatCompletion（OpenAI 兼容客户端）
│   │   ├── url-fetch.ts       # 网页正文抓取与提取
│   │   ├── amap.ts            # 高德地理编码 + 静态图点位标注（fetchPlanMap）
│   │   ├── store.ts           # 方案存档读写（TravelArchive schema + 列表/读取/写入）
│   │   ├── render-plan.ts     # Retro pop art HTML 模板 + Markdown 转 HTML + 按天分页
│   │   └── http.ts            # readBody / sendJson 小工具
│   └── data/
│       └── plans/             # 生成的方案存档（{id}.json 档案 + {id}.html 网页，已 gitignore）
│
└── src/                       # 前端
    ├── main.tsx               # 入口：挂载 React + Router
    ├── App.tsx                # 路由定义
    ├── index.css / App.css    # 全局与组件样式
    ├── pages/
    │   └── Home.tsx           # 主页面：对话区 + 轮次进度 + 快捷选项 + 输入区
    ├── components/
    │   ├── travel/
    │   │   ├── ProfilePanel.tsx    # 需求画像面板（实时汇总已收集信息，硬约束 ⚠ 标记）
    │   │   ├── PlanViewer.tsx      # 全屏方案查看器（iframe + 下载/新窗口）
    │   │   ├── ProfileCarousel.tsx # 生成等待时循环轮播需求画像
    │   │   └── HistoryDrawer.tsx   # 历史方案抽屉（回看 / 继续调整）
    │   └── ui/                # shadcn/ui 组件库（40+，自动生成，勿手改）
    ├── lib/
    │   ├── api.ts             # fetchConfig / sendChat / fetchUrlText / renderPlan / listPlans / getPlan / parseModelReply
    │   └── utils.ts           # cn()（clsx + tailwind-merge）
    ├── hooks/
    │   └── use-mobile.ts      # 响应式断点 hook
    └── types/
        └── index.ts           # ModelReply / ChatTurn / ApiMessage / PROFILE_KEYS / ROUND_LABELS
```

## 工作原理

1. **分轮对话**：模型按 `Round 0 快速定位 → 1 骨架 → 2 动机与偏好 → 3 细节与底线` 逐轮提问，每轮 3~5 问、选项优先、后轮消化前轮。
2. **JSON 协议**：模型每次回复都是单个 JSON 对象（`reply` / `options` / `round` / `profile` / `ready_for_plan`），前端 `parseModelReply` 稳健解析（容忍 ` ```json ` 包裹或前后杂文本）。
3. **实时画像**：`profile` 增量累积，右侧面板实时展示；`餐饮要求` / `雷区底线` / `证件健康` 标记为硬约束 ⚠。
4. **方案生成与迭代**：点击「生成方案」发送 `[GENERATE_PLAN]`，模型产出完整方案（含 `plan_version`）；之后每轮反馈都是对方案的修订，版本号逐次 +1。
5. **HTML 方案与存档**：方案生成后由服务端渲染成 Retro pop art 风格的 HTML（封面 + 每天一页，每页含当天地图），全屏弹窗展示、可下载/新窗口打开；同时把用户档案与完整对话存入 `server/data/plans/`，可在「历史方案」回看或继续调整。

## 设计原则

- **LLM 做判断，代码做执行**：LLM 只负责对话与方案产出，链接抓取、JSON 解析、状态管理均为确定性代码。
- **可信度优先**：不编造精确数字、不推荐具体店铺（改给「平台 + 关键词」搜索指引）、时效性信息标注「建议出行前核实」。
- **渐进式披露**：大段 `SYSTEM_PROMPT` 与可复用 helper 从 `travel-api.ts` 拆出，路由层保持精简。
