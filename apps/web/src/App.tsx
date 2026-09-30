import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPreviewDocument, type PreviewBridgeMessage } from "./preview";

type User = { id: string; email: string };
type Project = { id: string; name: string; prompt: string; updatedAt: string };
type Mode = "login" | "register";
type HomeTab = "discover" | "projects" | "templates";
type ShowcaseItem = { title: string; description: string; eyebrow: string; tone: string };
type GeneratedFile = { path: string; language: string; contents: string };
type VersionSummary = { id: string; sequence: string; summary: string; createdAt: string; appSpec: { appName: string; tagline: string; features: string[]; artifactManifest?: { styles: string[]; scripts: string[] }; generationRequest?: { prompt: string; instruction?: string } } };
type GenerationLog = { message: string; createdAt?: string; stage?: string; phase?: string; kind?: string; status?: "pending" | "active" | "succeeded" | "failed" | "skipped"; target?: string };
type GenerationJob = { id: string; versionId: string | null; status: "queued" | "running" | "completed" | "failed"; stage: string | null; logs: GenerationLog[]; failureReason: string | null; createdAt: string };
type Workspace = {
  project: { currentVersionId: string | null };
  job: GenerationJob | null;
  jobs: GenerationJob[];
  version: VersionSummary | null;
  files: GeneratedFile[];
  previewState: Record<string, unknown>;
};

const phaseLabels: Record<string, string> = { analysis: "需求分析", planning: "方案规划", generation: "应用生成", validation: "校验与验证", persistence: "结果保存", activity: "执行记录", queued: "等待执行" };
const eventKindLabels: Record<string, string> = { status: "任务状态", model_request: "调用模型", model_response: "模型返回", validation: "质量校验", file_write: "写入文件", version_save: "保存版本", preview_ready: "预览就绪" };

const legacyTimelineMessages: Record<string, string> = {
  "Received the product request and created an Agent generation task.": "已接收产品需求，已创建 Agent 生成任务。",
  "Applied the browser-only preview and safety constraints.": "已应用浏览器预览与安全约束。",
  "Requesting an application blueprint from the AI model.": "正在请求 AI 生成应用蓝图。",
  "Validated the application structure, interactions, and visual direction.": "已校验应用结构、交互设计与视觉方向。",
  "Requesting browser-only source files from the AI model.": "正在请求 AI 生成浏览器端源文件。",
  "Requesting one bounded safety repair for the generated artifact.": "检测到约束问题，正在请求一次受限修复。",
  "Prepared files for isolated preview execution.": "已准备隔离预览所需文件。",
  "Created an immutable project version for the validated artifact.": "已为通过校验的产物创建不可变版本。",
  "Initialized isolated preview state and made this version current.": "已初始化隔离预览状态，并设为当前版本。"
};

function displayTimelineMessage(message: string) { return legacyTimelineMessages[message] ?? message; }

function displayTimelineTarget(target?: string) {
  if (!target) return target;
  const labels: Record<string, string> = {
    "application blueprint": "应用蓝图",
    "index.html, styles.css, app.js": "index.html、styles.css、app.js",
    "4 generated files": "4 个生成文件",
    "7-12 generated files": "7–12 个生成文件",
    "7–12 generated files": "7–12 个生成文件",
    "structural and safety validation": "结构与安全校验",
    "quality validation": "质量校验"
  };
  return labels[target] ?? target;
}

function FileTree({ files, selectedPath, onSelect }: { files: GeneratedFile[]; selectedPath?: string; onSelect: (path: string) => void }) {
  const roots = files.filter((file) => !file.path.includes("/"));
  const groups = new Map<string, GeneratedFile[]>();
  files.filter((file) => file.path.includes("/")).forEach((file) => {
    const [directory] = file.path.split("/");
    if (!directory) return;
    const items = groups.get(directory) ?? [];
    items.push(file);
    groups.set(directory, items);
  });
  const item = (entry: GeneratedFile, nested = false) => <button className={selectedPath === entry.path ? "file-active" : "file-item"} key={entry.path} onClick={() => onSelect(entry.path)}><span className="file-icon">{entry.language.toUpperCase()}</span><span className={nested ? "file-name file-name-nested" : "file-name"}>{nested ? entry.path.split("/").at(-1) : entry.path}</span></button>;
  return <div className="file-tree">{roots.map((entry) => item(entry))}{[...groups.entries()].map(([directory, entries]) => <details className="file-group" key={directory} open><summary><span>▾</span><b>{directory}/</b><small>{entries.length}</small></summary>{entries.map((entry) => item(entry, true))}</details>)}</div>;
}

