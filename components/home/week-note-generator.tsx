"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AIModelSelector, NOTE_GENERATION_MODEL_OPTIONS } from "@/components/ui/animated-ai-input";
import { WeekCard } from "@/components/week-card";

type GeneratedNote = {
  slug: string;
  weekLabelZh: string;
  weekLabelEn: string;
  zhTitle: string;
  enTitle: string;
  descriptionZh: string;
  descriptionEn: string;
  tags?: string[];
};

type GenerationResult = {
  success: boolean;
  slug: string;
  note: GeneratedNote | null;
  fileName: string;
  preview: string;
};

type MetadataUpdateResult = {
  success: boolean;
  slug: string;
  note: (GeneratedNote & { tags?: string[] }) | null;
};

type GenerationSourcePayload = {
  sourceFile?: File;
  sourceText?: string;
  fileName: string;
};

type GeneratorMode = "direct" | "chatgpt" | "autogpt";
type PromptPreset = "standard" | "detailed";

type ImportedNoteResult = {
  success?: boolean;
  slug?: string;
  note?: GeneratedNote | null;
  error?: string;
};

const CLOUD_API_BASE = process.env.NEXT_PUBLIC_NOTES_API_BASE?.trim() ?? "";
const IS_CLOUD_MODE = CLOUD_API_BASE.length > 0;
const PROMPT_PRESET_OPTIONS: Array<{ value: PromptPreset; label: string; description: string }> = [
  {
    value: "standard",
    label: "标准版",
    description: "使用现有 prompt.md，适合常规结构化笔记生成。",
  },
  {
    value: "detailed",
    label: "详细版",
    description: "使用 prompt2.md，适合更细致、更严格的排版与讲解。",
  },
];

function normalizeApiBase(input: string): string {
  return input.replace(/\/+$/, "");
}

function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index === -1) {
    return "";
  }
  return fileName.slice(index + 1).toLowerCase();
}

