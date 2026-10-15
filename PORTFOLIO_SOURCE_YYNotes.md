# YYNotes — Portfolio 项目素材

基于当前页面、组件及生成 / 助手代码整理；未启动应用、核验线上服务或自动截图。以下是展示素材，不是最终作品集文案。

## 1. Project Overview

**Project name**：YYNotes

**One-line description**：将原始学习资料整理成可阅读、追问和编辑的中英双语笔记的 AI 工作空间。

**Problem / Goal**：把文档和零散资料转成结构化学习内容，并让整理后的笔记继续用于理解、复习与个人补充；适用于课程、阅读、研究等不同主题。

**My role**：Unknown / needs manual input。代码可以确认实现范围涵盖生成工具、阅读与编辑界面、AI 助手和云端后端，无法确认个人负责范围或团队分工。

**Type**：AI Tool / Web App / Productivity Tool

**Main stack**：

- Next.js / React / TypeScript
- Markdown（以 `.mdx` 保存）/ KaTeX
- Tailwind CSS / Radix UI
- OpenAI-compatible AI API（主生成入口显示 DeepSeek V3.2）
- Cloudflare Worker
- Neon PostgreSQL

**Status**：Working prototype（按当前代码实现范围判断，运行状态未核验）。仓库有部署配置及站点链接，不能据此确认当前线上全部功能可用。

**Links**：