const discoverSamples: ShowcaseItem[] = [
  { title: "玄机命理网页", description: "沉浸式东方美学的交互首页。", eyebrow: "INTERACTIVE SITE", tone: "ink" },
  { title: "2048 游戏开发请求", description: "简洁、专注的数字合并游戏。", eyebrow: "MINI GAME", tone: "sand" },
  { title: "贪吃蛇游戏生成请求", description: "带有计分面板的复古小游戏。", eyebrow: "ARCADE", tone: "plum" },
  { title: "城市探索地图", description: "用地图和清单发现附近灵感。", eyebrow: "CITY GUIDE", tone: "sky" },
  { title: "果园消消乐", description: "明快的水果主题益智界面。", eyebrow: "CASUAL GAME", tone: "berry" },
  { title: "个人效率面板", description: "在一个页面整理目标与进度。", eyebrow: "PRODUCTIVITY", tone: "mint" },
];

const templateSamples: ShowcaseItem[] = [
  { title: "PhosMedia 网站应用创意", description: "影音内容与推荐卡片布局。", eyebrow: "MEDIA", tone: "midnight" },
  { title: "乡村餐饮与农场商店", description: "餐厅、菜单与预约信息页。", eyebrow: "HOSPITALITY", tone: "meadow" },
  { title: "材料与维修中心", description: "编辑感强的资源展示页面。", eyebrow: "COLLECTION", tone: "linen" },
  { title: "手工咖啡烘焙坊网站", description: "带有温度的品牌故事落地页。", eyebrow: "COFFEE", tone: "roast" },
  { title: "通用搜索与操作", description: "搜索、筛选与行动清单界面。", eyebrow: "WORKSPACE", tone: "neon" },
  { title: "小团体静修之旅", description: "安静克制的旅行活动网站。", eyebrow: "JOURNEY", tone: "coast" },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "请求失败，请稍后重试");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function projectIdFromPath() {
  return window.location.pathname.match(/^\/projects\/([\w-]+)$/)?.[1] ?? null;
}