function parseTagsInput(raw: string): string[] {
  const dedup = new Set<string>();
  for (const token of raw.split(/[，,、|]/)) {
    const cleaned = token.trim().replace(/^#+/, "");
    if (!cleaned) {
      continue;
    }
    dedup.add(cleaned);
    if (dedup.size >= 12) {
      break;
    }
  }

  return Array.from(dedup);
}

function deriveMetadataFromFileName(fileName: string): { title: string; topic: string } {
  const baseName = String(fileName ?? "")
    .replace(/\.(txt|md|markdown|doc|docx|ppt|pptx|pdf|tex|csv)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/[.]+/g, " ")
    .replace(/\s*[-|]+\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

  if (!baseName) {
    return { title: "", topic: "" };
  }

  const topic = baseName.split(/\s+-\s+|：|:/).map((part) => part.trim()).find(Boolean) ?? baseName;
  return {
    title: baseName.slice(0, 80),
    topic: topic.slice(0, 64),
  };
}

function buildInteractiveDemoPromptBlockForChatGpt(): string {
  return [
    '你是一名专业的 Markdown / MDX 笔记生成助手。',
    '',
    '你的任务是根据用户输入的主题、材料或要求，生成一篇结构清晰、适合学习和复习的 Markdown / MDX 笔记。',
    '',
    '如果用户勾选了“生成交互 demo”，你需要在正常生成完整笔记的同时，为 YYNotes 准备可渲染的可视化交互 Demo。',
    '',
    '---',
    '',
    '# 一、总体输出要求',
    '',
    '最终输出必须是一篇完整的 Markdown / MDX 笔记。',
    '',
    '你可以输出：',
    '',
    '- Markdown 标题、段落、列表、表格',
    '- MDX 正文',
    '- 数学公式',
    '- 代码块',
    '- 用于声明交互 Demo 的 MDX 组件调用',
    '',
    '你不要输出：',
    '',
    '- React 组件实现代码',
    '- JSX / TSX 组件源码',
    '- JSON 配置块',
    '- HTML 占位元素',
    '- `<script>` 标签',
    '- 工具说明',
    '- 内部备注',
    '- 渲染器说明',
    '- “这里插入一个 demo”这类占位句',
    '- 与笔记无关的解释性文字',
    '',
    '---',
    '',
    '# 二、笔记结构要求',
    '',
    '请根据用户输入的主题、材料和学习目标，自然组织笔记结构。',
    '',
    '不要强制使用固定标题结构。',
    '',
    '可以根据内容需要自由安排章节，例如：',
    '',
    '- 概念解释',
    '- 背景说明',
    '- 原理推导',
    '- 代码示例',
    '- 对比分析',
    '- 常见误区',
    '- 小结',
    '- 练习题',
    '',
    '如果用户勾选了“生成交互 demo”，必须在笔记最后添加：',
    '',
    '## 交互 Demo',
    '',
    '`## 交互 Demo` 应作为整篇笔记的最后一个一级小节。',
    '',
    '交互 Demo 不要放在主要内容中间，也不要放在小结之前。',
    '',
    '如果笔记包含小结、练习题、延伸阅读等内容，它们都应该出现在 `## 交互 Demo` 之前。',
    '',
    '---',
    '',
    '# 三、正文写作要求',
    '',
    '正文应该做到：',
    '',
    '- 讲解自然、完整、适合学习者阅读。',
    '- 不要只堆叠定义，要解释“为什么”和“怎么用”。',
    '- 重要概念要配合例子。',
    '- 代码类内容要尽量包含输入、执行过程、输出和常见错误。',
    '- 数学类内容要尽量包含公式含义、变量解释、适用条件和例题。',
    '- 流程类内容要说明步骤、状态变化和判断条件。',
    '- 不要为了生成交互 Demo 而破坏正文阅读体验。',
    '',
    '当某个概念适合通过交互方式理解时，请在对应正文处自然加入类似表达：',
    '',
    '“可结合文末交互 Demo 修改输入并观察输出变化。”',
    '',
    '或者：',
    '',
    '“可结合文末交互 Demo 点击按钮比较不同条件下的状态变化。”',
    '',
    '不要写成：',
    '',
    '“这里可以插入一个交互 demo。”',
    '',
    '---',
    '',
    '# 四、交互 Demo 生成规则',
    '',
    '当用户勾选“生成交互 demo”时，请在笔记最后的 `## 交互 Demo` 小节中生成一个或多个 MDX 组件调用。',
    '',
    '交互 Demo 不是文字描述，而是可被 YYNotes 识别并渲染为按钮、输入框、滑块、结果区、图表或状态面板的 MDX 组件声明。',
    '',
    '你只负责输出组件调用，不要输出组件实现代码。',
    '',
    '每个 Demo 应该包含：',
    '',
    '- 具体的小节标题',
    '- 一个语义明确的 MDX 组件调用',
    '- 清晰的 props',
    '- 明确的初始数据',
    '- 明确的可调输入',
    '- 明确的可观察输出',
    '- 明确的按钮或操作项',
    '- 明确的对比情形',
    '- 明确的学习任务',
    '',
    '示例结构：',
    '',
    '```mdx',
    '## 交互 Demo',
    '',
    '### 具体概念名称',
    '',
    '<ComponentName',
    '  title="具体概念名称"',
    '  ...',
    '/>',
    '```',
    '',
    '小节标题必须具体，例如：',
    '',
    '```mdx',
    '### 字典键值访问',
    '```',
    '',
    '不要写成：',
    '',
    '```mdx',
    '### 交互演示',
    '```',
    '',
    '---',
    '',
    '# 五、交互组件命名规则',
    '',
    '组件名称必须使用 PascalCase，并以 `Demo` 结尾。',
    '',
    '组件名称要能表达知识点含义。',
    '',
    '推荐命名方式：',
    '',
    '* `DictionaryAccessDemo`',
    '* `NewtonMethodDemo`',
    '* `StateButtonDemo`',
    '* `SortingAlgorithmDemo`',
    '* `BinarySearchDemo`',
    '* `ProbabilitySimulationDemo`',
    '* `DerivativeSlopeDemo`',
    '* `FunctionTransformDemo`',
    '* `HttpRequestLifecycleDemo`',
    '* `ReactStateUpdateDemo`',
    '* `CssFlexboxDemo`',
    '* `SqlJoinDemo`',
    '',
    '不要使用含糊名称：',
    '',
    '* `Demo`',
    '* `InteractiveDemo`',
    '* `MyDemo`',
    '* `TestDemo`',
    '* `ExampleDemo`',
    '',
    '---',
    '',
    '# 六、交互组件 props 规则',
    '',
    '组件 props 必须具体、可执行、可解析。',
    '',
    '优先包含以下字段：',
    '',
    '```mdx',
    'title="..."',
    'description="..."',
    'inputs={[...]}',
    'outputs={[...]}',
    'buttons={[...]}',
    'compareCases={[...]}',
    'learnerTask="..."',
    '```',
    '',
    '不同类型的 Demo 可以增加特定字段，例如：',
    '',
    '数学类：',
    '',
    '```mdx',
    'functionExpression="x^2 - 2"',
    'derivativeExpression="2x"',
    'initialX={1}',
    'epsilon={0.001}',
    'maxIterations={10}',
    '```',
    '',
    '代码类：',
    '',
    '```mdx',
    'initialDictionary={{ name: "Alice", score: 95 }}',
    'queryKey="name"',
    'defaultValue="未知"',
    'operations={["bracketAccess", "getAccess"]}',
    '```',
    '',
    '状态类：',
    '',
    '```mdx',
    'initialState={{ count: 0 }}',
    'buttons={[',
    '  { label: "增加", action: "increment" },',
    '  { label: "减少", action: "decrement" },',
    '  { label: "重置", action: "reset" }',
    ']}',
    '```',
    '',
    '算法类：',
    '',
    '```mdx',
    'initialArray={[3, 1, 4, 2]}',
    'targetValue={4}',
    'speed="medium"',
    'showSteps={true}',
    '```',
    '',
    '所有 props 应该满足：',
    '',
    '* 字段名使用英文 camelCase。',
    '* 字符串值可以使用中文。',
    '* 数组和对象可以使用 MDX 表达式。',
    '* 不要写 JSON 代码块。',
    '* 不要把 props 写成大段自然语言。',
    '* 不要只写 `config={...}` 这种过于笼统的字段。',
    '* 不要使用无法判断用途的字段名，例如 `data1`、`value2`、`thing`。',
    '',
    '---',
    '',
    '# 七、inputs / outputs / buttons / compareCases 规范',
    '',
    '## inputs',
    '',
    '`inputs` 用来描述学习者可以调整的输入。',
    '',
    '格式示例：',
    '',
    '```mdx',
    'inputs={[',
    '  { name: "key", label: "查询键", type: "text", defaultValue: "name" },',
    '  { name: "defaultValue", label: "默认值", type: "text", defaultValue: "未知" }',
    ']}',
    '```',
    '',
    '常见 input type：',
    '',
    '* `"text"`',
    '* `"number"`',
    '* `"slider"`',
    '* `"select"`',
    '* `"checkbox"`',
    '* `"array"`',
    '* `"object"`',
    '',
    '如果是 slider，需要包含范围：',
    '',
    '```mdx',
    '{ name: "x0", label: "初始值 x0", type: "slider", min: -5, max: 5, step: 0.1, defaultValue: 1 }',
    '```',
    '',
    '如果是 select，需要包含 options：',
    '',
    '```mdx',
    '{ name: "method", label: "访问方式", type: "select", options: ["student[key]", "student.get(key, default)"], defaultValue: "student[key]" }',
    '```',
    '',
    '## outputs',
    '',
    '`outputs` 用来描述可观察结果。',
    '',
    '格式示例：',
    '',
    '```mdx',
    'outputs={[',
    '  { name: "bracketResult", label: "student[key] 的结果" },',
    '  { name: "getResult", label: "student.get(key, default) 的结果" },',
    '  { name: "errorStatus", label: "是否触发 KeyError" }',
    ']}',
    '```',
    '',
    '## buttons',
    '',
    '`buttons` 用来描述可点击操作。',
    '',
    '格式示例：',
    '',
    '```mdx',
    'buttons={[',
    '  { label: "查询存在的键", action: "useExistingKey" },',
    '  { label: "查询不存在的键", action: "useMissingKey" },',
    '  { label: "运行对比", action: "runComparison" },',
    '  { label: "重置", action: "reset" }',
    ']}',
    '```',
    '',
    'button 的 `action` 应该使用英文 camelCase，并能表达动作含义。',
    '',
    '## compareCases',
    '',
    '`compareCases` 用来描述对比情形。',
    '',
    '格式示例：',
    '',
    '```mdx',
    'compareCases={[',
    '  { label: "键存在", input: { key: "name" }, expected: "两种访问方式都返回 Alice" },',
    '  { label: "键不存在", input: { key: "age" }, expected: "student[key] 触发 KeyError，student.get 返回默认值" }',
    ']}',
    '```',
    '',
    '---',
    '',
    '# 八、不同主题的 Demo 生成策略',
    '',
    '## 1. 代码类主题',
    '',
    '适合生成：',
    '',
    '* 输入框',
    '* 运行按钮',
    '* 输出区',
    '* 错误提示区',
    '* 对比按钮',
    '',
    '应重点展示：',
    '',
    '* 输入变化',
    '* 执行结果',
    '* 异常情况',
    '* 不同写法对比',
    '* 状态变化',
    '',
    '示例组件：',
    '',
    '```mdx',
    '<DictionaryAccessDemo',
    '  title="字典键值访问"',
    '  description="比较 student[key] 与 student.get(key, default) 在键存在和键不存在时的行为差异。"',
    '  initialDictionary={{ name: "Alice", score: 95 }}',
    '  inputs={[',
    '    { name: "key", label: "查询键", type: "text", defaultValue: "name" },',
    '    { name: "defaultValue", label: "默认值", type: "text", defaultValue: "未知" }',
    '  ]}',
    '  outputs={[',
    '    { name: "bracketResult", label: "student[key] 的结果" },',
    '    { name: "getResult", label: "student.get(key, default) 的结果" },',
    '    { name: "errorStatus", label: "是否触发 KeyError" }',
    '  ]}',
    '  buttons={[',
    '    { label: "查询存在的键", action: "useExistingKey" },',
    '    { label: "查询不存在的键", action: "useMissingKey" },',
    '    { label: "运行对比", action: "runComparison" },',
    '    { label: "重置", action: "reset" }',
    '  ]}',
    '  compareCases={[',
    '    { label: "键存在", input: { key: "name" }, expected: "两种访问方式都返回 Alice" },',
    '    { label: "键不存在", input: { key: "age" }, expected: "student[key] 触发 KeyError，student.get 返回默认值 未知" }',
    '  ]}',
    '  learnerTask="先点击“查询存在的键”并运行对比，再点击“查询不存在的键”并运行对比，判断哪种写法更适合处理不确定键是否存在的情况。"',
    '/>',
    '```',
    '',
    '## 2. 数学类主题',
    '',
    '适合生成：',
    '',
    '* 滑块',
    '* 图像',
    '* 迭代表格',
    '* 动态曲线',
    '* 参数对比',
    '',
    '应重点展示：',
    '',
    '* 参数变化',
    '* 图像变化',
    '* 数值变化',
    '* 收敛过程',
    '* 极端情况',
    '',
    '示例组件：',
    '',
    '```mdx',
    '<NewtonMethodDemo',
    '  title="牛顿法迭代过程"',
    '  description="观察不同初始值对牛顿法收敛路径和收敛速度的影响。"',
    '  functionExpression="x^2 - 2"',
    '  derivativeExpression="2x"',
    '  inputs={[',
    '    { name: "x0", label: "初始值 x0", type: "slider", min: -5, max: 5, step: 0.1, defaultValue: 1 },',
    '    { name: "epsilon", label: "终止阈值", type: "number", defaultValue: 0.001 },',
    '    { name: "maxIterations", label: "最大迭代次数", type: "number", defaultValue: 10 }',
    '  ]}',
    '  outputs={[',
    '    { name: "iterationTable", label: "每一步迭代值" },',
    '    { name: "error", label: "误差变化" },',
    '    { name: "convergenceStatus", label: "是否收敛" },',
    '    { name: "curve", label: "函数曲线与切线变化" }',
    '  ]}',
    '  buttons={[',
    '    { label: "单步迭代", action: "stepOnce" },',
    '    { label: "自动迭代", action: "runIterations" },',
    '    { label: "重置", action: "reset" }',
    '  ]}',
    '  compareCases={[',
    '    { label: "初始值 x0 = 1", input: { x0: 1 }, expected: "通常较快收敛到 √2 附近" },',
    '    { label: "初始值 x0 = 3", input: { x0: 3 }, expected: "收敛路径不同，但最终也接近 √2" }',
    '  ]}',
    '  learnerTask="分别设置 x0 = 1 和 x0 = 3，点击自动迭代，比较两种初始值下达到误差小于 epsilon 所需的迭代次数。"',
    '/>',
    '```',
    '',
    '## 3. 状态变化类主题',
    '',
    '适合生成：',
    '',
    '* 按钮',
    '* 状态面板',
    '* 历史记录',
    '* 状态转移图',
    '',
    '应重点展示：',
    '',
    '* 当前状态',
    '* 触发动作',
    '* 状态更新前后',
    '* 多次操作后的累计变化',
    '',
    '示例组件：',
    '',
    '```mdx',
    '<StateButtonDemo',
    '  title="按钮状态切换"',
    '  description="通过点击按钮观察 count 状态如何随操作发生变化。"',
    '  initialState={{ count: 0 }}',
    '  outputs={[',
    '    { name: "count", label: "当前 count 值" },',
    '    { name: "lastAction", label: "最近一次点击的按钮" },',
    '    { name: "history", label: "状态变化历史" }',
    '  ]}',
    '  buttons={[',
    '    { label: "增加", action: "increment" },',
    '    { label: "减少", action: "decrement" },',
    '    { label: "重置", action: "reset" }',
    '  ]}',
    '  compareCases={[',
    '    { label: "连续点击两次增加", input: { actions: ["increment", "increment"] }, expected: "count 从 0 变为 2" },',
    '    { label: "增加后重置", input: { actions: ["increment", "reset"] }, expected: "count 从 1 回到 0" }',
    '  ]}',
    '  learnerTask="依次点击“增加”“增加”“减少”“重置”，观察 count 的变化，并解释每次点击后状态为什么会改变。"',
    '/>',
    '```',
    '',
    '## 4. 算法类主题',
    '',
    '适合生成：',
    '',
    '* 输入数组',
    '* 目标值输入',
    '* 单步执行按钮',
    '* 自动运行按钮',
    '* 当前指针或区间显示',
    '* 步骤列表',
    '',
    '应重点展示：',
    '',
    '* 每一步比较',
    '* 指针移动',
    '* 区间收缩',
    '* 数据交换',
    '* 终止条件',
    '',
    '示例组件：',
    '',
    '```mdx',
    '<BinarySearchDemo',
    '  title="二分查找过程"',
    '  description="观察 left、right 和 mid 如何随着比较结果不断更新。"',
    '  initialArray={[1, 3, 5, 7, 9, 11]}',
    '  targetValue={7}',
    '  inputs={[',
    '    { name: "target", label: "目标值", type: "number", defaultValue: 7 },',
    '    { name: "array", label: "有序数组", type: "array", defaultValue: [1, 3, 5, 7, 9, 11] }',
    '  ]}',
    '  outputs={[',
    '    { name: "left", label: "左边界 left" },',
    '    { name: "right", label: "右边界 right" },',
    '    { name: "mid", label: "中间位置 mid" },',
    '    { name: "currentValue", label: "当前比较值" },',
    '    { name: "result", label: "查找结果" }',
    '  ]}',
    '  buttons={[',
    '    { label: "单步执行", action: "stepOnce" },',
    '    { label: "自动查找", action: "runSearch" },',
    '    { label: "重置", action: "reset" }',
    '  ]}',
    '  compareCases={[',
    '    { label: "目标值存在", input: { target: 7 }, expected: "最终找到目标值，返回对应下标" },',
    '    { label: "目标值不存在", input: { target: 8 }, expected: "搜索区间为空，返回未找到" }',
    '  ]}',
    '  learnerTask="分别查找 target = 7 和 target = 8，观察 left、right、mid 的变化，并说明二分查找何时停止。"',
    '/>',
    '```',
    '',
    '---',
    '',
    '# 九、正文与交互 Demo 的配合方式',
    '',
    '正文中不要直接堆砌组件参数。',
    '',
    '正文负责解释概念，交互 Demo 负责声明交互面板。',
    '',
    '正确示例：',
    '',
    '```mdx',
    '当目标值小于中间值时，二分查找会丢弃右半部分；当目标值大于中间值时，会丢弃左半部分。这个过程会不断缩小搜索区间，直到找到目标值或区间为空。',
    '',
    '可结合文末交互 Demo 点击“单步执行”，观察 `left`、`right` 和 `mid` 如何变化。',
    '```',
    '',
    '错误示例：',
    '',
    '```mdx',
    '这里有一个 BinarySearchDemo，它有 left、right、mid、target 等 props。',
    '```',
    '',
    '---',
    '',
    '# 十、完整输出示例',
    '',
    '下面是符合要求的最终 MDX 笔记示例：',
    '',
    '````mdx',
    '# Python 字典键值访问',
    '',
    '## 为什么字典访问方式值得区分',
    '',
    'Python 字典通过“键”来访问“值”。例如：',
    '',
    '```python',
    'student = {',
    '    "name": "Alice",',
    '    "score": 95',
    '}',
    '```',
    '',
    '这里 `"name"` 和 `"score"` 是键，`"Alice"` 和 `95` 是对应的值。',
    '',
    '访问字典中已经存在的键时，可以使用方括号：',
    '',
    '```python',
    'student["name"]',
    '```',
    '',
    '结果是：',
    '',
    '```python',
    '"Alice"',
    '```',
    '',
    '也可以使用 `get` 方法：',
    '',
    '```python',
    'student.get("name", "未知")',
    '```',
    '',
    '结果同样是：',
    '',
    '```python',
    '"Alice"',
    '```',
    '',
    '当键存在时，`student[key]` 和 `student.get(key, default)` 的结果通常相同。',
    '',
    '## 键不存在时的差异',
    '',
    '但当键不存在时，两者表现不同：',
    '',
    '```python',
    'student["age"]',
    '```',
    '',
    '由于 `"age"` 不存在于 `student` 中，这行代码会触发 `KeyError`。',
    '',
    '而：',
    '',
    '```python',
    'student.get("age", "未知")',
    '```',
    '',
    '不会触发错误，而是返回默认值：',
    '',
    '```python',
    '"未知"',
    '```',
    '',
    '因此，`student[key]` 适合用于确定键一定存在的场景；`student.get(key, default)` 更适合用于键可能不存在，并且需要默认值兜底的场景。',
    '',
    '可结合文末交互 Demo 修改查询键并点击运行按钮，观察两种访问方式在键存在和键不存在时的输出差异。',
    '',
    '## 小结',
    '',
    '`student[key]` 和 `student.get(key, default)` 都可以用来访问字典中的值。区别在于：当键不存在时，`student[key]` 会触发 `KeyError`，而 `student.get(key, default)` 会返回默认值。通过文末交互 Demo，可以直观比较两种写法在不同查询键下的行为差异。',
    '',
    '## 练习题',
    '',
    '1. 如果 `student = { "name": "Alice" }`，执行 `student["score"]` 会发生什么？',
    '2. 如果执行 `student.get("score", 0)`，返回结果是什么？',
    '3. 在读取用户配置时，为什么 `get` 方法通常比方括号访问更安全？',
    '',
    '## 交互 Demo',
    '',
    '### 字典键值访问',
    '',
    '<DictionaryAccessDemo',
    'title="字典键值访问"',
    'description="比较 student[key] 与 student.get(key, default) 在键存在和键不存在时的行为差异。"',
    'initialDictionary={{ name: "Alice", score: 95 }}',
    'inputs={[',
    '{ name: "key", label: "查询键", type: "text", defaultValue: "name" },',
    '{ name: "defaultValue", label: "默认值", type: "text", defaultValue: "未知" }',
    ']}',
    'outputs={[',
    '{ name: "bracketResult", label: "student[key] 的结果" },',
    '{ name: "getResult", label: "student.get(key, default) 的结果" },',
    '{ name: "errorStatus", label: "是否触发 KeyError" }',
    ']}',
    'buttons={[',
    '{ label: "查询存在的键", action: "useExistingKey" },',
    '{ label: "查询不存在的键", action: "useMissingKey" },',
    '{ label: "运行对比", action: "runComparison" },',
    '{ label: "重置", action: "reset" }',
    ']}',
    'compareCases={[',
    '{ label: "键存在", input: { key: "name" }, expected: "两种访问方式都返回 Alice" },',
    '{ label: "键不存在", input: { key: "age" }, expected: "student[key] 触发 KeyError，student.get 返回默认值 未知" }',
    ']}',
    'learnerTask="先点击“查询存在的键”并运行对比，再点击“查询不存在的键”并运行对比，判断哪种写法更适合处理不确定键是否存在的情况。"',
    '/>',
    '',
    '```',
    '',
    '---',
    '',
    '# 十一、最终检查规则',
    '',
    '生成最终笔记前，请检查：',
    '',
    '- 是否输出的是完整 Markdown / MDX 笔记。',
    '- 是否没有输出 React 实现代码。',
    '- 是否没有输出 JSON 配置块。',
    '- 是否没有输出 HTML 占位元素。',
    '- 是否没有输出 `<script>` 标签。',
    '- 如果生成了交互 Demo，是否存在 `## 交互 Demo` 小节。',
    '- `## 交互 Demo` 是否位于整篇笔记最后。',
    '- 每个 Demo 是否使用了具体的 MDX 组件调用。',
    '- 组件名称是否语义明确并以 `Demo` 结尾。',
    '- 是否包含具体的 inputs、outputs、buttons、compareCases 和 learnerTask。',
    '- 正文中是否自然提示学习者可结合文末交互 Demo 观察或操作。',
    '- Demo 是否真的能体现按钮、输入、输出、状态变化或对比，而不是纯文字描述。',
  ].join("\\n");
}

function buildNoteViewHref(slug: string): string {
  if (IS_CLOUD_MODE) {
    return `/notes/cloud?slug=${encodeURIComponent(slug)}`;
  }
  return `/notes/${slug}`;
}

function resolvePromptTemplateFileName(preset: PromptPreset): string {
  return preset === "detailed" ? "prompt2.md" : "prompt.md";
}

function buildPromptCandidates(fileName: string): string[] {
  const candidates = new Set<string>([`./${fileName}`]);

  if (typeof window !== "undefined") {
    const { origin, pathname } = window.location;
    const segments = pathname.split("/").filter(Boolean);
    const repoSegment = segments[0];

    if (repoSegment) {
      candidates.add(`/${repoSegment}/${fileName}`);
    }

    const currentDir = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
    if (currentDir) {
      candidates.add(`${currentDir}${fileName}`);
    }

    candidates.add(`/${fileName}`);

    for (const candidate of Array.from(candidates)) {
      try {
        candidates.add(new URL(candidate, origin).toString());
      } catch {
        // Ignore malformed URL candidates.
      }
    }
  }

  return Array.from(candidates);
}

async function loadPromptTemplateFromSite(preset: PromptPreset): Promise<string> {
  const candidates = buildPromptCandidates(resolvePromptTemplateFileName(preset));

  for (const candidate of candidates) {
    const response = await fetch(candidate, { cache: "no-store" });
    if (!response.ok) {
      continue;
    }

    const content = (await response.text()).trim();
    if (content) {
      return content;
    }
  }

  throw new Error(`无法读取 prompt.md，请确认该文件已发布到站点根目录。已尝试路径：${candidates.join("，")}`);
}

function resolvePdfWorkerSrcFromCurrentOrigin(): string {
  if (typeof window === "undefined") {
    return "/pdf.worker.min.mjs";
  }

  const scriptEl = document.querySelector<HTMLScriptElement>('script[src*="/_next/"]');
  let prefix = "";

  if (scriptEl?.src) {
    try {
      const scriptUrl = new URL(scriptEl.src, window.location.origin);
      const nextIndex = scriptUrl.pathname.indexOf("/_next/");
      if (nextIndex > 0) {
        prefix = scriptUrl.pathname.slice(0, nextIndex);
      }
    } catch {
      prefix = "";
    }
  }

  const normalized = `${prefix}/pdf.worker.min.mjs`.replace(/\/{2,}/g, "/");
  return new URL(normalized, window.location.origin).toString();
}

async function extractPdfText(file: File): Promise<string> {
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const typedPdfJs = pdfJs as unknown as {
    GlobalWorkerOptions: {
      workerSrc: string;
    };
    getDocument: (options: unknown) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }>;
    };
  };

  typedPdfJs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrcFromCurrentOrigin();

  const sourceData = new Uint8Array(await file.arrayBuffer());
  const pdf: {
    numPages: number;
    getPage: (pageNumber: number) => Promise<{
      getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    }>;
  } = await typedPdfJs.getDocument({
    data: sourceData,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (text) {
      pageTexts.push(text);
    }
  }

  return pageTexts.join("\n\n").trim();
}

async function resolveGenerationSourcePayload(sourceFile: File): Promise<GenerationSourcePayload> {
  const extension = fileExtension(sourceFile.name);
  if (extension === "doc" || extension === "ppt") {
    throw new Error("暂不支持旧版 .doc / .ppt，请先另存为 .docx / .pptx 后再上传。");
  }

  if (extension !== "pdf") {
    return {
      sourceFile,
      fileName: sourceFile.name,
    };
  }

  const sourceText = (await extractPdfText(sourceFile)).trim();
  if (!sourceText) {
    throw new Error("PDF 文件可读内容过少，请更换文件或转成 DOCX / TXT 后重试。");
  }

  return {
    sourceText,
    fileName: sourceFile.name,
  };
}

function appendGenerationSource(body: FormData, source: GenerationSourcePayload): void {
  if (source.sourceFile instanceof File) {
    body.append("sourceFile", source.sourceFile);
  }
  if (source.sourceText) {
    body.append("sourceText", source.sourceText);
  }
  body.append("fileName", source.fileName);
}

async function callLocalGenerator(params: {
  title: string;
  topic: string;
  tags: string;
  source: GenerationSourcePayload;
  extraInstruction: string;
  model: string;
  promptPreset: PromptPreset;
  generateInteractiveDemo: boolean;
}): Promise<GenerationResult> {
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  appendGenerationSource(body, params.source);
  body.append("model", params.model);
  body.append("promptPreset", params.promptPreset);
  body.append("generateInteractiveDemo", String(params.generateInteractiveDemo));
  if (params.extraInstruction) {
    body.append("extraInstruction", params.extraInstruction);
  }

  const response = await fetch("/api/note-generator", {
    method: "POST",
    body,
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerationResult> | null;

  if (!response.ok || !json) {
    throw new Error(json?.error || "生成失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("生成结果无效，请重试。");
  }

  return json as GenerationResult;
}

async function callCloudGenerator(params: {
  title: string;
  topic: string;
  tags: string;
  source: GenerationSourcePayload;
  extraInstruction: string;
  model: string;
  promptPreset: PromptPreset;
  authToken: string;
  generateInteractiveDemo: boolean;
}): Promise<GenerationResult> {
  const promptTemplate = await loadPromptTemplateFromSite(params.promptPreset);
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const body = new FormData();
  body.append("title", params.title);
  body.append("topic", params.topic);
  body.append("tags", params.tags);
  appendGenerationSource(body, params.source);
  body.append("promptTemplate", promptTemplate);
  body.append("model", params.model);
  body.append("generateInteractiveDemo", String(params.generateInteractiveDemo));
  if (params.extraInstruction) {
    body.append("extraInstruction", params.extraInstruction);
  }

  const response = await fetch(`${apiBase}/notes/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.authToken}`,
    },
    body,
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<GenerationResult> | null;

  if (!response.ok || !json) {
    throw new Error(json?.error || "云端生成失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("云端返回了无效结果，请重试。");
  }

  return json as GenerationResult;
}

async function callLocalMetadataUpdate(params: {
  slug: string;
  title: string;
  topic: string;
  tags: string[];
}): Promise<MetadataUpdateResult> {
  const response = await fetch("/api/note-generator", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<MetadataUpdateResult> | null;
  if (!response.ok || !json) {
    throw new Error(json?.error || "更新元信息失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("元信息更新结果无效，请重试。");
  }

  return json as MetadataUpdateResult;
}

async function callCloudMetadataUpdate(params: {
  slug: string;
  title: string;
  topic: string;
  tags: string[];
  authToken: string;
}): Promise<MetadataUpdateResult> {
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.authToken}`,
  };

  const response = await fetch(`${apiBase}/notes/${encodeURIComponent(params.slug)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as { error?: string } & Partial<MetadataUpdateResult> | null;
  if (!response.ok || !json) {
    throw new Error(json?.error || "云端元信息更新失败，请稍后重试。");
  }

  if (!json.success || !json.slug) {
    throw new Error("云端元信息更新结果无效，请重试。");
  }

  return json as MetadataUpdateResult;
}

async function createImportedLocalNote(params: {
  title: string;
  topic: string;
  content: string;
  generateInteractiveDemo: boolean;
}): Promise<ImportedNoteResult> {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = (await response.json().catch(() => null)) as ImportedNoteResult | null;
  if (!response.ok || !json?.success || !json.slug) {
    throw new Error(json?.error || "保存 ChatGPT 结果失败，请稍后重试。");
  }

  return json;
}

async function createImportedCloudNote(params: {
  title: string;
  topic: string;
  content: string;
  authToken: string;
  generateInteractiveDemo: boolean;
}): Promise<ImportedNoteResult> {
  const apiBase = normalizeApiBase(CLOUD_API_BASE);
  const response = await fetch(`${apiBase}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.authToken}`,
    },
    body: JSON.stringify({
      title: params.title,
      topic: params.topic,
      content: params.content,
      generateInteractiveDemo: params.generateInteractiveDemo,
    }),
  });

  const json = (await response.json().catch(() => null)) as ImportedNoteResult | null;
  if (!response.ok || !json?.success || !json.slug) {
    throw new Error(json?.error || "保存 ChatGPT 结果失败，请稍后重试。");
  }

  return json;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring ${props.className ?? ""}`}
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] leading-[1.45] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring ${props.className ?? ""}`}
    />
  );
}

export function WeekNoteGenerator() {
  const router = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState<GeneratorMode>("direct");
  const [selectedPromptPreset, setSelectedPromptPreset] = useState<PromptPreset>("standard");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [tags, setTags] = useState("");
  const [extraInstruction, setExtraInstruction] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4.1-mini");
  const [generateInteractiveDemo, setGenerateInteractiveDemo] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [buildingChatGptPrompt, setBuildingChatGptPrompt] = useState(false);
  const [chatGptPrompt, setChatGptPrompt] = useState("");
  const [copiedChatGptPrompt, setCopiedChatGptPrompt] = useState(false);
  const [chatGptMarkdown, setChatGptMarkdown] = useState("");
  const [savingChatGptMarkdown, setSavingChatGptMarkdown] = useState(false);
  const [runningAutoChatGpt, setRunningAutoChatGpt] = useState(false);
  const [autoChatGptStatus, setAutoChatGptStatus] = useState("");
  const [autoChatGptWarnings, setAutoChatGptWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editTags, setEditTags] = useState("");

  function handleSourceFileChange(file: File | null) {
    setSourceFile(file);
    if (!file) {
      return;
    }

    const derived = deriveMetadataFromFileName(file.name);
    setTitle((current) => (current.trim() ? current : derived.title));
    setTopic((current) => (current.trim() ? current : derived.topic));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceFile) {
      setError("请先上传原始资料文件。");
      return;
    }

    if (IS_CLOUD_MODE && !session?.token) {
      setError("请先登录后再生成云端笔记。");
      return;
    }

    setSubmitting(true);
    setError("");
    setResult(null);

    try {
      const source = await resolveGenerationSourcePayload(sourceFile);
      const payload = {
        title: title.trim(),
        topic: topic.trim(),
        tags: tags.trim(),
        source,
        extraInstruction: extraInstruction.trim(),
        model: selectedModel,
        promptPreset: selectedPromptPreset,
        authToken: session?.token || "",
        generateInteractiveDemo,
      };

      const generationResult = IS_CLOUD_MODE ? await callCloudGenerator(payload) : await callLocalGenerator(payload);

      setResult(generationResult);
      setEditTitle(generationResult.note?.zhTitle ?? payload.title);
      setEditTopic(generationResult.note?.weekLabelZh ?? payload.topic);
      setEditTags((generationResult.note?.tags ?? parseTagsInput(payload.tags)).join(", "));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveMetadata() {
    if (!result?.slug) {
      return;
    }

    if (IS_CLOUD_MODE && !session?.token) {
      setError("登录状态已失效，请重新登录。");
      return;
    }

    setSavingMeta(true);
    setError("");

    try {
      const payload = {
        slug: result.slug,
        title: editTitle.trim(),
        topic: editTopic.trim(),
        tags: parseTagsInput(editTags),
        authToken: session?.token || "",
      };

      const updated = IS_CLOUD_MODE ? await callCloudMetadataUpdate(payload) : await callLocalMetadataUpdate(payload);

      if (updated.note) {
        setResult((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            note: updated.note,
          };
        });
        setEditTitle(updated.note.zhTitle);
        setEditTopic(updated.note.weekLabelZh);
        setEditTags((updated.note.tags ?? []).join(", "));
      }

      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "更新元信息失败，请稍后重试。");
    } finally {
      setSavingMeta(false);
    }
  }

  async function buildChatGptPromptText(): Promise<string> {
    if (!sourceFile) {
      throw new Error("请先上传原始资料文件。");
    }

    const promptTemplate = await loadPromptTemplateFromSite(selectedPromptPreset);
    const derived = deriveMetadataFromFileName(sourceFile.name);
    const resolvedTitle = title.trim() || derived.title || "请根据上传资料自动生成标题";
    const resolvedTopic = topic.trim() || derived.topic || "请根据上传资料自动生成主题";
    const resolvedTags = parseTagsInput(tags).join("、") || "未指定，可根据资料补全";
    return [
      promptTemplate.trim(),
      "",
      "---",
      "",
      "以下是本次生成任务的补充上下文，请与系统要求一起严格执行：",
      `- 目标标题：${resolvedTitle}`,
      `- 目标主题：${resolvedTopic}`,
      `- 目标标签：${resolvedTags}`,
      `- 原始资料文件名：${sourceFile.name}`,
      `- 需要交互 Demo：${generateInteractiveDemo ? "是" : "否"}`,
      "- 我会在当前 ChatGPT 对话中上传同一份原始资料文件，请以该文件为主要内容来源。",
      "- 请直接输出最终 Markdown / MDX 笔记，不要输出解释、分析、前言、后记或代码围栏。",
      "- 输出内容需要可以直接粘贴回 YYNotes 保存。",
      generateInteractiveDemo ? buildInteractiveDemoPromptBlockForChatGpt() : "",
      extraInstruction.trim() ? `- 额外说明：${extraInstruction.trim()}` : "- 额外说明：无",
    ].join("\n");
  }

  async function onBuildChatGptPrompt() {
    if (!sourceFile) {
      setError("请先上传原始资料文件。");
      return;
    }

    setBuildingChatGptPrompt(true);
    setError("");
    setCopiedChatGptPrompt(false);

    try {
      const prompt = await buildChatGptPromptText();
      setChatGptPrompt(prompt);
    } catch (promptError) {
      setError(promptError instanceof Error ? promptError.message : "生成 ChatGPT Prompt 失败。");
    } finally {
      setBuildingChatGptPrompt(false);
    }
  }

  async function onCopyChatGptPrompt() {
    if (!chatGptPrompt.trim()) {
      setError("请先生成 ChatGPT Prompt。");
      return;
    }

    try {
      await navigator.clipboard.writeText(chatGptPrompt);
      setCopiedChatGptPrompt(true);
    } catch {
      setError("复制 Prompt 失败，请手动复制。");
    }
  }

  function onOpenChatGpt() {
    if (typeof window === "undefined") {
      return;
    }

    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  }

  async function saveImportedMarkdownContent(markdown: string): Promise<string> {
    const derived = deriveMetadataFromFileName(sourceFile?.name ?? "");
    const resolvedTitle = title.trim() || derived.title;
    const resolvedTopic = topic.trim() || derived.topic;
    const resolvedMarkdown = markdown.trim();

    if (!resolvedTitle) {
      throw new Error("请先填写或确认笔记标题。");
    }

    if (!resolvedTopic) {
      throw new Error("请先填写或确认笔记主题。");
    }

    if (!resolvedMarkdown) {
      throw new Error("请先提供 ChatGPT 生成的 Markdown / MDX。");
    }

    if (IS_CLOUD_MODE && !session?.token) {
      throw new Error("请先登录后再保存云端笔记。");
    }

    const saved = IS_CLOUD_MODE
      ? await createImportedCloudNote({
          title: resolvedTitle,
          topic: resolvedTopic,
          content: resolvedMarkdown,
          authToken: session?.token || "",
          generateInteractiveDemo,
        })
      : await createImportedLocalNote({
          title: resolvedTitle,
          topic: resolvedTopic,
          content: resolvedMarkdown,
          generateInteractiveDemo,
        });

    if (!saved.slug) {
      throw new Error("保存成功，但未返回笔记链接。");
    }

    return saved.slug;
  }

  async function onSaveChatGptResult() {
    setSavingChatGptMarkdown(true);
    setError("");

    try {
      const slug = await saveImportedMarkdownContent(chatGptMarkdown);
      router.push(buildNoteViewHref(slug));
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 ChatGPT 结果失败，请稍后重试。");
    } finally {
      setSavingChatGptMarkdown(false);
    }
  }

  async function onRunAutoChatGpt() {
    if (IS_CLOUD_MODE) {
      setError("全自动 GPT 网页操控仅支持本机运行的 Next 服务，云端部署环境暂不支持。");
      return;
    }

    if (!sourceFile) {
      setError("请先上传原始资料文件。");
      return;
    }

    setRunningAutoChatGpt(true);
    setError("");
    setAutoChatGptWarnings([]);
    setAutoChatGptStatus("");

    try {
      setAutoChatGptStatus("正在生成自动化 Prompt...");
      const prompt = await buildChatGptPromptText();
      setChatGptPrompt(prompt);
      setCopiedChatGptPrompt(false);

      const formData = new FormData();
      formData.set("prompt", prompt);
      formData.set("sourceFile", sourceFile);

      setAutoChatGptStatus("正在启动本机浏览器并操控 ChatGPT，首次使用时请在弹出的浏览器中完成登录...");
      const response = await fetch("/api/chatgpt-web-automation", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; markdown?: string; warnings?: string[]; error?: string }
        | null;

      if (!response.ok || !data?.success || !data.markdown) {
        throw new Error(data?.error || "自动化执行失败。");
      }

      setChatGptMarkdown(data.markdown);
      setAutoChatGptWarnings(Array.isArray(data.warnings) ? data.warnings : []);

      setAutoChatGptStatus("ChatGPT 已返回结果，正在自动保存笔记...");
      const slug = await saveImportedMarkdownContent(data.markdown);
      setAutoChatGptStatus("已完成自动生成并保存，正在跳转到笔记页面...");
      router.push(buildNoteViewHref(slug));
      router.refresh();
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : "全自动 GPT 网页操控失败。");
      setAutoChatGptStatus("");
    } finally {
      setRunningAutoChatGpt(false);
    }
  }

  return (
    <section className="mb-8 rounded-apple bg-card p-5 text-card-foreground shadow-card">
      <div className="mb-4">
        <h3 className="font-display text-[28px] font-normal leading-[1.14] tracking-[0.196px] text-foreground">
          上传资料并生成笔记
        </h3>
        <p className="mt-2 max-w-[860px] font-text text-[14px] leading-[1.45] tracking-tightCaption text-muted-foreground">
          按“标题 + 主题 + 标签”方式生成通用 MDX 笔记，适用于任意学科。
          <span className="ui-en ml-1">Generate structured MDX notes using title, topic, and tags.</span>
        </p>
        {IS_CLOUD_MODE ? (
          <p className="mt-2 rounded-apple border border-primary/35 bg-primary/10 px-3 py-2 font-text text-[12px] leading-[1.4] text-muted-foreground">
            当前为云端模式：将请求远程笔记 API 并存储到 Neon 数据库，且只写入当前登录账号。
          </p>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("direct")}
          className={`inline-flex items-center rounded-capsule px-4 py-2 font-text text-[13px] transition focus-visible:outline-none ${
            mode === "direct" ? "bg-primary text-primary-foreground" : "border border-input bg-background text-foreground"
          }`}
        >
          站内直接生成
        </button>
        <button
          type="button"
          onClick={() => setMode("chatgpt")}
          className={`inline-flex items-center rounded-capsule px-4 py-2 font-text text-[13px] transition focus-visible:outline-none ${
            mode === "chatgpt" ? "bg-primary text-primary-foreground" : "border border-input bg-background text-foreground"
          }`}
        >
          ChatGPT 辅助生成
        </button>
        <button
          type="button"
          onClick={() => setMode("autogpt")}
          disabled={IS_CLOUD_MODE}
          className={`inline-flex items-center rounded-capsule px-4 py-2 font-text text-[13px] transition focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55 ${
            mode === "autogpt" ? "bg-primary text-primary-foreground" : "border border-input bg-background text-foreground"
          }`}
        >
          全自动 GPT 网页操控
        </button>
      </div>

      <div className="mb-4 rounded-apple border border-input bg-background p-3">
        <div className="flex flex-wrap items-center gap-3">
          <SectionLabel>Prompt 预设</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {PROMPT_PRESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedPromptPreset(option.value)}
                className={`inline-flex items-center rounded-capsule px-3 py-1.5 font-text text-[12px] transition focus-visible:outline-none ${
                  selectedPromptPreset === option.value
                    ? "bg-primary text-primary-foreground"
                    : "border border-input bg-card text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 font-text text-[12px] leading-[1.45] text-muted-foreground">
          {PROMPT_PRESET_OPTIONS.find((option) => option.value === selectedPromptPreset)?.description}
        </p>
      </div>

      {mode === "direct" ? (
        <>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <SectionLabel>AI Model</SectionLabel>
              <div className="flex flex-wrap items-center gap-3 rounded-apple border border-input bg-background px-3 py-2">
                <AIModelSelector
                  models={NOTE_GENERATION_MODEL_OPTIONS}
                  value={selectedModel}
                  onValueChange={setSelectedModel}
                  disabled={submitting}
                  triggerClassName="h-8 rounded-full px-2 text-[12px] text-foreground dark:text-foreground"
                  contentClassName="font-text"
                />
                <p className="font-text text-[12px] leading-[1.4] text-muted-foreground">
                  GPT-4.1 Mini is selected by default for stable note generation; switch to Qwen3.6 Flash if you want a lower-cost Chinese-first option.
                </p>
              </div>
            </div>

            <label className="space-y-2 md:col-span-2">
              <SectionLabel>标题（可选，留空自动生成）</SectionLabel>
              <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：极限与连续性核心概念" />
              <p className="font-text text-[12px] leading-[1.4] text-muted-foreground">留空时将自动生成标题、主题和标签。</p>
            </label>

            <label className="space-y-2">
              <SectionLabel>主题（可选）</SectionLabel>
              <TextInput value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：微积分基础" />
            </label>

            <label className="space-y-2">
              <SectionLabel>标签（可选）</SectionLabel>
              <TextInput value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：定义, 定理, 证明" />
            </label>

            <label className="space-y-2 md:col-span-2">
              <SectionLabel>原始资料文件</SectionLabel>
              <TextInput
                type="file"
                accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.pdf,.tex,.csv"
                onChange={(event) => handleSourceFileChange(event.target.files?.[0] ?? null)}
                className="file:mr-3 file:rounded-capsule file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[12px] file:text-primary-foreground hover:file:bg-primary/90"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <SectionLabel>额外说明（可选）</SectionLabel>
              <TextArea
                value={extraInstruction}
                onChange={(event) => setExtraInstruction(event.target.value)}
                rows={3}
                placeholder="可填写特殊整理要求，如：强调考试易错点。"
              />
            </label>

            <label className="md:col-span-2 inline-flex items-start gap-3 rounded-apple border border-input bg-background px-3 py-3">
              <input
                type="checkbox"
                checked={generateInteractiveDemo}
                onChange={(event) => setGenerateInteractiveDemo(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span className="font-text text-[13px] leading-[1.45] text-muted-foreground">
                生成交互 demo（可选）
                <span className="ui-en ml-1">Add interactive demos if the note contains supported interactive concepts.</span>
              </span>
            </label>

            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting || (IS_CLOUD_MODE && !session?.token)}
                className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {submitting ? "生成中..." : IS_CLOUD_MODE && !session?.token ? "请先登录" : "生成并保存笔记"}
              </button>

              <Link
                href="/notes"
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
              >
                查看笔记列表
              </Link>
            </div>
          </form>

          {result ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-apple border border-primary/35 bg-primary/10 p-3">
                <p className="font-text text-[13px] leading-[1.45] text-foreground">已保存 {result.fileName}。</p>
                <Link
                  href={buildNoteViewHref(result.slug)}
                  className="btn-apple-link mt-2 inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
                >
                  打开生成结果
                  <span className="ml-1">&gt;</span>
                </Link>
              </div>

              <section className="rounded-apple border border-border bg-card p-4">
                <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
                  生成后可修改元信息
                  <span className="ui-en ml-1">Edit Metadata After Generation</span>
                </p>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="font-text text-[12px] text-black/62 dark:text-white/66">标题</span>
                    <TextInput value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="留空将保留当前标题" className="text-[14px]" />
                  </label>

                  <label className="space-y-1">
                    <span className="font-text text-[12px] text-black/62 dark:text-white/66">主题</span>
                    <TextInput value={editTopic} onChange={(event) => setEditTopic(event.target.value)} placeholder="留空将自动兜底生成主题" className="text-[14px]" />
                  </label>

                  <label className="space-y-1">
                    <span className="font-text text-[12px] text-black/62 dark:text-white/66">标签</span>
                    <TextInput value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="用逗号分隔，如：定义, 推导, 例题" className="text-[14px]" />
                  </label>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    disabled={savingMeta}
                    onClick={onSaveMetadata}
                    className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
                  >
                    {savingMeta ? "保存中..." : "保存元信息修改"}
                  </button>
                </div>
              </section>

              {result.note ? (
                <WeekCard
                  href={buildNoteViewHref(result.note.slug)}
                  weekLabelZh={result.note.weekLabelZh}
                  weekLabelEn={result.note.weekLabelEn}
                  zhTitle={result.note.zhTitle}
                  enTitle={result.note.enTitle}
                  descriptionZh={result.note.descriptionZh}
                  descriptionEn={result.note.descriptionEn}
                  tags={result.note.tags}
                  className="max-w-[420px]"
                />
              ) : null}

              <details className="rounded-apple border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer font-text text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  预览前几行
                </summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-apple bg-muted p-3 font-mono text-[12px] leading-[1.45] text-muted-foreground">
                  {result.preview}
                </pre>
              </details>
            </div>
          ) : null}
        </>
      ) : mode === "chatgpt" ? (
        <div className="space-y-4">
          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 1：整理输入
              <span className="ui-en ml-1">Prepare Inputs</span>
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <SectionLabel>标题</SectionLabel>
                <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：死锁与资源分配图" />
              </label>

              <label className="space-y-2">
                <SectionLabel>主题</SectionLabel>
                <TextInput value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：操作系统 / Operating Systems" />
              </label>

              <label className="space-y-2">
                <SectionLabel>标签（可选）</SectionLabel>
                <TextInput value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：死锁, 资源分配图, 同步" />
              </label>

              <label className="space-y-2 md:col-span-2">
                <SectionLabel>原始资料文件</SectionLabel>
                <TextInput
                  type="file"
                  accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.pdf,.tex,.csv"
                  onChange={(event) => handleSourceFileChange(event.target.files?.[0] ?? null)}
                  className="file:mr-3 file:rounded-capsule file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[12px] file:text-primary-foreground hover:file:bg-primary/90"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <SectionLabel>额外说明（可选）</SectionLabel>
                <TextArea
                  value={extraInstruction}
                  onChange={(event) => setExtraInstruction(event.target.value)}
                  rows={3}
                  placeholder="可填写特殊整理要求，如：更适合考试复习，保留关键例题。"
                />
              </label>

              <label className="md:col-span-2 inline-flex items-start gap-3 rounded-apple border border-input bg-card px-3 py-3">
                <input
                  type="checkbox"
                  checked={generateInteractiveDemo}
                  onChange={(event) => setGenerateInteractiveDemo(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="font-text text-[13px] leading-[1.45] text-muted-foreground">
                  生成交互 demo（可选）
                  <span className="ui-en ml-1">The generated prompt will ask ChatGPT to include interactive demo content when applicable.</span>
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onBuildChatGptPrompt()}
                disabled={buildingChatGptPrompt}
                className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {buildingChatGptPrompt ? "生成 Prompt 中..." : "生成 ChatGPT Prompt"}
              </button>
            </div>
          </section>

          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 2：发送到 ChatGPT
              <span className="ui-en ml-1">Send to ChatGPT</span>
            </p>

            <p className="mt-3 font-text text-[13px] leading-[1.45] text-muted-foreground">
              推荐流程：打开 ChatGPT，选择 GPT-5.4，上传同一份原始资料文件，再粘贴下面的 Prompt。
            </p>

            <TextArea
              value={chatGptPrompt}
              readOnly
              rows={12}
              placeholder="点击上方“生成 ChatGPT Prompt”后，这里会出现完整 Prompt。"
              className="mt-3 font-mono text-[12px] leading-[1.5]"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onCopyChatGptPrompt()}
                disabled={!chatGptPrompt.trim()}
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {copiedChatGptPrompt ? "已复制 Prompt" : "复制 Prompt"}
              </button>

              <button
                type="button"
                onClick={onOpenChatGpt}
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
              >
                打开 ChatGPT
              </button>
            </div>
          </section>

          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 3：粘贴结果并保存
              <span className="ui-en ml-1">Paste Result and Save</span>
            </p>

            <TextArea
              value={chatGptMarkdown}
              onChange={(event) => setChatGptMarkdown(event.target.value)}
              rows={14}
              placeholder="把 ChatGPT 返回的 Markdown / MDX 结果粘贴到这里，然后保存为笔记。"
              className="mt-3 font-mono text-[12px] leading-[1.5]"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onSaveChatGptResult()}
                disabled={savingChatGptMarkdown}
                className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {savingChatGptMarkdown ? "保存中..." : "保存为笔记"}
              </button>

              <Link
                href="/notes"
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
              >
                查看笔记列表
              </Link>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 1：整理输入
              <span className="ui-en ml-1">Prepare Inputs</span>
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <SectionLabel>标题</SectionLabel>
                <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：死锁与资源分配图" />
              </label>

              <label className="space-y-2">
                <SectionLabel>主题</SectionLabel>
                <TextInput value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：操作系统 / Operating Systems" />
              </label>

              <label className="space-y-2">
                <SectionLabel>标签（可选）</SectionLabel>
                <TextInput value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：死锁, 资源分配图, 同步" />
              </label>

              <label className="space-y-2 md:col-span-2">
                <SectionLabel>原始资料文件</SectionLabel>
                <TextInput
                  type="file"
                  accept=".txt,.md,.markdown,.doc,.docx,.ppt,.pptx,.pdf,.tex,.csv"
                  onChange={(event) => handleSourceFileChange(event.target.files?.[0] ?? null)}
                  className="file:mr-3 file:rounded-capsule file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[12px] file:text-primary-foreground hover:file:bg-primary/90"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <SectionLabel>额外说明（可选）</SectionLabel>
                <TextArea
                  value={extraInstruction}
                  onChange={(event) => setExtraInstruction(event.target.value)}
                  rows={3}
                  placeholder="可填写特殊整理要求，如：更适合考试复习，保留关键例题。"
                />
              </label>

              <label className="md:col-span-2 inline-flex items-start gap-3 rounded-apple border border-input bg-card px-3 py-3">
                <input
                  type="checkbox"
                  checked={generateInteractiveDemo}
                  onChange={(event) => setGenerateInteractiveDemo(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="font-text text-[13px] leading-[1.45] text-muted-foreground">
                  生成交互 demo（可选）
                  <span className="ui-en ml-1">Automation mode will still append the interactive-demo prompt when this is checked.</span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              步骤 2：启动本机自动化
              <span className="ui-en ml-1">Run Local Browser Automation</span>
            </p>

            <div className="mt-3 rounded-apple border border-primary/25 bg-primary/10 px-3 py-3 font-text text-[13px] leading-[1.5] text-muted-foreground">
              <p>这个模式会在你的本机启动浏览器，自动打开 ChatGPT、上传资料、提交 Prompt、抓取 Markdown 结果并直接保存回 YYNotes。</p>
              <p className="mt-2">首次使用时，你可能需要在自动化启动的浏览器里手动登录 ChatGPT 一次；之后会复用同一个本地浏览器资料目录。</p>
              <p className="mt-2">这个功能仅支持本机运行的 Next 服务，Cloudflare Pages / 静态部署环境不会启用。</p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onRunAutoChatGpt()}
                disabled={runningAutoChatGpt}
                className="btn-apple-primary inline-flex items-center rounded-apple px-5 py-2 font-text text-[15px] transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {runningAutoChatGpt ? "自动执行中..." : "启动全自动生成并保存"}
              </button>

              <button
                type="button"
                onClick={() => void onBuildChatGptPrompt()}
                disabled={buildingChatGptPrompt || runningAutoChatGpt}
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {buildingChatGptPrompt ? "生成 Prompt 中..." : "预览自动化 Prompt"}
              </button>
            </div>

            {autoChatGptStatus ? (
              <p className="mt-3 rounded-apple border border-border bg-card px-3 py-2 font-text text-[13px] leading-[1.45] text-muted-foreground">
                {autoChatGptStatus}
              </p>
            ) : null}

            {autoChatGptWarnings.length > 0 ? (
              <div className="mt-3 rounded-apple border border-amber-400/35 bg-amber-500/10 px-3 py-3">
                <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-amber-800 dark:text-amber-200">
                  自动化提示
                </p>
                <ul className="mt-2 space-y-1 font-text text-[13px] leading-[1.45] text-amber-900/90 dark:text-amber-100">
                  {autoChatGptWarnings.map((warning) => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              自动化 Prompt 预览
              <span className="ui-en ml-1">Prompt Preview</span>
            </p>

            <TextArea
              value={chatGptPrompt}
              readOnly
              rows={10}
              placeholder="点击“预览自动化 Prompt”或直接启动自动化后，这里会出现最终发送给 ChatGPT 的 Prompt。"
              className="mt-3 font-mono text-[12px] leading-[1.5]"
            />
          </section>

          <section className="rounded-apple border border-border bg-background p-4">
            <p className="font-text text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
              自动抓取结果
              <span className="ui-en ml-1">Captured Markdown</span>
            </p>

            <TextArea
              value={chatGptMarkdown}
              onChange={(event) => setChatGptMarkdown(event.target.value)}
              rows={12}
              placeholder="自动化成功后，这里会显示从 ChatGPT 网页抓取到的 Markdown / MDX；如果自动保存失败，你也可以直接手动点保存。"
              className="mt-3 font-mono text-[12px] leading-[1.5]"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onSaveChatGptResult()}
                disabled={savingChatGptMarkdown || runningAutoChatGpt || !chatGptMarkdown.trim()}
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none"
              >
                {savingChatGptMarkdown ? "保存中..." : "手动保存当前结果"}
              </button>

              <Link
                href="/notes"
                className="btn-apple-link inline-flex items-center px-4 py-1.5 font-text text-[14px] tracking-tightCaption transition focus-visible:outline-none"
              >
                查看笔记列表
              </Link>
            </div>
          </section>
        </div>
      )}

      {error ? (
        <p className="mt-4 rounded-apple border border-[#b4232f]/30 bg-[#b4232f]/[0.08] px-3 py-2 font-text text-[13px] leading-[1.4] text-[#7f1820] dark:border-[#ff6a77]/35 dark:bg-[#ff6a77]/[0.12] dark:text-[#ffd5da]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
