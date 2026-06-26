# AI脑暴 - 引导式AI创意讨论平台

AI脑暴是一个引导式AI创意讨论平台。通过AI主持人引导对话、多位虚拟专家从不同专业角度参与讨论，帮助你高效梳理创意，并自动生成会议纪要和专业文档（PRD/SPEC）。

## 功能特性

- **多Agent编排引擎**：AI主持人负责引导讨论、指定1~3位专家发言；多位虚拟专家（产品经理、技术架构师、市场分析师、UX设计师、增长黑客）从各自专业角度提供深度分析
- **多专家轮次讨论**：主持人可指定多位专家，专家按轮次依次交叉发言（最多5轮），后续专家可回应/补充/反驳前序专家观点
- **专家建设性辩论**：专家被引导主动寻找分歧、敢于反驳前序专家观点，反驳时需提出替代方案或修正建议（"我理解X的观点，但从Y角度来看..."），推动逼近最优方案而非虚假共识
- **角色自定义**：支持创建/编辑/删除自定义专家角色，可在全局管理页或创建项目时直接新建；配色支持5种预设色和自定义 HEX 颜色（取色器或手动输入 #rrggbb）
- **消息编辑**：支持编辑已发送的用户消息，系统自动删除后续对话并重新生成
- **流式对话体验**：基于SSE的实时流式输出，打字机效果，角色分色显示；专家发言时打字指示器圆点颜色匹配专家配色；搜索时显示"正在搜索：xxx"实时状态
- **并行多维度搜索**：webSearch 工具支持一次性传入多个关键词（queries 数组，最多5个）并行搜索；每个关键词在工具层多源竞速（Tavily + DuckDuckGo Instant + Wikipedia 三路并行，DuckDuckGo Lite 作为最终回退），专家搜索结果跨专家共享，避免重复搜索
- **搜索效率控制**：专家工具调用轮次限制为4步（`stepCountIs(4)`），prompt 引导专家优先参考已有搜索结果，单次回复搜索不超过2次
- **超时与重试保护**：主持人调用 90s 超时、专家 120s 超时，自动重试 2 次；失败的回复不污染上下文、不占用总结轮次
- **[HOOK] 互动机制**：专家回复末尾自动生成引导性问句，交还话语权，激发用户进一步思考
- **阶段总结**：每4轮自动生成讨论总结，也可手动触发，梳理已讨论要点、待解决问题和待确认项
- **中场暂停与继续**：专家讨论每满5轮自动暂停并生成"中场总结"（回顾进展、指出分歧、邀请用户补充），用户可补充偏好/信息或直接点击「继续讨论」让专家完成剩余轮次；暂停点元数据持久化，刷新页面或重新进入仍可恢复继续状态
- **会议纪要生成**：结束脑暴后自动生成结构化纪要（讨论主题、核心观点、主要分歧、下一步建议）
- **文档草稿生成**：基于纪要内容一键生成PRD或SPEC草稿，支持Markdown格式
- **Electron桌面应用**：支持打包为 Windows 桌面应用，Electron 主进程拉起 Next.js standalone 服务器，零代码改动

## 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | Next.js 16（App Router + Turbopack） |
| 语言 | TypeScript |
| 数据库 | SQLite + Prisma 7（`@prisma/adapter-better-sqlite3`） |
| AI | Vercel AI SDK v6 + `@ai-sdk/openai` v3（使用 `openai.chat()` 走 Chat Completions API） |
| 样式 | Tailwind CSS v4 |
| Markdown | react-markdown + remark-gfm |
| 通信 | SSE（Server-Sent Events） |
| 桌面 | Electron 42 + electron-builder |

> **重要**：AI SDK v5+ 的 `openai()` 默认使用 Responses API（`/responses` 端点），但阿里云百炼、小米MiMo等国内API仅支持 Chat Completions API（`/chat/completions`）。本项目使用 `openai.chat()` 强制走 Chat Completions API，确保兼容性。

## 安装

### 方式一：桌面应用（推荐）

