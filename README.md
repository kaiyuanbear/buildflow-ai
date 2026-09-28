# BuildFlow AI

> 从一句产品描述，到可查看、可交互、可迭代的浏览器应用。

BuildFlow AI 是一个用于工程面试演示的 AI 应用构建器。用户注册后输入一个小型产品需求，系统在服务端调用 DeepSeek 生成受约束的浏览器应用产物；随后用户可以观察真实的 Agent 执行过程、查看生成文件、在隔离预览中操作应用，并通过自然语言继续优化和恢复历史版本。

**在线演示：** <https://buildflow-ai-ijzo.onrender.com>
> Render 免费实例在长时间空闲后可能需要冷启动，请等待首次请求完成。

## 核心能力

- **完整主流程**：注册 / 登录 → 输入需求 → Agent 构建 → 文件查看 → 交互预览 → 数据持久化。
- **通用生成路径**：不按“Todo、简历、电商”等关键词切换固定模板；系统处理通用的浏览器应用产物。
- **可见、真实的 Agent 过程**：展示持久化的需求分析、模型调用、模型返回、质量校验、文件写入、版本保存与预览就绪事件，不展示或伪造模型思维链。
- **多文件应用产物**：新产物通常包含 `index.html`、`README.md`、`styles/*.css`、`src/*.js` 等 7–12 个文件，支持文件树与源码查看。
- **真实交互与状态保存**：生成应用在右侧 iframe 中可直接操作；允许的预览状态会按版本保存，刷新后可恢复。
- **延展能力：版本化迭代**：在已有项目中继续描述优化需求会创建 v2、v3……；可浏览历史版本并恢复任一版本为当前版本。
- **私有数据与并发保护**：项目、任务、文件、版本和预览状态均持久化在 PostgreSQL，所有受保护接口校验项目所有权；同一项目只允许一个活动生成任务。

## 快速体验

1. 打开在线演示或启动本地服务。
2. 注册一个新账户并进入首页。
3. 输入小型产品需求，例如：`请为我制作一个旅行行程编辑器，支持添加、调整和查看每日计划。`
4. 进入 Builder：
   - 左侧查看中文化 Agent 执行事件和历史需求；
   - 中间展开文件树、选择文件查看源码与版本记录；
   - 右侧直接操作沙箱中的生成应用。
5. 在左侧输入优化需求，例如：`将布局改得更紧凑，并增加每周进度摘要。`
6. 查看新版本，必要时选择历史版本并执行恢复；刷新页面确认版本和预览状态仍存在。

详细的项目说明见 [docs/project-overview.md](docs/project-overview.md)，演示讲解稿见 [docs/demo-script.md](docs/demo-script.md)。

## 技术架构

```text
React + Vite (Web)
        │  /api
        ▼
Fastify + Zod (API) ──► DeepSeek API
        │
        ▼
PostgreSQL + Drizzle ORM
        │
        ▼
版本 / 生成文件 / 预览状态
        │
        ▼
sandbox="allow-scripts" iframe 预览
```

| 层级 | 技术与职责 |
| --- | --- |
| 前端 | React 19、Vite、TypeScript、CSS；Atoms 式首页和三栏 Builder 工作台。 |
| 后端 | Fastify、Zod、TypeScript；认证、项目权限、生成任务、模型调用与产物校验。 |
| 数据 | PostgreSQL（可使用 Supabase）、Drizzle ORM 与迁移。 |
| 认证 | bcryptjs 密码哈希、HttpOnly JWT Cookie。 |
| 生成 | DeepSeek 两阶段 JSON 调用：应用蓝图 → 多文件浏览器产物。 |
| 部署 | Docker 单服务；Fastify 同时托管 API 和构建后的前端，避免生产环境跨域 Cookie 问题。 |

## 生成与安全边界

BuildFlow AI 的目标是可靠演示“提示词到前端应用”的链路，而不是执行任意 AI 代码。

- `DEEPSEEK_API_KEY` 只保存在 API 服务端环境变量，绝不会进入浏览器、Vite bundle、日志或 Git 仓库。
- 生成代码**不会在服务器执行**，不会安装依赖，也不会生成或部署子应用后端。
- 预览仅在 `sandbox="allow-scripts"` 的 iframe 中运行，并通过 CSP 与静态校验限制能力。
- 产物禁止网络请求、外部脚本/样式、模块导入、CSS `url()`、Cookie、`localStorage`、父窗口访问、弹窗和表单提交。
- API 校验文件路径、数量、大小、加载顺序和最低质量门槛；不合格的模型结果最多进行一次受限修复。
- 当模型不可用、超时或产物仍不合格时，系统会明确标注并保存一个本地可交互起步应用，不伪装为 AI 生成成功。

## 本地运行

### 前置条件

- Node.js `>= 22`
- pnpm `10`（项目通过 Corepack 管理）
- PostgreSQL 数据库，例如 Supabase PostgreSQL