- Live site：[YYNotes](https://yynotes.yanyihan.top) — README 中记录，未核验可用性。
- GitHub：[YanYihann/YYnotes](https://github.com/YanYihann/YYnotes) — README 与页面页脚均指向此仓库。

## 2. The Idea

### 为什么会有这个项目？

项目针对的是资料整理与后续学习之间的衔接：文档需要变成有章节、概念和例子的笔记，阅读中又需要解释、补充和修改。代码中的用途入口包含课程、研究、复习和通用整理。个人起因与设计动机：Unknown / needs manual input。

### 核心 idea 是什么？

把资料输入、双语生成、笔记阅读和学习助手放进同一个工作流程。生成规则要求先完整中文、再完整英文，并尽量保持章节、概念和例子对应；阅读界面按当前语言显示对应版本。

### 最重要的一点是什么？

AI 结果是可继续加工的学习资料：用户可以围绕当前笔记或选中文本追问，也可以插入明确标记的批注，或直接编辑排版后的内容。最值得记住的是“资料生成笔记之后，仍能在同一工作空间理解和修订它”。

## 3. How It Works

### 01 — 提供资料

在首页粘贴文字或上传文档，选择课程、研究、复习或通用用途。

### 02 — 指定整理要求

按需填写标题和额外要求，例如保留引用、区分观点与证据；系统结合生成规则整理资料。

### 03 — 生成并阅读

生成完成后笔记自动保存。点击“打开笔记”，阅读结构化内容，并切换中文 / 英文版本。

### 04 — 追问与修订

选中难理解的内容向学习助手提问；用批注保留自己的补充，或进入全文编辑修改结果并保存。

## 4. Key Features & Decisions

### Feature 01 — 可指定用途的资料生成

**What it does**：接受文字、PDF、DOCX、PPTX 等资料；用途按钮提供整理要求，用户还能补充要求与标题。

**Why it matters**：同一生成入口支持不同知识领域。基础输入保持简洁，额外要求与高级工具通过“设置”展开，用户能控制整理方向。

**How it works**：主入口在浏览器提取文档文本，结合 `prompt.md` 提交生成请求并保存；文字草稿自动留在当前设备。处理过程区分读取、加载规则和生成保存三个阶段。

**Relevant files**：

- `components/home/workspace-composer.tsx`
- `lib/ai/note-generation-client.ts`
- `prompt.md`

### Feature 02 — 同一笔记的中英阅读与复杂内容排版

**What it does**：同一份笔记保存完整中英版本；阅读时切换语言，显示对应标题、正文和目录，支持公式、表格与代码。

**Why it matters**：中英内容能够围绕同一结构阅读；公式与代码只是内容能力之一，普通阅读笔记同样适用。正文、可收起目录和可调整宽度的助手共同组成阅读工作区。

**How it works**：识别双语分段并按语言取出正文，规范化公式分隔符；Markdown 渲染结合 KaTeX 和代码高亮。目录从实际渲染的标题提取。

**Relevant files**：

- `lib/mdx.tsx`
- `components/notes/note-markdown.tsx`
- `components/notes/reading-workspace.tsx`

### Feature 03 — 带笔记与选文上下文的 AI 助手

**What it does**：在阅读侧栏提问；正文选中文本会成为提问上下文，回答支持 Markdown 与公式，并有提问历史入口。

**Why it matters**：问题与正在阅读的材料保持联系，无需反复复制整篇笔记。正文与解释可以同时查看，侧栏宽度可拖动调整。

**How it works**：请求携带笔记标题、正文、选文和对话历史；系统提示要求优先使用笔记内容。客户端支持 SSE 增量回答，提问记录保存在浏览器本地。

**Relevant files**：

- `components/ai/note-assistant-panel.tsx`
- `lib/ai/note-assistant.ts`
- `lib/ai/client.ts`

### Feature 04 — 保留原文的批注与按块编辑

**What it does**：批注模式在选定位置插入带标记的引用块；全文编辑可以直接改标题、段落等，公式、表格和代码点击后才露出源文本。阅读态另有选文荧光笔。

**Why it matters**：保留资料与写入个人理解有明确的交互区别；编辑复杂内容时，其他块仍保持可读的排版。

**How it works**：解析 Markdown 块并在渲染态与编辑态之间切换，保存时还原为 Markdown。批注包含“笔记注释 / Note Annotation”标记与时间；高亮独立于正文保存。

**Relevant files**：

- `components/notes/note-editor-panel.tsx`
- `components/notes/note-view.tsx`
- `app/api/notes/route.ts`

## 5. Technical Notes & Limitations

### Worth mentioning

- **文本提取与明确的处理反馈**：主生成入口通过 PDF.js 读取 PDF 文本，通过 ZIP / XML 提取 Office 文本与表格行列。阶段提示与草稿保留让用户知道当前处理到哪里；“停止等待”会提示服务端仍可能完成保存，建议先检查笔记库。
- **上下文 AI 与流式阅读**：助手发送当前笔记、选文和近期对话，而非检索知识库的 RAG。客户端支持 SSE；笔记生成入口则等待完整生成及保存结果，两者不要混写为全程流式生成。
- **本地与云端两种保存路径**：本地笔记写入 `笔记/*.mdx`，云端由 Worker 与 Neon 保存；两种路径复用阅读 / 编辑界面。静态部署需要云端接口提供写入能力。本地高亮与提问历史保存在浏览器，不能概括为全部数据自动跨设备同步。

### Current limitations

- 主生成入口单次只接受一个文件或文字，资料上限为 35,000 字符；文件大小上限随配置为 4 MB 或 20 MB。附加文件后，保留的文字草稿不参与本次生成。
- PDF 依赖可提取的文字，扫描 PDF 需先做 OCR；Office 主入口提取文本 / 表格，未提取嵌入图片，不能宣传为完整视觉资料理解。
- 助手正文上下文上限为 14,000 字符，选文上限为 2,200 字符；过长内容会截断，不能声称完整理解任意长文。
- 生成和问答依赖外部 AI 服务；结构与术语要求主要依靠提示规则及格式处理，内容准确性与中英对应仍需人工检查。

## 6. Screenshot List

截图以桌面浅色主题、约 1600 × 1000–1100 的视口为主，优先让正文可读。复用同一组阅读资料串起流程，公式示例用于补充能力展示。

已有公开示例：`/notes/reading-questions`、`/notes/weighted-mean`、`/notes/small-search`。涉及生成或保存时，本地需可用 AI 服务；云端需登录自己的演示账号并连接后端。若公开示例显示“只读”，编辑截图改用自己保存的云端笔记或本地开发环境。云端笔记从列表打开，使用实际 `/notes/cloud?slug=<实际 slug>`。

### Screenshot 01 — 最终阅读工作区（主图）

**Page / Route**：`/notes/reading-questions`；也可用自己生成的同主题笔记详情。

**What to show**：真实笔记内容、章节目录和右侧学习助手；正文中能看到观点 / 证据表格，避免只有标题和空白。

**How to prepare**：

1. 打开笔记，保持中文模式。
2. 点击“本页目录”，打开“学习助手”。
3. 将助手宽度调至约 340–380 px；滚动到关键概念或主要内容，让章节标题和对照表可读。
4. 助手可保留一条与正文有关的简短回答，等待回答完成再截。

**Recommended content**：已有“把阅读变成自己的问题”示例，或一份区分观点、证据和疑问的阅读方法笔记。

**Why this screenshot matters**：展示项目最终交付的体验——可阅读、有结构、能继续提问的学习工作区。

### Screenshot 02 — 资料与整理要求

**Page / Route**：`/#generate`

**What to show**：用途按钮、已输入的资料、标题及整理要求，生成按钮保持可见。

**How to prepare**：

1. 云端模式先登录，再进入首页生成区域。
2. 选择“研究”，粘贴一段完整资料。
3. 展开“设置”，填写标题与整理要求；高级工具保持收起。
4. 在提交前截图，保留用途选中状态及有意义的输入开头。

**Recommended content**：一段有关“小组讨论前先独立记录想法”的教学方法材料，包含主张、适用条件和待验证的问题。标题用“从观点到证据：阅读笔记”；要求用“区分原文观点、证据与推测，保留引用，补充三个自测问题”。若使用自行编写的材料，明确其为演示材料。

**Why this screenshot matters**：展示用户怎样指定 AI 的整理目标。

### Screenshot 03 — 从资料到已保存笔记

**Page / Route**：`/#generate`，随后进入生成结果的详情路由。

**What to show**：与上一张相同的资料，以及“笔记已保存 / 打开笔记”的完成反馈。

**How to prepare**：

1. 使用 Screenshot 02 的资料与要求，点击“生成笔记”。
2. 等待实际生成和保存成功，保留原输入及成功提示。
3. 截图时不清空输入；然后点击“打开笔记”，核对结果可读，供主图使用。

**Recommended content**：继续使用同一份阅读资料，避免输入与输出主题不一致。

**Why this screenshot matters**：把资料输入与真正保存的学习内容连起来。

**Better as video / GIF**：录制“提交 → 阶段提示 → 保存成功 → 打开结果”，剪短等待时间；生成过程只有状态反馈，没有逐字生成正文。

### Screenshot 04 — 英文版本与公式 / 表格排版

**Page / Route**：`/notes/weighted-mean`

**What to show**：英文正文中的加权平均公式与贡献表格，以及页头 EN / 中文切换控件。

**How to prepare**：

1. 打开现有加权平均示例，关闭助手以留出正文空间。
2. 点击页头语言切换，进入英文模式。
3. 滚动至算术平均、加权平均及表格所在位置；确认公式渲染完成。
4. 如需中英对比，另截相同内容的中文状态，后续制作左右对照图。

**Recommended content**：现有 80、90 与权重 0.4、0.6 的完整示例，无需另造公式。

**Why this screenshot matters**：展示双语版本与公式、表格共同组成的可读笔记。

**Better as video / GIF**：录制中文 / 英文切换，展示正文与目录一起更新；这不是页面内的双栏中英对照。

### Screenshot 05 — 选中文本后的上下文追问

**Page / Route**：`/notes/reading-questions` 或同主题生成笔记详情。

**What to show**：相关正文、助手中的 Selected text 标签、用户问题与实际回答同时可见。

**How to prepare**：

1. 打开助手，滚动到“尚缺的证据”或“待探索的问题”附近。
2. 在正文选中一段自然语言，确认助手出现选文标签。
3. 提问“为什么这里还是待验证的问题？请指出需要补充的比较条件和证据。”
4. 等待回答完成；调整侧栏宽度与内部滚动位置，让选文标签和解释可读。

**Recommended content**：使用示例中“这仍然是待探索的问题，而不是已经得到验证的结论”附近段落。

**Why this screenshot matters**：证明 AI 解释与当前阅读内容、用户选文有关。

**Better as video / GIF**：录制“选文 → 标签出现 → 提问 → 增量回答”的短操作；仅在当前服务实际返回流式响应时展示流式效果。

### Screenshot 06 — 插入自己的批注

**Page / Route**：可编辑的阅读笔记详情；本地 `/notes/reading-questions` 或自己的 `/notes/cloud?slug=<实际 slug>`。

**What to show**：原文与新引用批注的视觉关系，包含清楚的“笔记注释 / Note Annotation”标记。

**How to prepare**：

1. 使用可编辑的演示笔记，关闭助手，把画面留给正文。
2. 点击“编辑笔记”→“笔记注释”。
3. 点击目标段落下半部，在其后出现的引用区域写入个人补充。
4. 点击“保存注释”，在阅读态截取原段落与带标记的批注；编辑中的插入状态可另作小图。

**Recommended content**：“我的补充：需要比较直接讨论与先独立记录两种方式，并明确参与度的衡量方法。这里还没有证据证明哪种方式更好。”

**Why this screenshot matters**：展示个人补充与原资料有明确区分，生成内容可以继续成为自己的笔记。

### Screenshot 07 — 公式点击后才进入源码编辑

**Page / Route**：可编辑的 `/notes/weighted-mean`，或自己保存的加权平均云端笔记。

**What to show**：全文编辑状态，选中的公式块显示 LaTeX 源文本，相邻段落、公式或表格仍保持渲染。

**How to prepare**：

1. 点击“编辑笔记”→“全文编辑”。
2. 滚动至一般形式的加权平均公式。
3. 点击该公式块，露出源文本；保持相邻贡献表格或另一公式可见。
4. 截取这一局部交互，不需要为了截图保存无意义修改。

**Recommended content**：使用已有加权平均公式。也可在 `/notes/small-search` 录制点击代码块编辑的补充片段。

**Why this screenshot matters**：展示轻量 Typora 式编辑如何兼顾阅读排版与源文本控制。

**Better as video / GIF**：录制“渲染公式 → 点击显示源文本 → 点击其他块恢复渲染”；若演示修改，使用自己的演示副本并完成保存。