1. 下载 `AI脑暴-0.1.0-x64.exe` 安装包
2. 双击运行，选择安装目录
3. 安装完成后从开始菜单或桌面快捷方式启动

### 方式二：本地运行

1. 安装 [Node.js 20+](https://nodejs.org/)（推荐 22 LTS）
2. 下载项目代码，在项目目录下执行：

```bash
npm run setup
npm run dev
```

3. 打开浏览器访问 `http://localhost:3000`

> Windows 用户可双击 `start.bat` 使用一键启动菜单。

## LLM 配置

AI脑暴支持任意 OpenAI 兼容格式的 LLM API。有两种配置方式：

### 方式A：页面配置（推荐）

启动后点击右上角「设置」，填写 API 地址、API Key 和模型名称。配置存储在浏览器本地，无需修改任何文件。

### 方式B：.env 文件

在项目根目录创建 `.env` 文件：

```env
LLM_BASE_URL="API地址"
LLM_API_KEY="你的API Key"
LLM_MODEL="模型名称"
```

### 常见 API 配置示例

**阿里云百炼（DeepSeek）**：

```env
LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
LLM_API_KEY="sk-你的百炼API Key"
LLM_MODEL="deepseek-v4-pro"
```

**小米 MiMo**：

```env
LLM_BASE_URL="https://api.xiaomimimo.com/v1"
LLM_API_KEY="你的MiMo API Key"
LLM_MODEL="mimo-v2.5-pro"
```

**其他 OpenAI 兼容 API**：修改 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 即可。

## 使用流程

### 第一步：创建项目

在首页点击「新建脑暴」，输入讨论主题，选择至少2位专家参与。

### 第二步：测试连接

进入脑暴对话页后，点击右上角「测试连接」按钮，确认 LLM API 配置正确。

### 第三步：开始讨论

在输入框中输入你的想法或问题，AI主持人会：
1. 概括你的输入
2. 指定最合适的专家回应

专家会从专业角度分析，并以 [HOOK] 问句结尾，引导你进一步思考。

### 第四步：互动与深入

- 回应专家的 [HOOK] 问句，推动讨论深入
- 随时输入新想法或追问
- **编辑消息**：点击用户消息气泡上的编辑按钮可修改内容，系统会自动删除后续对话并重新生成
- AI生成过程中可点击「停止生成」中断前端显示，同时中断服务端生成（信号透传至引擎层）；结束脑暴生成纪要的过程中同样可点击「停止生成」中止

### 第五步：阶段总结

每4轮自动生成讨论总结，也可随时点击「总结一下」手动触发。总结包含：
- 已讨论要点
- 待解决问题
- 待确认事项

### 第六步：结束并生成纪要

点击「结束脑暴并生成纪要」，系统自动生成结构化会议纪要：
- 讨论主题
- 核心观点
- 主要分歧
- 下一步建议

### 第七步：生成文档

在成果页粘贴纪要内容，选择生成：
- **PRD 草稿**（产品需求文档）
- **SPEC 草稿**（技术规格说明）

生成的文档支持 Markdown 格式，可复制使用。

## 预设专家角色

| 专家 | 关注领域 |
|------|----------|
| 产品经理 | 用户价值、需求优先级、MVP范围、产品定位 |
| 技术架构师 | 技术可行性、架构选型、性能瓶颈、开发成本 |
| 市场分析师 | 市场规模、竞争格局、差异化策略、获客渠道 |
| UX设计师 | 用户旅程、信息架构、交互效率、情感化设计 |
| 增长黑客 | 获客漏斗、病毒系数、留存曲线、变现模式 |

> 除以上内置角色外，可在「专家管理」页面或创建项目时新建自定义角色，设置名称、人设、关注领域和配色（支持5种预设色和自定义 HEX 颜色）。

## 项目结构

```
ai-brainstorm/
├── electron/                      # Electron 主进程
│   ├── main.ts                    # 窗口管理、standalone server 启动、文件日志
│   ├── preload.ts                 # 预加载脚本
│   └── tsconfig.json
├── prisma/
│   └── schema.prisma              # 数据模型定义
├── public/                        # 静态资源
├── scripts/
│   └── prepare-electron.cjs       # Electron 打包前处理脚本
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── page.tsx               # 页面：项目列表
│   │   ├── settings/page.tsx      # 页面：设置
│   │   ├── experts/page.tsx       # 页面：专家管理（全局）
│   │   ├── projects/
│   │   │   ├── new/page.tsx       # 页面：创建项目
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # 页面：脑暴对话（核心）
│   │   │       └── results/page.tsx # 页面：成果页
│   │   └── api/                   # API 路由
│   │       ├── projects/          # 项目 CRUD
│   │       ├── experts/           # 专家 CRUD（GET/POST/PUT/DELETE）
│   │       ├── sessions/[id]/     # SSE 流式端点（消息/编辑消息/总结/结束/文档）
│   │       └── test-connection/   # LLM 连接测试
│   ├── components/                # React 组件
│   │   ├── chat/                  # 对话组件（流式输出、消息气泡、输入栏等）
│   │   ├── project/               # 项目组件（专家选择器、项目卡片）
│   │   └── results/               # 成果组件（文档生成器、Markdown查看器）
│   └── lib/                       # 核心逻辑
│       ├── engine/                # 多Agent编排引擎
│       │   ├── brainstorm-engine.ts
│       │   ├── host-agent.ts      # 主持人 Agent
│       │   ├── expert-agent.ts    # 专家 Agent
│       │   ├── document-agent.ts  # 文档生成 Agent
│       │   └── prompts/           # 提示词模板
│       ├── experts/               # 专家角色定义
│       │   ├── types.ts           # 客户端安全类型与内置专家
│       │   ├── definitions.ts     # 服务端异步加载（DB + 内存回退）
│       │   └── colors.ts          # 共享配色方案
│       ├── hooks/                 # React Hooks
│       │   └── use-experts.ts     # 客户端专家列表 Hook（模块级缓存）
│       ├── llm.ts                 # LLM 客户端封装（含超时/重试配置）
│       ├── prisma.ts              # Prisma 客户端单例
│       └── sse.ts                 # SSE 工具
├── electron-builder.yml           # Electron 打包配置
├── next.config.ts                 # Next.js 配置（output: standalone）
├── prisma.config.ts               # Prisma 7 配置
├── .npmrc                         # npm 镜像配置（better-sqlite3 + electron）
└── start.bat                      # Windows 一键启动脚本
```

## 开发

### 开发模式

```bash
npm run dev          # Web 开发模式
npm run electron:dev # Electron 开发模式（并行 next dev + electron）
```

### 生产构建

```bash
npm run build
npm run start
```

### Electron 打包

```bash
npm run electron:build
```

流程：`next build` → `electron:prepare`（standalone 后处理、@electron/rebuild、模板数据库）→ 编译主进程 → `electron-builder`

产物：`electron-build/AI脑暴-0.1.1-x64.exe`

### ABI 切换备忘

`better-sqlite3` 需要根据运行环境切换 ABI：

| 场景 | ABI | 命令 |
|------|-----|------|
| Web 开发 / `next dev` | Node | `npm run rebuild:node` |
| Electron 打包 | Electron | `npm run rebuild:electron`（`electron:build` 自动调用） |

## 常见问题

### 连接测试失败

1. 确认 API 地址、API Key、模型名称填写正确
2. 确认使用的是 Chat Completions API 兼容端点
3. 检查 API Key 是否有效、是否有余额

### AI 回复空白

可能是模型名称错误或 API 未正确响应。请在设置页确认模型名称，并使用「测试连接」按钮验证。

### 启动报错 NODE_MODULE_VERSION 不匹配

执行 `npm run rebuild:sqlite` 重新下载/编译原生模块（自动匹配当前 Node.js 版本）。切换 Node 大版本后必须执行此命令。

### 端口被占用

执行 `npm run kill-port` 清理 3000 端口，然后重新启动。

## License

MIT
