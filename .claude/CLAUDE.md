# CLAUDE.md — AI 协作契约

## 项目概述

这是一个「定制化旅行方案」产品，围绕一套方法论与一个落地应用：

- **`custom-travel-plan` skill**：方法论本体。通过分轮对话收集客户需求（Round 0 快速定位 → 1 骨架 → 2 动机与偏好 → 3 细节与底线），再按「硬约束 → 需求翻译 → 软偏好」三层分析法产出可执行的定制旅行方案。
- **`travel-planner-app`**：把该方法论落地的 Web 应用。前端是 React 19 + TS + Vite + shadcn/ui，服务端是一个 Vite 插件（`server/travel-api.ts`）暴露 `/api/*` 接口并转发到任意 OpenAI 兼容 LLM。

## 演进链路（重要）

方法论按固定链路演进，改动必须遵循：

```
讨论稿（定制化旅行方案讨论记录v1.md）
  → 设计文档（custom-travel-plan skill 设计方案.md）
  → skill 实现（SKILL.md + references/question-bank.md，打包为 custom-travel-plan.skill）
  → 应用落地（travel-planner-app，尤其 server/prompts/system-prompt.ts）
```

- 改「流程/轮次/分析顺序/产出要求」→ 改 skill 的 SKILL.md 与应用的 SYSTEM_PROMPT
- 改「问题措辞/条件分支/话术」→ 改 references/question-bank.md
- 改「触发条件」→ 改 skill frontmatter 的 description
- 方法论层与应用层的 SYSTEM_PROMPT 需保持一致，改动时两侧同步

## 目录约定

- 仓库根：skill 三件套 + 设计/讨论文档 + `MEMORY.md` + 本文件 + `项目结构说明.md`
- `travel-planner-app/server/`：`travel-api.ts` 只做路由装配；大段 prompt 放 `prompts/`；可复用 helper 放 `lib/`
- `travel-planner-app/src/components/ui/`：shadcn 自动生成组件，**勿手改**
- `.env`（含真实 Key）已 gitignore，绝不提交或回显其内容

## 开发约定

- 服务端为纯 TypeScript，无独立后端进程；新增接口在 `server/travel-api.ts` 的 handler 内加分支
- 修改 `server/` 后运行 `npx tsc -b` 确认类型通过
- 与 LLM 的交互全部走 JSON 协议（见 `src/types/index.ts` 的 `ModelReply`）；模型回复解析用 `src/lib/api.ts` 的 `parseModelReply`（已容忍格式噪声）
- 时效性信息（价格、开放时间、签证政策）不硬编码具体数字，模型侧标注「建议出行前核实」