### 1. 安装依赖

```powershell
corepack enable
pnpm install --store-dir ".pnpm-store"
```

> 使用 `--store-dir ".pnpm-store"` 可将 pnpm 缓存保存在项目盘内，避免持续占用系统盘。

### 2. 配置环境变量

```powershell
Copy-Item .env.example .env
```

编辑 `.env`：

```dotenv
DATABASE_URL=
JWT_SECRET=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-flash
NODE_ENV=development
```

说明：

- `DATABASE_URL`：PostgreSQL 连接字符串。
- `JWT_SECRET`：至少 32 个字符的随机字符串。
- `DEEPSEEK_API_KEY`：可选；未配置时仍可体验明确标识的本地 fallback 流程。
- 不要使用 `VITE_` 前缀保存密钥；不要提交 `.env`。

### 3. 执行数据库迁移并启动

```powershell
pnpm --filter @buildflow/api db:migrate
pnpm dev
```

打开 <http://127.0.0.1:5173>。开发时 Vite 会代理 `/api` 到 Fastify API。

## 常用命令

```powershell
# TypeScript 类型检查
pnpm typecheck

# 生产构建
pnpm build

# API 集成 QA：会创建并清理临时账户与项目
pnpm --filter @buildflow/api qa

# 生成 Drizzle migration（模型变更时使用）
pnpm --filter @buildflow/api db:generate

# 执行 Drizzle migration
pnpm --filter @buildflow/api db:migrate
```

质量记录见 [docs/qa-checklist.md](docs/qa-checklist.md)。

## 数据模型与持久化范围

| 数据 | 作用 |
| --- | --- |
| 用户 | 邮箱、密码哈希、创建时间。 |
| 项目 | 所属用户、原始产品需求、当前版本。 |
| 生成任务 | 任务状态、持久化 Agent 日志和失败信息。 |
| 项目版本 | 不可变的应用规格、初始需求与优化需求。 |
| 生成文件 | 每个版本的文件路径、语言和文件内容。 |
| 预览状态 | 版本级受控交互状态，用于刷新与版本恢复。 |

## 部署

仓库提供 `Dockerfile`：构建共享契约、API 与 Web 后，将前端静态文件与 API 放入同一个运行镜像。启动时会先执行数据库迁移，再启动 Fastify 服务。

以 Render 为例：

1. 将仓库连接为 Web Service，运行环境选择 Docker。
2. 选择免费实例可满足面试演示；注意冷启动和海外网络访问速度。
3. 在平台环境变量中配置 `DATABASE_URL`、`JWT_SECRET`、`DEEPSEEK_API_KEY`（可选）和 `DEEPSEEK_MODEL`。
4. 不上传 `.env`，也不要在前端环境变量中设置上述密钥。
5. 部署完成后，用一个新账户走完整演示路径：注册 → 生成 → 预览交互 → 刷新 → 优化/恢复 → 退出。

更详细的操作说明见 [docs/deployment-guide.md](docs/deployment-guide.md)。

## 已完成与未完成边界

### 已完成

- 邮箱注册、登录、退出和项目归属鉴权。
- PostgreSQL 持久化、Drizzle migration、单项目并发生成限制。
- DeepSeek 服务端两阶段生成、多文件产物校验、质量门槛与透明 fallback。
- 生成文件树、隔离预览、预览状态持久化、自然语言优化、版本查看和恢复。
- Docker 构建与单来源生产部署结构。

### 当前未覆盖

- 任意服务器代码执行、包安装、生成子应用后端或子应用一键部署。
- 多人协作、公开分享、评论、支付、插件、GitHub 同步。
- 完整模型思维链展示或无限制的多 Agent 编排。

后续扩展会优先保证公网主链路稳定（错误监控、限流、重试、部署冒烟），再提高长任务可靠性与生成质量，最后才扩展协作和生态。完整优先级说明见 [docs/project-overview.md](docs/project-overview.md)。

## 项目结构

```text
apps/
  api/                  Fastify API、Drizzle schema、生成与认证逻辑
  web/                  React/Vite 前端
packages/
  contracts/            前后端共享 Zod 契约与 TypeScript 类型
docs/                   产品规格、设计决策、QA、部署和演示材料
Dockerfile              单服务生产镜像
```

## 面试演示建议

演示时建议强调四点：

1. 这是真实的认证、API、数据库和交互预览，而不是静态页面。
2. 生成过程与文件产物可见、可验证，失败路径也透明。
3. 生成应用在浏览器沙箱运行，密钥和宿主应用数据保持隔离。
4. 自然语言优化、版本历史和恢复构成了主流程之外的延展能力。

---

如需了解设计取舍、评估维度映射和后续扩展路线，请阅读 [docs/project-overview.md](docs/project-overview.md)。