export function App() {
  const [user, setUser] = useState<User | null>(null); const [mode, setMode] = useState<Mode>("login"); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [error, setError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(projectIdFromPath); const [activeProject, setActiveProject] = useState<Project | null>(null); const [generationRequestedFor, setGenerationRequestedFor] = useState<string | null>(null);
  useEffect(() => { request<{ user: User }>("/api/auth/me").then((data) => setUser(data.user)).catch(() => undefined); const onPopState = () => { setActiveProject(null); setActiveProjectId(projectIdFromPath()); setGenerationRequestedFor(null); }; window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  useEffect(() => { if (!user || !activeProjectId || activeProject?.id === activeProjectId) return; request<{ project: Project }>(`/api/projects/${activeProjectId}`).then((data) => setActiveProject(data.project)).catch(() => { window.history.replaceState({}, "", "/"); setActiveProjectId(null); }); }, [user, activeProjectId, activeProject?.id]);
  function openProject(project: Project, startGeneration = false) { window.history.pushState({}, "", `/projects/${project.id}`); setActiveProjectId(project.id); setActiveProject(project); setGenerationRequestedFor(startGeneration ? project.id : null); }
  function changeMode(nextMode: Mode) { setMode(nextMode); setPassword(""); setConfirmPassword(""); setError(null); }
  async function auth(event: FormEvent) { event.preventDefault(); setError(null); if (mode === "register" && password !== confirmPassword) { setError("两次输入的密码不一致"); return; } try { const data = await request<{ user: User }>(`/api/auth/${mode === "login" ? "login" : "register"}`, { method: "POST", body: JSON.stringify({ email, password }) }); setUser(data.user); } catch (reason) { setError(reason instanceof Error ? reason.message : "认证失败"); } }
  if (!user) return <main className="landing-shell"><section className="hero-card auth-card"><p className="eyebrow">BUILD FLOW AI</p><h1>把想法变成产品。</h1><p className="lede">从一句产品描述，生成可查看、可交互的前端应用。</p><div className="mode-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>登录</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>注册</button></div><form onSubmit={auth}><label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>密码<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>{mode === "register" && <label>确认密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button">{mode === "login" ? "登录" : "创建账户"}</button></form></section></main>;
  if (activeProjectId && !activeProject) return <main className="loading-shell">正在打开项目…</main>;
  return activeProject ? <Builder project={activeProject} startGeneration={generationRequestedFor === activeProject.id} onGenerationStarted={() => setGenerationRequestedFor(null)} back={() => { window.history.pushState({}, "", "/"); setActiveProjectId(null); setActiveProject(null); setGenerationRequestedFor(null); }} /> : <Home user={user} onProjectReady={openProject} logout={async () => { await request<void>("/api/auth/logout", { method: "POST", body: "{}" }); setUser(null); }} />;
}

function LegacyHome({ user, logout, onProjectReady }: { user: User; logout: () => Promise<void>; onProjectReady: (project: Project, startGeneration?: boolean) => void }) {
  const [projects, setProjects] = useState<Project[]>([]); const [prompt, setPrompt] = useState(""); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [activeTab, setActiveTab] = useState<HomeTab>("discover"); const galleryRef = useRef<HTMLElement>(null);
  const load = () => request<{ projects: Project[] }>("/api/projects").then((data) => setProjects(data.projects)); useEffect(() => { load().catch(() => setError("项目加载失败")); }, []);
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { const name = prompt.length > 26 ? `${prompt.slice(0, 26)}…` : prompt; const data = await request<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify({ name, prompt }) }); setPrompt(""); onProjectReady(data.project, true); } catch (reason) { setError(reason instanceof Error ? reason.message : "创建项目失败"); } finally { setSaving(false); } }
  function selectTab(tab: HomeTab) { setActiveTab(tab); window.requestAnimationFrame(() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  const samples = activeTab === "discover" ? discoverSamples : templateSamples;
  return <main className="atoms-shell"><aside className="sidebar"><div className="brand">◉ <b>BuildFlow AI</b></div><div className="account">{user.email}</div><nav><button type="button" className={activeTab === "discover" ? "nav-active" : ""} onClick={() => selectTab("discover")}>⌂ 首页</button><button type="button" className={activeTab === "templates" ? "nav-active" : ""} onClick={() => selectTab("templates")}>◌ 资源</button><button type="button" className={activeTab === "projects" ? "nav-active" : ""} onClick={() => selectTab("projects")}>▣ 我的项目</button></nav><p className="nav-caption">最近</p>{projects.slice(0, 5).map((project) => <button className="recent" key={project.id} onClick={() => onProjectReady(project)}>◌ {project.name}</button>)}<button className="signout" onClick={logout}>退出登录</button></aside><section className="atoms-home"><p className="notice">BuildFlow AI · 让智能体团队实现你的想法</p><h1>输入想法，产出产品。</h1><p className="home-subtitle">开始吧，{user.email.split("@")[0]}。</p><form className="prompt-box" onSubmit={create}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：为我制作一个简单的简历生成应用" minLength={10} required /><footer><span>✦ AI 生成浏览器应用</span><button className="send-button" disabled={saving}>{saving ? "构建中…" : "↑ 开始构建"}</button></footer></form>{error && <p className="form-error" role="alert">{error}</p>}<section className="discover" ref={galleryRef}><div className="discover-head"><div className="home-tabs"><button type="button" className={activeTab === "discover" ? "home-tab-active" : ""} onClick={() => selectTab("discover")}>发现</button><button type="button" className={activeTab === "projects" ? "home-tab-active" : ""} onClick={() => selectTab("projects")}>我的项目</button><button type="button" className={activeTab === "templates" ? "home-tab-active" : ""} onClick={() => selectTab("templates")}>模板</button></div><span className="gallery-hint">{activeTab === "projects" ? "已生成的应用" : "示例展示"}</span></div>{activeTab === "projects" ? <div className="showcase-grid project-showcase-grid">{projects.length ? projects.map((project, index) => <button type="button" className={`project-showcase tone-${["ink", "sky", "plum", "meadow"][index % 4]}`} key={project.id} onClick={() => onProjectReady(project)}><div className="showcase-thumb"><span>GENERATED APP</span><strong>{project.name}</strong><p>{project.prompt}</p></div><footer><b>{project.name}</b><span>{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</span></footer></button>) : <p className="gallery-empty">还没有生成项目。输入上方的想法后，第一个应用会显示在这里。</p>}</div> : <div className="showcase-grid">{samples.map((sample) => <article className="showcase-card" key={sample.title}><div className={`showcase-thumb tone-${sample.tone}`}><span>{sample.eyebrow}</span><strong>{sample.title}</strong><p>{sample.description}</p></div><footer><b>{sample.title}</b><span>{sample.description}</span></footer></article>)}</div>}</section></section></main>;
}

function Home({ user, logout, onProjectReady }: { user: User; logout: () => Promise<void>; onProjectReady: (project: Project, startGeneration?: boolean) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeTab>("discover");
  const galleryRef = useRef<HTMLElement>(null);
  const load = () => request<{ projects: Project[] }>("/api/projects").then((data) => setProjects(data.projects));

  useEffect(() => { load().catch(() => setError("项目加载失败")); }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const name = prompt.length > 26 ? `${prompt.slice(0, 26)}…` : prompt;
      const data = await request<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify({ name, prompt }) });
      setPrompt("");
      onProjectReady(data.project, true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "创建项目失败"); } finally { setSaving(false); }
  }
  function selectTab(tab: HomeTab) {
    setActiveTab(tab);
    window.requestAnimationFrame(() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const samples = activeTab === "discover" ? discoverSamples : templateSamples;

  return <main className="atoms-shell">
    <aside className="sidebar">
      <div className="brand">◉ <b>BuildFlow AI</b></div>
      <div className="account">{user.email}</div>
      <nav>
        <button type="button" className={activeTab === "discover" ? "nav-active" : ""} onClick={() => selectTab("discover")}>⌂ 首页</button>
        <button type="button" className={activeTab === "templates" ? "nav-active" : ""} onClick={() => selectTab("templates")}>◌ 资源</button>
        <button type="button" className={activeTab === "projects" ? "nav-active" : ""} onClick={() => selectTab("projects")}>▣ 我的项目</button>
      </nav>
      <p className="nav-caption">最近</p>
      <div className="recent-projects" aria-label="最近项目">
        {projects.map((project) => <button className="recent" key={project.id} title={project.prompt} aria-label={`打开项目：${project.prompt}`} onClick={() => onProjectReady(project)}>◌ {project.name}</button>)}
      </div>
      <button className="signout" onClick={logout}>退出登录</button>
    </aside>
    <section className="atoms-home">
      <p className="notice">BuildFlow AI · 让智能体团队实现你的想法</p>
      <h1>输入想法，产出产品。</h1>
      <p className="home-subtitle">开始吧，{user.email.split("@")[0]}。</p>
      <form className="prompt-box" onSubmit={create}>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：为我制作一个简单的简历生成应用" minLength={10} required />
        <footer><span>✦ AI 生成浏览器应用</span><button className="send-button" disabled={saving}>{saving ? "构建中…" : "↑ 开始构建"}</button></footer>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="discover" ref={galleryRef}>
        <div className="discover-head"><div className="home-tabs"><button type="button" className={activeTab === "discover" ? "home-tab-active" : ""} onClick={() => selectTab("discover")}>发现</button><button type="button" className={activeTab === "projects" ? "home-tab-active" : ""} onClick={() => selectTab("projects")}>我的项目</button><button type="button" className={activeTab === "templates" ? "home-tab-active" : ""} onClick={() => selectTab("templates")}>模板</button></div><span className="gallery-hint">{activeTab === "projects" ? "已生成的应用" : "示例展示"}</span></div>
        {activeTab === "projects" ? <div className="showcase-grid project-showcase-grid">{projects.length ? projects.map((project, index) => <button type="button" className={`project-showcase tone-${["ink", "sky", "plum", "meadow"][index % 4]}`} key={project.id} onClick={() => onProjectReady(project)}><div className="showcase-thumb"><span>GENERATED APP</span><strong>{project.name}</strong><p>{project.prompt}</p></div><footer><b>{project.name}</b><span>{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</span></footer></button>) : <p className="gallery-empty">还没有生成项目。输入上方的想法后，第一个应用会显示在这里。</p>}</div> : <div className="showcase-grid">{samples.map((sample) => <article className="showcase-card" key={sample.title}><div className={`showcase-thumb tone-${sample.tone}`}><span>{sample.eyebrow}</span><strong>{sample.title}</strong><p>{sample.description}</p></div><footer><b>{sample.title}</b><span>{sample.description}</span></footer></article>)}</div>}
      </section>
    </section>
  </main>;
}

function Builder({ project, back, startGeneration, onGenerationStarted }: { project: Project; back: () => void; startGeneration: boolean; onGenerationStarted: () => void }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(startGeneration);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const generationLaunchRef = useRef(false);

  const refresh = useCallback(async (versionId: string | null = selectedVersionId) => {
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
    const next = await request<Workspace>(`/api/projects/${project.id}/workspace${query}`);
    setData(next);
    return next;
  }, [project.id, selectedVersionId]);
  const refreshVersions = useCallback(async () => {
    const next = await request<{ versions: VersionSummary[] }>(`/api/projects/${project.id}/versions`);
    setVersions(next.versions);
    return next.versions;
  }, [project.id]);

  useEffect(() => { refresh().catch(() => setPreviewError("工作台加载失败")); }, [refresh]);
  useEffect(() => { refreshVersions().catch(() => setPreviewError("版本历史加载失败")); }, [refreshVersions]);

  const runGeneration = useCallback(async (nextInstruction?: string) => {
    setPreviewError(null);
    setIsGenerating(true);
    setSelectedVersionId(null);
    try {
      await request(`/api/projects/${project.id}/generate`, { method: "POST", body: JSON.stringify(nextInstruction ? { instruction: nextInstruction } : {}) });
      await Promise.all([refresh(null), refreshVersions()]);
    } catch (reason) {
      setPreviewError(reason instanceof Error ? reason.message : "生成失败，请重试");
      await Promise.all([refresh(null).catch(() => undefined), refreshVersions().catch(() => undefined)]);
    } finally { setIsGenerating(false); }
  }, [project.id, refresh, refreshVersions]);

  useEffect(() => { if (!startGeneration || generationLaunchRef.current) return; generationLaunchRef.current = true; onGenerationStarted(); void runGeneration(); }, [startGeneration, onGenerationStarted, runGeneration]);
  useEffect(() => {
    if (!isGenerating) return;
    const timer = window.setInterval(() => {
      refresh(null).then((next) => {
        if (next.job?.status === "completed" || next.job?.status === "failed") {
          setIsGenerating(false);
          void refreshVersions();
        }
      }).catch(() => undefined);
    }, 900);
    return () => window.clearInterval(timer);
  }, [isGenerating, refresh, refreshVersions]);

  async function selectVersion(versionId: string | null) {
    if (isGenerating) return;
    setPreviewError(null);
    setSelectedVersionId(versionId);
    setFile(null);
    try { await refresh(versionId); } catch (reason) { setPreviewError(reason instanceof Error ? reason.message : "版本加载失败"); }
  }
  async function restoreVersion(versionId: string) {
    if (isGenerating) return;
    setPreviewError(null);
    try {
      await request(`/api/projects/${project.id}/versions/${versionId}/restore`, { method: "POST", body: "{}" });
      setSelectedVersionId(null);
      setFile(null);
      await Promise.all([refresh(null), refreshVersions()]);
    } catch (reason) { setPreviewError(reason instanceof Error ? reason.message : "恢复版本失败"); }
  }
  function optimize(event: FormEvent) {
    event.preventDefault();
    const nextInstruction = instruction.trim();
    if (!nextInstruction || isGenerating) return;
    setInstruction("");
    void runGeneration(nextInstruction);
  }

  const selected = data?.files.find((item) => item.path === file) ?? data?.files[0];
  // The iframe owns live interaction state after its initial mount. Rebuilding
  // srcDoc for every successful state-save reloads the entire sandbox and
  // returns the user to the top of the generated page. A new version or a new
  // artifact still intentionally creates a new preview with its saved state.
  const document = useMemo(() => buildPreviewDocument(data?.files ?? [], data?.previewState ?? {}, data?.version?.appSpec.artifactManifest), [data?.files, data?.version?.id, data?.version?.appSpec.artifactManifest]);
  useEffect(() => { setPreviewError(null); }, [document]);
  useEffect(() => {
    const versionId = data?.version?.id;
    let pendingState: Record<string, unknown> | null = null;
    let saveTimer: number | undefined;
    let saving = false;

    const flushPreviewState = () => {
      if (saving || !pendingState || !versionId) return;
      const state = pendingState;
      pendingState = null;
      saving = true;
      request(`/api/projects/${project.id}/versions/${versionId}/preview-state`, { method: "PUT", body: JSON.stringify(state) })
        .catch(() => setPreviewError("预览状态保存失败"))
        .finally(() => {
          saving = false;
          if (pendingState) flushPreviewState();
        });
    };

    const onMessage = (event: MessageEvent) => {
      const payload = event.data as PreviewBridgeMessage | undefined;
      if (event.source !== frameRef.current?.contentWindow || payload?.source !== "buildflow-preview") return;
      if (payload.type === "runtime-error") {
        const location = payload.filename ? ` (${payload.filename}${payload.line ? `:${payload.line}${payload.column ? `:${payload.column}` : ""}` : ""})` : "";
        setPreviewError(`预览运行错误：${payload.message ?? "未知错误"}${location}`);
        return;
      }
      if (payload.type !== "save-state" || !payload.state || typeof payload.state !== "object" || Array.isArray(payload.state) || !versionId) return;
      pendingState = payload.state;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flushPreviewState, 240);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(saveTimer);
    };
  }, [project.id, data?.version?.id]);

  const isHistoricalVersion = Boolean(data?.version && data.version.id !== data.project.currentVersionId);
  const statusText = isGenerating || data?.job?.status === "running" ? "智能体正在构建应用" : data?.job?.status === "failed" ? "构建失败" : data?.version ? "构建完成" : "等待构建";
  return <main className="workspace"><header className="workspace-head"><button className="quiet-button" onClick={back}>← 首页</button><b>{data?.version?.appSpec.appName ?? project.name}</b><span className={isGenerating ? "workspace-status workspace-status-working" : "workspace-status"}>{statusText}</span></header><section className="workspace-grid"><aside className="agent-panel"><p className="eyebrow">AGENT 执行过程</p><h3>{statusText}</h3>{data?.job?.logs.map((log, index) => { const phase = log.phase ?? log.stage ?? "activity"; const active = log.status === "active" || (isGenerating && index === (data.job?.logs.length ?? 0) - 1); const failed = log.status === "failed"; return <div className={`timeline ${active ? "timeline-active" : ""} ${failed ? "timeline-failed" : ""}`} key={`${phase}-${log.target ?? ""}-${index}`}><b>{failed ? "!" : active ? "•" : "✓"}</b><div><small>{phaseLabels[phase] ?? phase}{log.kind ? ` · ${eventKindLabels[log.kind] ?? log.kind}` : ""}</small><p>{displayTimelineMessage(log.message)}</p>{log.target && <span className="timeline-target">{displayTimelineTarget(log.target)}</span>}</div></div>; })}{isGenerating && !data?.job && <div className="timeline timeline-active"><b>•</b><div><small>等待执行</small><p>正在创建 Agent 任务…</p></div></div>}{data?.job?.status === "failed" && <button className="retry-button" onClick={() => void runGeneration()}>重新尝试生成</button>}<form className="composer" onSubmit={optimize}><input value={instruction} onChange={(event) => setInstruction(event.target.value)} disabled={isGenerating} maxLength={2000} placeholder="继续描述优化需求，生成新版本" /><button disabled={isGenerating || !instruction.trim()} aria-label="生成优化版本">↑</button></form></aside><section className="file-panel"><div className="panel-title">生成文件 <span>版本 {data?.version?.sequence ?? "—"}</span></div><div className="version-history"><div className="version-history-head"><b>版本历史</b>{selectedVersionId && <button onClick={() => void selectVersion(null)} disabled={isGenerating}>查看当前</button>}</div>{versions.length ? <div className="version-list">{versions.map((version) => <button className={data?.version?.id === version.id ? "version-active" : "version-item"} key={version.id} onClick={() => void selectVersion(version.id)} disabled={isGenerating}><span>v{version.sequence} · {version.appSpec.appName}</span>{data?.project.currentVersionId === version.id && <small>当前</small>}</button>)}</div> : <p className="panel-placeholder">生成后会保留每一次可恢复的版本。</p>}</div>{isHistoricalVersion && data?.version && <button className="restore-button" onClick={() => void restoreVersion(data.version!.id)} disabled={isGenerating}>恢复此版本为当前版本</button>}{isGenerating && !data?.files.length ? <p className="panel-placeholder">Agent 正在写入应用文件…</p> : <FileTree files={data?.files ?? []} selectedPath={selected?.path} onSelect={setFile} />}<pre className="source-view"><code>{selected?.contents ?? (isGenerating ? "生成完成后可查看源文件。" : "尚未生成文件。")}</code></pre></section><section className="viewer"><div className="panel-title"><span>应用查看器 {data?.version ? `· v${data.version.sequence}` : ""}</span><span>{data?.version?.appSpec.tagline ?? "等待生成应用"}</span></div>{previewError && <p className="task-error">{previewError}</p>}{isGenerating && !data?.version ? <div className="preview-loading"><span className="loading-orb" /><h3>正在构建应用预览</h3><p>Agent 将在完成验证后加载生成结果。</p></div> : <iframe ref={frameRef} className="app-preview" sandbox="allow-scripts" referrerPolicy="no-referrer" title="生成应用预览" srcDoc={document} />}</section></section></main>;
}
