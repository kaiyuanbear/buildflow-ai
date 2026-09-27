from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table,
    TableStyle, KeepTogether,
)

OUT = Path(r"D:\projects\BuildFlow AI\output\pdf\卢志超-高级全栈工程师（前端方向）-RunSun版-修订.pdf")
OUT.parent.mkdir(parents=True, exist_ok=True)

FONT = r"C:\Windows\Fonts\msyh.ttc"
pdfmetrics.registerFont(TTFont("YaHei", FONT, subfontIndex=0))
pdfmetrics.registerFont(TTFont("YaHeiBold", FONT, subfontIndex=0))

NAVY = colors.HexColor("#172B4D")
BLUE = colors.HexColor("#2563A8")
SLATE = colors.HexColor("#43536A")
LIGHT = colors.HexColor("#F1F5F9")
LINE = colors.HexColor("#CBD5E1")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Name", fontName="YaHeiBold", fontSize=22, leading=28, textColor=NAVY, spaceAfter=2))
styles.add(ParagraphStyle(name="Role", fontName="YaHei", fontSize=11, leading=16, textColor=BLUE, spaceAfter=9))
styles.add(ParagraphStyle(name="Contact", fontName="YaHei", fontSize=9, leading=13, textColor=SLATE))
styles.add(ParagraphStyle(name="Section", fontName="YaHeiBold", fontSize=12, leading=18, textColor=NAVY, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="Body", fontName="YaHei", fontSize=8.8, leading=14, textColor=colors.HexColor("#1F2937"), spaceAfter=3))
styles.add(ParagraphStyle(name="Skill", fontName="YaHei", fontSize=8.35, leading=12.8, textColor=colors.HexColor("#1F2937"), leftIndent=9, firstLineIndent=-9, spaceAfter=2))
styles.add(ParagraphStyle(name="ProjTitle", fontName="YaHeiBold", fontSize=10.2, leading=15, textColor=NAVY))
styles.add(ParagraphStyle(name="Meta", fontName="YaHei", fontSize=8.5, leading=13, textColor=SLATE, spaceAfter=3))
styles.add(ParagraphStyle(name="BulletBody", fontName="YaHei", fontSize=8.5, leading=13.2, textColor=colors.HexColor("#1F2937"), leftIndent=10, firstLineIndent=-10, spaceAfter=1.5))
styles.add(ParagraphStyle(name="Small", fontName="YaHei", fontSize=8, leading=12, textColor=SLATE))


def p(text, style="Body"):
    return Paragraph(text, styles[style])


def bullets(items):
    return [p("• " + x, "BulletBody") for x in items]


def section(title):
    return [Spacer(1, 2), p(title, "Section")]


def project(title, dates, stack, intro, items):
    header = Table([[p(title, "ProjTitle"), p(dates, "Meta")]], colWidths=[128 * mm, 47 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, LINE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    flow = [header, p("技术栈：" + stack, "Meta"), p("项目简介：" + intro, "Body")]
    flow.extend(bullets(items))
    flow.append(Spacer(1, 5))
    return [KeepTogether(flow)]


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.35)
    canvas.line(18 * mm, 12 * mm, 192 * mm, 12 * mm)
    canvas.setFont("YaHei", 7.5)
    canvas.setFillColor(SLATE)
    canvas.drawString(18 * mm, 7.5 * mm, "卢志超  |  高级全栈工程师（前端方向）")
    canvas.drawRightString(192 * mm, 7.5 * mm, f"第 {doc.page} 页")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
    topMargin=15 * mm, bottomMargin=17 * mm,
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="resume", frames=[frame], onPage=on_page)])

