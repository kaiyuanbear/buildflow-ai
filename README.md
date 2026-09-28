# BuildFlow AI

BuildFlow AI 是一个用于面试演示的 AI 应用构建器：用户输入产品想法，服务端调用 LLM 生成受约束的浏览器应用产物；页面同时展示真实的 Agent 事件、生成文件、隔离预览和可恢复的版本历史。

## 能力边界

- 支持注册、登录、私有项目、生成、重新生成、版本查看/恢复与预览状态持久化。
- LLM 只由 Fastify API 调用，浏览器和 Git 仓库均不接触 `DEEPSEEK_API_KEY`。
- 新产物为 7–12 个静态文件：`index.html`、`README.md`、`styles/*.css`、`src/*.js`，并由 manifest 决定加载顺序；旧四文件版本仍可预览。
- 预览仅在 `sandbox="allow-scripts"` 的 iframe 中运行。网络、外部资源、存储 API、父窗口访问、模块导入和服务端代码均被拒绝。
- 不支持执行任意生成代码、安装依赖、生成子应用后端或部署生成的子应用。

## 本地运行

前置条件：Node.js 22+、pnpm 10+、一个 PostgreSQL 数据库（例如 Supabase）。

```powershell
pnpm install --store-dir ".pnpm-store"
Copy-Item .env.example .env
# 在 .env 填入 DATABASE_URL、JWT_SECRET（至少 32 字符）
# 可选：填入 DEEPSEEK_API_KEY 和 DEEPSEEK_MODEL=deepseek-flash
pnpm --filter @buildflow/api db:migrate
pnpm dev
```

打开 `http://127.0.0.1:5173`。若未配置 DeepSeek，系统仍会生成清楚标识为“本地起步应用”的可交互降级产物。

## 验证命令

```powershell
pnpm typecheck
pnpm build
pnpm --filter @buildflow/api qa
```

API QA 会创建并清理临时账户/项目，覆盖认证、项目所有权、并发生成限制、版本、恢复、预览状态，以及多文件产物和安全/质量校验。

## 演示路径

1. 注册一个新账户，进入 Atoms 式首页。
2. 输入一个小型产品需求，例如“制作旅行行程编辑器”。
3. 在 Builder 左侧查看中文化、持久化的 Agent 执行事件；中间展开 `styles/` 与 `src/` 文件树；右侧操作 sandbox 预览。
4. 点击“继续描述优化需求”创建 v2，查看版本历史并恢复 v1。
5. 刷新页面，确认当前版本与预览状态仍存在。

详细讲解稿见 [docs/demo-script.md](docs/demo-script.md)，部署步骤见 [docs/deployment-guide.md](docs/deployment-guide.md)，完整质量证据见 [docs/qa-checklist.md](docs/qa-checklist.md)。

## 部署

仓库包含单服务 Dockerfile：构建 React、共享契约和 Fastify，启动时执行 Drizzle migration，再由 Fastify 在同一来源提供 API 与静态前端。将 `DATABASE_URL`、`JWT_SECRET` 和（可选）`DEEPSEEK_API_KEY` 配置为宿主机密变量；不要使用 `VITE_` 前缀，也不要提交 `.env`。

Render 免费实例可用于面试演示，但冷启动会增加首次访问等待时间。推送到 GitHub 后，等待 Render 部署成功，再使用一个新账户执行上方演示路径。
