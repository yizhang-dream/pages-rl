# Visual Course Engine Specification (`COURSE_CONFIG` + Schema Contract)

本课程站点采用「**零构建双层架构**」：底层是领域无关的交互教材引擎（支持 `file://` 双击运行、按讲懒加载、按需 KaTeX 渲染、5 套主题、三态中英双语、独立辅助页共享外壳），上层是声明式课程清单与讲义数据。新建另一门课程（例如优化理论、控制论、深度学习等）时，**只需替换声明式清单与内容脚本，通用引擎免改**。

---

## 1. 分层架构总览

| 层级 | 文件清单 | 职责边界 |
| :--- | :--- | :--- |
| **课程清单层** | `assets/js/course-config.js` | 声明 `window.COURSE_CONFIG`：课程 ID（localStorage 键前缀）、版本戳、主题列表、首页 Hero / 知识树分支 / 使用说明、Bilibili/YouTube 链接模板、辅助页导航、页脚声明 |
| **通用引擎层** | `assets/js/root-template.js`, `app.js`, `loader.js`, `components.js`, `subpage-shell.js`, `assets/css/main.css`, `subpage.css` | 哈希路由（`#sec-*` / `#lab-*`）、三态语言（`both` / `zh` / `en`）、5 主题 `color-scheme` 令牌、脚本按讲懒加载、KaTeX（含正文行内 `$...$` 与公式块）、`CodeLab` / `ReasoningLab` / `QaLab` / `FillLab` / `DerivationLab` / `ConceptChain` / `NotebookBridge` / `OfficialVideos` |
| **课程数据层** | `assets/js/data.js`, `data-l2.js`..`data-l10.js`, `nb-manifest.js`, `graph3d-data.js`, `concordance-data.js` | 导航组 `navGroups`、三层主题 `navClusters`、每讲 `LECTURES` 元数据、每节内容块 `sections[id]`、推理链、代码精讲、Q&A、填空、交互推导、视频索引 |
| **领域实验台层** | `assets/js/components-l1.js`..`components-l10.js` | 复用 `window.RLV` 工具集（`bi`, `biAny`, `fmtMath`, `rng`, `stepOnce`, `GridBoard` 等）注册本讲专属模拟实验台 |
| **独立辅助页** | `lite.html`, `concordance.html`, `resources.html`, `graph3d.html` | 引入 `course-config.js` + `subpage-shell.js` + `subpage.css`，自动统一顶栏导航、双语防粘连与主题持久化 |

---

## 2. 核心数据契约（均由自动化脚本校验）

### 2.1 `window.COURSE_CONFIG`（`course-config.js`）
- `id`: 字符串（默认 `'rl-viz'`），决定 `localStorage` 键名前缀：`${id}-theme`、`${id}-lang`、`${id}-visited`、`${id}-fill-<source>`、`${id}-deriv-<source>`。
- `version`: 静态资源版本戳（如 `'20261118a'`），配合 `npm run bump -- <ver>` 一键同步到 5 个 HTML 入口页，穿透 nginx `/assets/` 长缓存。
- `branches`: `[{ key, cls, zh, en, nos }]`（`cls` 可选 `b-model | b-values | b-mb | b-mf | b-policy`），把讲号分组呈现到首页「全书知识树」。
- `auxPages`: 辅助页顶部与页脚链接表，每项 `{ id, href, zh, en }`。

### 2.2 小节内容块 `D.sections[id].blocks`
每项支持以下 `t` 类型（正文 `zh`/`en` 支持行内 `$...$` LaTeX，由 `RLV.fmtMath` 自动转 `<i class="fx-inline" data-tex="..."></i>`；`<code>` 标签内部 `$` 会跳过）：
- `{ t: 'p', zh, en }`：双语段落。
- `{ t: 'formula', lbl?, tex?, html?, note? }`：数学公式卡。优先写 `tex` 整式；若图文混排则写 `html` 内嵌 `<i class="fx-inline" data-tex="..."></i>`。
- `{ t: 'callout', variant: 'key'|'warn'|'danger'|'idea'|'done', zh, en }`：语义提示框。
- `{ t: 'steps', items: [{ zh, en }, ...] }`：编号要点列表。
- `{ t: 'widget', component: '<name>', props?: {...} }`：挂载已注册 Vue 组件。

### 2.3 工具箱标准数据结构
- **代码精讲 `codeFileSets[src]`**：`[{ id, file, tab, intro: { zh, en }, code, notes: [{ lines: [a,b], tag, zh, en }] }]`。`intro` 必须为双语对象 `{ zh, en }`。
- **连贯长推理 `reasoningSets[src]` + `reasoningClosings[src]`**：每步 `{ link, title: { zh, en }, zh, en, question: { zh, en } | null }`；`reasoningClosings[src]` 为 `{ zh, en }` 收官总结。
- **知识填空 `fillSets[src]`**：`{ title: { zh, en }, items: [{ kind: 'choice'|'number'|'code', tag: { zh, en }, stem: { zh, en }, code?, blanks: [...] }] }`，`[[1]]..[[n]]` 编号须从 1 连续。
- **定理交互推导 `derivationSets[src]`**：步进式带验证锁的证明链，支持 `{ tex }` 型 LaTeX 选项。

---

## 3. 新建一门课程的 4 步复用清单
1. **克隆核心壳**：复制 `index.html`、`lite.html`、`concordance.html`、`resources.html`、`graph3d.html`、`assets/css/`、`assets/vendor/`、`assets/js/{app,components,root-template,loader,subpage-shell}.js`、`scripts/`、`check_templates.js`、`verify_site.js`。
2. **填写课程清单**：编辑 `assets/js/course-config.js`，设置新 `id`（防止与旧课程 `localStorage` 冲突）、主题、Hero 文案、分支树与辅助页目录。
3. **编写每讲数据与实验台**：在 `data.js` 填好 `navGroups`、`navClusters`、`otherLectures`（`widgets` 计数须与交互实验台一致），在 `data-lX.js` 与 `components-lX.js` 编写各讲内容与视觉实验台。
4. **运行生成与校验管线**：
   - `npm run build:concordance`（术语反查数据）与 `node scripts/build_graph3d.js`（3D 知识图）
   - `npm test`（Vue 模板编译 + 全量数据结构 + 全部公式与行内 KaTeX 严格渲染）
   - `npm run lint`（ESLint 代码纪律检查）
   - `node verify_site.js`（无头 Edge 全站端到端 + 桌面/移动端零横向溢出校验）
   - `npm run bump -- <YYYYMMDDa>`（刷新缓存版本戳后发版）
