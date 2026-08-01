---
kind: frontend_style
name: PyLibMaster 前端样式系统 — 单文件 CSS + CSS 变量主题体系
category: frontend_style
scope:
    - '**'
source_files:
    - renderer/styles.css
    - renderer/index.html
    - package.json
---

## 1. 使用的系统与工具
- 纯原生 CSS，无预处理器（Sass/Less）、无 CSS-in-JS、无 UI 组件库。
- 通过 Electron 的 `renderer/index.html` 直接引入 `styles.css`，由浏览器原生渲染。
- 主题切换通过给 `<body>` 添加/移除 `.dark` 类实现，配合 CSS 自定义属性（CSS Variables）完成浅色/深色两套配色。
- 构建与打包使用 `electron-builder`，样式资源随 `renderer/**/*` 一起打包进应用。

## 2. 核心文件与位置
- `renderer/styles.css`：唯一的全局样式文件，包含全部主题变量、全局重置、布局、组件、动画与响应式规则。
- `renderer/index.html`：主界面 HTML，内联定义所有页面结构（安装/卸载/更新/查询/镜像/环境/日志/设置/关于/数据统计/工具箱等），并通过 `data-i18n` 属性驱动国际化文案。
- `package.json`：声明 Electron/electron-builder 依赖，并在 `build.files` 中把 `renderer/**/*` 纳入打包产物。

## 3. 架构与约定
- **单文件样式**：所有样式集中在 `styles.css`，按注释分节组织（变量 → 重置 → 标题栏 → 侧边栏 → 内容区 → 卡片/搜索 → 按钮 → 拖拽区 → 表格 → 标签/进度 → 镜像源 → 日志 → 设置 → 开关 → 关于 → 状态栏 → 模态 → Toast → 响应式 → 包详情 → 依赖树 → 操作统计 → 仪表盘 → 项目模板 → 安全扫描 → PyPI 浏览 → 环境对比 → 工具箱 → 依赖图谱 → 磁盘分析 → diff → 版本时间线 → Toast 内联样式）。
- **设计令牌（Design Tokens）**：通过 `:root` 下的 CSS 变量集中定义颜色、阴影、圆角、字体族等；`.dark` 选择器覆盖同一组变量名，实现一键换肤。
- **命名约定**：采用 BEM 风格的类名前缀（如 `.sidebar-*`、`.card-*`、`.btn-*`、`.progress-*`、`.mirror-*`、`.log-*`、`.setting-*`、`.toggle-*`、`.about-*`、`.statusbar-*`、`.modal-*`、`.toast-*`、`.db-*`、`.tpl-*`、`.audit-*`、`.pypi-*`、`.diff-*`、`.tools-*`、`.dep-*`、`.disk-*`、`.release-*`），保证样式与模块一一对应。
- **页面组织**：HTML 中以 `class="page" id="page-xxx"` 划分多个视图，默认隐藏，通过 JS 切换 `.active` 显示当前页。
- **图标与资源**：SVG 图标以 inline SVG 形式嵌入 HTML，图片资源放在 `renderer/assets/` 下。
- **国际化**：通过 `data-i18n` / `data-i18n-placeholder` 属性与 `js/i18n.js` 配合，不改变 DOM 结构即可切换语言。
- **CSP 策略**：`index.html` 中设置了较宽松的 CSP（允许 `'unsafe-inline'` 的 script/style），以便直接运行内联脚本与样式。

## 4. 约定与约束
- **主题切换**：通过在 `<body>` 上添加/移除 `.dark` 类来切换深色模式，所有组件样式均基于 CSS 变量，无需额外逻辑。
- **组件样式复用**：按钮统一使用 `.btn` 基础类，再叠加 `.btn-primary` / `.btn-danger` / `.btn-sm` 等修饰类；进度条统一使用 `.progress-bar` + `.progress-fill` 组合。
- **交互状态**：禁用态统一用 `:disabled` 控制透明度与光标；加载态通过 `.loading` 类触发 spinner 显示。
- **响应式**：仅通过一个 `@media (max-width: 900px)` 断点调整侧边栏宽度、网格列数与内边距，未做移动端适配。
- **滚动条定制**：针对 WebKit 内核（Electron）自定义了 `.sidebar-nav::-webkit-scrollbar`、`.content::-webkit-scrollbar` 等滚动条样式。
- **动画与过渡**：统一的 `transition` 时长（0.15s~0.3s）与少量关键帧动画（`spin`、`fadeIn`、`modalIn`、`slideIn`、`toastIn`）用于按钮、模态、Toast、页面切换等场景。
- **构建约束**：`package.json` 的 `build.files` 明确只打包 `renderer/**/*`，因此新增样式文件需放在 `renderer/` 目录下才能被包含。
- **安全约束**：CSP 允许内联样式与脚本，但限制外部资源来源（`default-src 'self'`，`connect-src` 允许 `https:`/`http:`），避免任意注入。

总体而言，该工程的前端样式采用“单文件 CSS + CSS 变量主题”的轻量方案，没有引入任何第三方样式框架或组件库，所有视觉规范都收敛在 `renderer/styles.css` 中，通过一致的类名前缀与变量命名维持整体一致性。