story = []
story.extend([
    p("卢志超", "Name"),
    p("高级全栈工程师（前端方向）", "Role"),
    p("男  |  11 年 Web 研发经验  |  13577198684  |  49461753@qq.com  |  英语六级", "Contact"),
])
story.extend(section("个人概述"))
story.append(p("11 年 Web 研发经验，具备企业级管理平台、桌面端与移动端项目的架构及交付经验；拥有 3 年 10 人前端团队管理经验。长期负责复杂业务界面、设计系统与组件库、数据可视化、权限体系、性能及稳定性治理。熟悉 Node.js 服务端开发，具备 Go 服务开发和维护经验，可参与 API/数据结构设计、鉴权、接口联调、服务排障及 BFF 开发；熟悉 AI Coding 工程化实践，可在小团队中推进端到端交付。"))
story.extend(section("专业技能"))
skills = [
    "熟悉 TypeScript、JavaScript、HTML、CSS，理解浏览器渲染机制、V8 与 Web 性能分析方法，具备复杂 Web 应用的性能优化和稳定性治理能力。",
    "熟悉 Vue 3、React 及其生态，具备企业级后台、研发协同平台、桌面端及移动端应用的架构设计、持续迭代与维护经验。",
    "具备大型前端项目架构与工程化建设经验：模块划分、路由与状态管理、接口层设计、构建发布、代码规范、质量保障、脚手架及组件库建设。",
    "具备复杂管理控制台开发经验，可处理多角色、按钮级权限、长流程任务、异常重试、状态反馈和复杂表单等场景；熟悉前后端权限策略协同。",
    "熟悉 ECharts 及数据可视化，具备仪表盘、统计分析、大型数据表格与流程图开发经验；有万级数据虚拟滚动与渲染优化实践。",
    "具备 Design System 与业务组件库建设经验，可完成组件抽象、API 设计、交互规范、文档站、版本发布与跨项目推广。",
    "熟悉 HTTP、RESTful API、WebSocket、SSE、JSON Schema 与 JSON-RPC 2.0；可参与 API 契约、数据结构、异常处理、鉴权与接口联调设计。",
    "熟悉 Node.js 服务端开发，具备 Go（Gin、MongoDB、Redis）服务开发和维护经验；可承担 BFF/后端接口开发、认证接入、问题排查及服务发布验证。Python 可用于 AI 应用与服务开发。",
    "熟练使用 Codex、Cursor 等 AI Coding 工具，具备将代码生成、重构迁移、测试校验、文档沉淀和研发规范纳入工程流程的实践经验；可阅读英文技术文档并进行日常技术沟通。",
]
story.extend([p(f"{i + 1}. {x}", "Skill") for i, x in enumerate(skills)])
story.extend(section("工作经历"))
story.extend(project("完美世界股份有限公司  |  架构师", "2023.10 - 至今", "Vue 3、React、TypeScript、Electron、ECharts、Go、Gin、MongoDB、Redis", "负责企业内部研发协同、即时通信、DevOps 发布及管理系统的前端架构与交付，覆盖复杂流程编排、可视化看板、权限协同、组件体系、桌面端稳定性治理及后端服务协作。", [
    "领导并管理 10 人前端团队，负责技术方案评审、排期协作、任务分配、质量把控、人员培养与团队发展规划，推动团队整体效率提升 30% 以上。",
    "主导多个核心系统的架构设计与持续迭代，建设组件库、脚手架、编码/提交规范、构建发布及 Code Review 机制，新项目搭建周期缩短约 40%。",
    "参与 Go 服务迁移与日常迭代，完成接口开发、认证接入、服务适配、问题排查与发布验证，支撑前后端协同交付。",
    "推动 AI Coding 工作流工程化落地，覆盖代码生成、迁移重构、规范自查、问题定位和文档沉淀。",
]))
story.extend(project("美团闪购  |  资深前端工程师", "2022.05 - 2023.09", "React、TypeScript、React Native、Ant Design、Jotai", "负责商家电商管理、仓配及配送支持平台的 Web 与 App 核心业务开发。", [
    "负责商品、库存、物流等商家管理后台核心模块的开发与维护；围绕复杂规格配置、表单状态与跨端一致性进行模块化重构，相关功能代码量减少约 60%。",
    "从 0 到 1 建设 React Native 业务组件库 Flower 与文档站，统一组件 API、交互规范、发布流程和跨端使用标准，核心组件在移动端项目接入率超过 70%。",
    "针对关键页面实施页面维度重构与渲染优化，首屏加载时间平均优化 33%。",
]))
story.extend(project("京东商业提升事业部  |  前端开发工程师", "2018.03 - 2022.03", "Vue、Vuex、Element UI、ECharts、Webpack", "负责广告投放、效果跟踪、舆情监控及调研平台等企业级后台系统研发。", [
    "建设高复用业务组件及工具库，以配置化方式支持多场景复用，并实现按钮级权限控制。",
    "针对万级投放数据渲染卡顿实现虚拟滚动，仅渲染可视区域，将渲染耗时由 10 秒以上降至 800ms 内。",
    "优化 Webpack 增量编译与构建配置，将项目打包时间由约 3 分钟缩短至约 20 秒。",
]))
core_start = len(story)
story.extend(section("核心项目经历"))
story.extend(project("小智协同  企业研发协同与流程控制平台  |  前端架构师", "2024.04 - 至今", "Vue 3、TypeScript、ECharts、VueFlow、Pinia、Element Plus、Vite", "面向企业内部研发协同与流程控制场景的大型 Web 平台，为项目、任务、流程、版本及业务数据提供统一的可视化管理与协作能力。", [
    "负责平台前端架构与技术选型，完成项目分层、状态管理、路由组织、接口层及公共组件设计，支撑持续迭代。",
    "负责核心流程图模块，基于 VueFlow 实现节点、连线、缩放、拖拽、状态展示及交互控制，将复杂流程和任务进度可视化，降低用户理解与操作成本。",
    "完成统计、分布、排行等复杂看板与图表模块开发；抽象流程节点、状态标签、图表容器及筛选器等通用业务组件和页面模板。",
    "协同产品与后端处理接口契约、长任务、加载状态、失败重试和权限差异，保障复杂业务流程的稳定呈现。",
    "推进代码规范、组件复用、问题排查和 Code Review 机制，参与核心模块性能优化，提升多人协作效率与可维护性。",
]))
story.extend(project("小智协同 后端服务  |  全栈工程师", "2026.01 - 至今", "Go、Gin、MongoDB、Redis", "为任务、项目、团队、版本、视图和工作流等协同业务提供后端服务。", [
    "参与基于 Go 的服务开发、功能维护和业务问题排查，负责任务、版本、团队、视图及工作流相关接口的日常迭代和前后端联调。",
    "使用 Gin 完成 HTTP API 路由及业务接口开发，结合 MongoDB、Redis 完成数据访问和业务处理。",
    "按认证中心规范完成用户身份校验、权限上下文传递和会话续期；参与参数校验、异常处理、日志排查与服务发布验证。",
    "配合前端和 MCP Server，将任务、版本、视图等协同能力封装为标准化工具接口。",
]))
story.extend(project("团队前端基础设施建设  |  前端架构师", "2024.10 - 至今", "Rollup、TypeScript、Element Plus、Vue 3、ESLint、Prettier、Stylelint、Codex", "基于 Element Plus 二次封装团队业务组件体系，并建设 Vue 3 项目脚手架与 AI 辅助研发流程。", [
    "建设 Form、Modal、Table 等业务组件，统一交互行为、API 设计与使用规范，降低重复开发和二次接入成本。",
    "基于 Rollup、TypeScript 封装项目脚手架，统一目录结构、构建配置、代码风格、Git Hooks 与基础研发规范。",
    "制定 Vue 2 渐进式升级方案，结合 AI 工具完成代码分析、组件替换和迁移中的重复性工作。",
]))
story.extend(project("广告投放平台  |  前端开发工程师", "2019.10 - 2022.04", "Vue、Vuex、Vue Router、Element UI、ECharts、Webpack", "用于广告投放、效果跟踪和人群定位的业务平台。", [
    "抽象基础组件、业务组件与工具函数，并在组内多个项目推广使用，提升交付一致性。",
    "支持多维投放数据的图表呈现、筛选与高性能列表展示，完善权限和可观测业务操作体验。",
]))
story.extend(project("小智 IM 通信应用  |  前端架构师", "2023.10 - 至今", "Electron、React、TypeScript、Ant Design、React Native、WebSocket", "公司内部即时通信桌面端及移动端应用，服务于日常沟通、业务协作及内部系统集成。", [
    "参与会话、消息、通知、文件传输及内部系统集成等核心能力建设，保障桌面端稳定运行。",
    "针对启动缓慢、页面卡顿及内存增长问题，梳理主/渲染进程、窗口生命周期、IPC、监听器和定时器等高风险场景，推动性能治理。",
    "使用 Chrome DevTools、Heap Snapshot 分析对象引用链，建立关键内存点采集、异常上报及问题复盘机制，降低内存泄漏风险 30% 以上。",
    "维护 WebSocket 实时通信逻辑，处理弱网重连、心跳保活、消息确认、异常恢复及状态更新。",
]))
story.extend(project("智能游戏客服  |  Agent 工程师", "2026.02 - 至今", "Python、LangGraph、FastAPI、Redis、PostgreSQL、pgvector、OpenTelemetry", "面向游戏玩家的智能问答客服，覆盖知识问答、业务分流和人工客服协同。", [
    "负责 Agent 路由、状态流转和异常兜底策略设计，构建工作记忆、Redis 短期记忆与 PostgreSQL/pgvector 长期记忆的三层记忆系统。",
    "构建查询改写、向量召回、多路重排序和上下文注入的 RAG 链路，知识库检索准确率稳定至 92%。",
    "集成 OpenTelemetry 建设调用链路、耗时埋点和 Token 消耗监控，为故障定位和成本分析提供支撑。",
]))
story.extend(project("Agent 流程标准化与工程化建设  |  Agent 工程师", "2026.01 - 至今", "MCP、Node.js、JSON-RPC 2.0、JSON Schema、Codex", "面向 Codex 的 MCP 代理及远程工具接入系统，将研发协同与 DevOps 等内部系统能力封装为标准化工具。", [
    "设计 Codex、MCP 薄代理、远程 MCP Server、认证中心和业务系统之间的职责边界与调用链路。",
    "负责远程 MCP 服务的协议适配、工具注册、参数校验、统一响应和异常处理，确保符合 MCP 与 JSON-RPC 2.0 接入要求。",
    "基于 JSON Schema 设计工具描述和参数契约，统一命名、业务语义和调用约束；设计身份认证、权限校验和请求上下文传递方案。",
    "沉淀接入指南，覆盖服务端点、工具命名、参数定义、响应格式、鉴权、部署和验收流程。",
]))
core_blocks = story[core_start:]
story[core_start:] = core_blocks[:2] + [
    core_blocks[7],  # 智能游戏客服
    core_blocks[8],  # Agent 流程标准化与工程化建设
    core_blocks[6],  # 小智 IM 通信应用
    core_blocks[2],  # 小智协同
    core_blocks[3],  # 小智协同后端服务
    core_blocks[4],  # 团队前端基础设施建设
] + project("闪购商家平台商品模块  |  资深前端工程师", "2022.05 - 2023.08", "React、TypeScript、Ant Design、React Native", "美团到家事业群即时零售电商平台，为商家提供电商管理、仓配管理及配送支持服务。", [
    "负责商品管理、出入库管理、物流管理等核心模块开发与维护，保障核心业务稳定迭代。",
    "梳理复杂规格模块的状态和逻辑层级，分离业务逻辑与视觉实现；重构后相关功能代码量减少约 60%，降低维护复杂度。",
]) + project("Flower 基础组件库  |  资深前端工程师", "2022.11 - 2023.08", "React Native、TypeScript、Lodash", "团队 App 端统一使用的 React Native UI 组件库。", [
    "从0到1搭建组件库，负责技术选型、组件规划、命名规范、提交规范和发布流程设计。",
    "建设组件文档站，支持在线预览、API 文档与示例展示；建设 Form、BottomModal 等核心组件，减少业务表单重复代码。",
    "梳理多个 App 项目的存量 UI 组件，制定分批替换计划并推进落地。",
]) + [core_blocks[5]]

story.extend(section("教育经历"))
story.append(p("四川大学  |  硕士  计算机科学与技术  |  2022.09 - 2025.06", "Body"))
story.append(p("同济大学  |  本科  机械设计制造及自动化  |  2005.09 - 2009.06", "Body"))
story.extend(section("补充信息"))
story.append(p("英语六级；可阅读英文技术文档、检索资料并进行日常技术沟通。曾独立完成《PHP & MySQL Server-side Web Development》技术书籍翻译并出版。"))
story.append(p("早期经历：机械行业相关工作（机械工程师，2009.09 - 2015.12），积累工程协作、问题分析和项目交付经验。", "Small"))

doc.build(story)
print(OUT)
