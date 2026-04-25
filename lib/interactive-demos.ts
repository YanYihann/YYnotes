import { splitBilingualNoteSections } from "@/lib/bilingual-note";

export type InteractiveDemoDescriptor = {
  key: string;
  anchorId: string;
  href: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  keywords: string[];
};

export type InteractiveDesignControl =
  | {
      id: string;
      type: "select";
      labelZh: string;
      labelEn: string;
      optionsZh: string[];
      optionsEn: string[];
      initialIndex?: number;
    }
  | {
      id: string;
      type: "slider";
      labelZh: string;
      labelEn: string;
      min: number;
      max: number;
      step?: number;
      initialValue?: number;
      unitZh?: string;
      unitEn?: string;
    }
  | {
      id: string;
      type: "toggle";
      labelZh: string;
      labelEn: string;
      initialValue?: boolean;
    };

export type InteractiveDesignSpec = {
  key: string;
  anchorId: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  observationsZh: string[];
  observationsEn: string[];
  tasksZh: string[];
  tasksEn: string[];
  controls: InteractiveDesignControl[];
};

export const INTERACTIVE_DEMO_REGISTRY: InteractiveDemoDescriptor[] = [
  {
    key: "differentiation",
    anchorId: "interactive-demo-differentiation",
    href: "/demos/numerical-differentiation",
    titleZh: "数值微分参数探索",
    titleEn: "Numerical Differentiation Explorer",
    descriptionZh: "调整函数、评估点和步长，观察有限差分如何影响导数估计。",
    descriptionEn: "Adjust the function, evaluation point, and step size to see how finite differences affect derivative estimates.",
    keywords: ["数值微分", "三点差分", "差分公式", "导数估计", "finite difference", "numerical differentiation", "three-point"],
  },
  {
    key: "integration",
    anchorId: "interactive-demo-integration",
    href: "/demos/numerical-integration",
    titleZh: "数值积分方法演示",
    titleEn: "Numerical Integration Explorer",
    descriptionZh: "切换积分方法并修改区间与分割数，观察近似面积与误差变化。",
    descriptionEn: "Switch methods and change the interval or partition count to compare approximate area and error.",
    keywords: ["数值积分", "梯形公式", "辛普森", "积分近似", "trapezoidal", "simpson", "numerical integration"],
  },
  {
    key: "integration-comparison",
    anchorId: "interactive-demo-integration-comparison",
    href: "/demos/integration-comparison",
    titleZh: "积分方法误差比较",
    titleEn: "Integration Error Comparison",
    descriptionZh: "并排比较不同积分方法在误差和收敛趋势上的差异。",
    descriptionEn: "Compare multiple integration methods side by side and inspect their error trends.",
    keywords: [
      "积分方法比较",
      "积分误差比较",
      "数值积分比较",
      "积分方法误差",
      "梯形公式",
      "辛普森",
      "龙贝格",
      "integration method",
      "numerical integration",
      "quadrature",
      "trapezoidal",
      "simpson",
      "romberg",
    ],
  },
  {
    key: "romberg",
    anchorId: "interactive-demo-romberg",
    href: "/demos/romberg",
    titleZh: "Romberg 外推演示",
    titleEn: "Romberg Extrapolation Demo",
    descriptionZh: "观察网格加密与 Richardson 外推如何逐步提升积分精度。",
    descriptionEn: "See how grid refinement and Richardson extrapolation progressively improve integration accuracy.",
    keywords: ["romberg", "理查森外推", "romberg integration", "richardson extrapolation", "龙贝格"],
  },
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function stripMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();
}

function parseZhBodySections(body: string): Array<{ heading: string; content: string }> {
  const lines = body.split("\n");
  const sections: Array<{ heading: string; content: string }> = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeading) {
      currentLines = [];
      return;
    }
    sections.push({
      heading: stripMarkdown(currentHeading),
      content: currentLines.join("\n").trim(),
    });
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.trim().match(/^#{2,4}\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
}

function collectBullets(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line))
    .map((line) => stripMarkdown(line.replace(/^[-*+]\s+/, "")))
    .filter(Boolean);
}

function buildConceptPool(title: string, topic: string, zhBody: string): string[] {
  const sections = parseZhBodySections(zhBody);
  const keyConceptSection = sections.find((section) => section.heading === "关键概念");
  const conceptBullets = keyConceptSection ? collectBullets(keyConceptSection.content) : [];
  const majorHeadings = sections
    .map((section) => section.heading)
    .filter((heading) => !["学习目标", "关键概念", "小结", "交互 Demo"].includes(heading));

  return Array.from(
    new Set(
      [title, topic, ...conceptBullets, ...majorHeadings]
        .map((item) => stripMarkdown(item))
        .map((item) => item.replace(/[：:]\s*$/, "").trim())
        .filter((item) => item.length >= 2),
    ),
  ).slice(0, 6);
}

function buildDesignSpecs(title: string, topic: string, zhBody: string): InteractiveDesignSpec[] {
  const conceptPool = buildConceptPool(title, topic, zhBody);
  if (!conceptPool.length) {
    return [];
  }

  const focusOptions = conceptPool.slice(0, 4);
  const scenarioLabel = topic || title;

  return conceptPool.slice(0, 2).map((concept, index) => ({
    key: `generated-${toKebabCase(concept) || `demo-${index + 1}`}`,
    anchorId: `generated-interactive-demo-${toKebabCase(concept) || index + 1}`,
    titleZh: `${concept} 交互设计`,
    titleEn: `Interactive design for ${concept}`,
    summaryZh: `围绕“${concept}”切换关键变量，观察 ${scenarioLabel || concept} 在不同情境下的变化与判断依据。`,
    summaryEn: `Explore how ${concept} changes across different scenarios and control settings.`,
    observationsZh: [
      `观察当场景复杂度提高时，“${concept}”的判断依据会先发生什么变化。`,
      `对比不同观察重点下，${scenarioLabel || concept} 的关键结论是否一致。`,
      "尝试打开提示开关，再回到无提示状态，比较你自己的推理路径。",
    ],
    observationsEn: [
      `Observe which part of ${concept} changes first as scenario complexity increases.`,
      `Compare whether the key conclusion stays consistent across different focus settings.`,
      "Toggle the hint layer on and off to compare your own reasoning path.",
    ],
    tasksZh: [
      `先用默认设置理解“${concept}”的基本情境。`,
      `再切换一个观察重点，说明你的判断为什么改变或没有改变。`,
      "最后记录你最容易混淆的一步，并尝试口头解释给自己听。",
    ],
    tasksEn: [
      `Start with the default setup to understand the baseline idea behind ${concept}.`,
      "Switch to another focus and explain why your conclusion changes or stays the same.",
      "Record the step that feels most confusing and explain it in your own words.",
    ],
    controls: [
      {
        id: "focus",
        type: "select",
        labelZh: "观察重点",
        labelEn: "Focus",
        optionsZh: focusOptions,
        optionsEn: focusOptions,
        initialIndex: Math.min(index, Math.max(0, focusOptions.length - 1)),
      },
      {
        id: "complexity",
        type: "slider",
        labelZh: "场景复杂度",
        labelEn: "Scenario Complexity",
        min: 1,
        max: 5,
        step: 1,
        initialValue: 3,
        unitZh: "级",
        unitEn: "level",
      },
      {
        id: "hints",
        type: "toggle",
        labelZh: "显示判断提示",
        labelEn: "Show Hint Layer",
        initialValue: true,
      },
    ],
  }));
}

function encodeSpec(spec: InteractiveDesignSpec): string {
  return encodeURIComponent(JSON.stringify(spec));
}

function safeQuotedMatch(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractBalancedProp(source: string, name: string): string {
  const propIndex = source.search(new RegExp(`${name}\\s*=`, "i"));
  if (propIndex < 0) {
    return "";
  }

  let cursor = propIndex + name.length;
  while (cursor < source.length && /\s|=/.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  if ((source[cursor] ?? "") === '"') {
    let end = cursor + 1;
    while (end < source.length) {
      const current = source[end] ?? "";
      if (current === '"' && source[end - 1] !== "\\") {
        return source.slice(cursor + 1, end).trim();
      }
      end += 1;
    }
    return "";
  }

  if ((source[cursor] ?? "") !== "{") {
    return "";
  }

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let index = cursor;

  while (index < source.length) {
    const current = source[index] ?? "";
    const previous = source[index - 1] ?? "";

    if (!inDouble && current === "'" && previous !== "\\") {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && current === '"' && previous !== "\\") {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (inSingle || inDouble) {
      index += 1;
      continue;
    }

    if (current === "{") {
      depth += 1;
    } else if (current === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(cursor + 1, index).trim();
      }
    }

    index += 1;
  }

  return "";
}

function parseStringList(source: string): string[] {
  const values: string[] = [];
  const matcher = /"([^"]+)"|'([^']+)'/g;
  let match = matcher.exec(source);
  while (match) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value) {
      values.push(value);
    }
    match = matcher.exec(source);
  }
  return values;
}

function parseLabelValues(source: string): string[] {
  const values: string[] = [];
  const matcher = /\blabel(?:Zh|En)?\s*:\s*"([^"]+)"/g;
  let match = matcher.exec(source);
  while (match) {
    const value = match[1]?.trim();
    if (value) {
      values.push(value);
    }
    match = matcher.exec(source);
  }
  return values;
}

function parseCompareCaseValues(source: string): string[] {
  const cases: string[] = [];
  const labelMatcher = /\blabel\s*:\s*"([^"]+)"/g;
  let labelMatch = labelMatcher.exec(source);
  while (labelMatch) {
    const label = labelMatch[1]?.trim();
    if (label) {
      cases.push(label);
    }
    labelMatch = labelMatcher.exec(source);
  }

  const expectedMatcher = /\bexpected\s*:\s*"([^"]+)"/g;
  let expectedMatch = expectedMatcher.exec(source);
  while (expectedMatch) {
    const expected = expectedMatch[1]?.trim();
    if (expected) {
      cases.push(expected);
    }
    expectedMatch = expectedMatcher.exec(source);
  }

  return cases;
}

function humanizeDemoComponentName(componentName: string): string {
  return componentName
    .replace(/Demo$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
}

function uniqueNonEmpty(values: Array<string | undefined>, limit = 4): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function parseDemoControlsFromInputs(source: string): InteractiveDesignControl[] {
  if (!source.trim()) {
    return [];
  }

  const controls: InteractiveDesignControl[] = [];
  const objectMatcher = /\{([\s\S]*?)\}/g;
  let objectMatch = objectMatcher.exec(source);

  while (objectMatch) {
    const entry = objectMatch[1] ?? "";
    const id = safeQuotedMatch(entry, "name") || safeQuotedMatch(entry, "id") || `control-${controls.length + 1}`;
    const label = safeQuotedMatch(entry, "labelZh") || safeQuotedMatch(entry, "label") || id;
    const type = safeQuotedMatch(entry, "type").toLowerCase();

    if (type === "select") {
      const optionsSource = entry.match(/\boptions\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
      const options = parseStringList(optionsSource);
      controls.push({
        id,
        type: "select",
        labelZh: label,
        labelEn: label,
        optionsZh: options.length ? options : [label],
        optionsEn: options.length ? options : [label],
        initialIndex: 0,
      });
    } else if (type === "slider") {
      const min = Number(entry.match(/\bmin\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? "0");
      const max = Number(entry.match(/\bmax\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? "10");
      const step = Number(entry.match(/\bstep\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? "1");
      const initialValue = Number(entry.match(/\bdefaultValue\s*:\s*(-?\d+(?:\.\d+)?)/)?.[1] ?? String(min));
      controls.push({
        id,
        type: "slider",
        labelZh: label,
        labelEn: label,
        min,
        max: max > min ? max : min + 1,
        step,
        initialValue,
      });
    } else if (type === "checkbox") {
      controls.push({
        id,
        type: "toggle",
        labelZh: label,
        labelEn: label,
        initialValue: /defaultValue\s*:\s*true/.test(entry),
      });
    }

    objectMatch = objectMatcher.exec(source);
  }

  return controls.slice(0, 3);
}

function buildSpecFromDemoComponent(componentName: string, propSource: string): InteractiveDesignSpec | null {
  const title = safeQuotedMatch(propSource, "title") || humanizeDemoComponentName(componentName);
  if (!title) {
    return null;
  }

  const description = safeQuotedMatch(propSource, "description");
  const learnerTask = safeQuotedMatch(propSource, "learnerTask");
  const inputsSource = extractBalancedProp(propSource, "inputs");
  const outputsSource = extractBalancedProp(propSource, "outputs");
  const buttonsSource = extractBalancedProp(propSource, "buttons");
  const compareCasesSource = extractBalancedProp(propSource, "compareCases");

  const inputLabels = parseLabelValues(inputsSource);
  const outputLabels = parseLabelValues(outputsSource);
  const buttonLabels = parseLabelValues(buttonsSource);
  const compareCases = parseCompareCaseValues(compareCasesSource);
  let controls = parseDemoControlsFromInputs(inputsSource);

  if (!controls.length && inputLabels.length) {
    controls = [
      {
        id: "focus",
        type: "select",
        labelZh: "观察重点",
        labelEn: "Focus",
        optionsZh: inputLabels.slice(0, 4),
        optionsEn: inputLabels.slice(0, 4),
        initialIndex: 0,
      },
      {
        id: "hints",
        type: "toggle",
        labelZh: "显示操作提示",
        labelEn: "Show Hints",
        initialValue: true,
      },
    ];
  }

  return {
    key: `generated-${toKebabCase(title) || toKebabCase(componentName) || "demo"}`,
    anchorId: `generated-interactive-demo-${toKebabCase(title) || toKebabCase(componentName) || "demo"}`,
    titleZh: title,
    titleEn: humanizeDemoComponentName(componentName),
    summaryZh: description || `围绕“${title}”直接操作输入项并观察结果变化。`,
    summaryEn: description || `Interact with ${humanizeDemoComponentName(componentName)} and observe how outputs change.`,
    observationsZh: uniqueNonEmpty(
      [
        ...outputLabels.map((label) => `重点观察：${label}`),
        ...compareCases.map((item) => `对比情形：${item}`),
      ],
      4,
    ),
    observationsEn: uniqueNonEmpty(
      [
        ...outputLabels.map((label) => `Observe: ${label}`),
        ...compareCases.map((item) => `Compare: ${item}`),
      ],
      4,
    ),
    tasksZh: uniqueNonEmpty(
      [
        learnerTask,
        ...buttonLabels.map((label) => `尝试点击“${label}”并记录结果变化。`),
        ...inputLabels.map((label) => `修改“${label}”后比较输出差异。`),
      ],
      4,
    ),
    tasksEn: uniqueNonEmpty(
      [
        learnerTask,
        ...buttonLabels.map((label) => `Try "${label}" and record how the result changes.`),
        ...inputLabels.map((label) => `Change "${label}" and compare the outputs.`),
      ],
      4,
    ),
    controls,
  };
}

function findNextDemoComponentBlock(source: string, startIndex: number): {
  start: number;
  end: number;
  componentName: string;
  propSource: string;
} | null {
  const matcher = /<([A-Z][A-Za-z0-9]*Demo)\b/g;
  matcher.lastIndex = startIndex;
  const match = matcher.exec(source);
  if (!match || match.index === undefined) {
    return null;
  }

  const componentName = match[1];
  let index = matcher.lastIndex;
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;

  while (index < source.length) {
    const current = source[index] ?? "";
    const previous = source[index - 1] ?? "";

    if (!inDouble && current === "'" && previous !== "\\") {
      inSingle = !inSingle;
      index += 1;
      continue;
    }

    if (!inSingle && current === '"' && previous !== "\\") {
      inDouble = !inDouble;
      index += 1;
      continue;
    }

    if (inSingle || inDouble) {
      index += 1;
      continue;
    }

    if (current === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }

    if (current === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      continue;
    }

    if (current === "/" && source[index + 1] === ">" && braceDepth === 0) {
      return {
        start: match.index,
        end: index + 2,
        componentName,
        propSource: source.slice(matcher.lastIndex, index).trim(),
      };
    }

    index += 1;
  }

  return null;
}

function replaceDemoComponentBlocks(source: string): string {
  let cursor = 0;
  let output = "";

  while (cursor < source.length) {
    const block = findNextDemoComponentBlock(source, cursor);
    if (!block) {
      output += source.slice(cursor);
      break;
    }

    output += source.slice(cursor, block.start);
    const spec = buildSpecFromDemoComponent(block.componentName, block.propSource);
    if (!spec) {
      output += source.slice(block.start, block.end);
      cursor = block.end;
      continue;
    }

    const previousNonEmptyLine = output
      .split("\n")
      .reverse()
      .find((line) => line.trim());
    const placeholder = `<div id="${spec.anchorId}" class="interactive-demo-design" data-demo-spec="${encodeSpec(spec)}"></div>`;
    output += previousNonEmptyLine && /^#{2,6}\s+/.test(previousNonEmptyLine.trim()) ? placeholder : `### ${spec.titleZh}\n\n${placeholder}`;
    cursor = block.end;
  }

  return output.replace(/\n{3,}/g, "\n\n").trim();
}

function demoScoreAgainstSource(demo: InteractiveDemoDescriptor, source: string): number {
  const haystack = normalizeText(source);
  const normalizedKeywords = demo.keywords.map((keyword) => normalizeText(keyword)).filter(Boolean);
  return normalizedKeywords.reduce((total, keyword) => {
    const matches = haystack.match(new RegExp(escapeRegExp(keyword), "g"));
    return total + (matches?.length ?? 0);
  }, 0);
}

function removeIrrelevantEmbeddedDemoBlocks(source: string): string {
  const contextSource = source.replace(/^##\s+交互\s+Demo[\s\S]*$/im, "").trim();
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const demoKey = line.match(/class="interactive-demo-embed"[^>]*data-demo-key="([^"]+)"/)?.[1];
    if (!demoKey) {
      output.push(line);
      continue;
    }

    const demo = INTERACTIVE_DEMO_REGISTRY.find((item) => item.key === demoKey);
    const score = demo ? demoScoreAgainstSource(demo, contextSource) : 0;
    if (score > 0) {
      output.push(line);
      continue;
    }

    while (output.length && !output[output.length - 1]?.trim()) {
      output.pop();
    }
    if (output.length && /^#{3,4}\s+/.test(output[output.length - 1]?.trim() ?? "")) {
      output.pop();
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeInteractiveDemoMarkup(source: string): string {
  const converted = replaceDemoComponentBlocks(source);
  return removeIrrelevantEmbeddedDemoBlocks(converted);
}

function buildJumpLinkLabel(anchorId: string): string {
  return `跳转到交互 Demo：${anchorId}`;
}

function findHeadingIndex(lines: string[], phrase: string): number {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) {
    return -1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!/^#{2,4}\s+/.test(trimmed)) {
      continue;
    }

    const headingText = normalizeText(trimmed.replace(/^#{2,4}\s+/, ""));
    if (headingText.includes(normalizedPhrase) || normalizedPhrase.includes(headingText)) {
      return index;
    }
  }

  return -1;
}

function insertConceptJumpLinks(body: string, demos: Array<{ anchorId: string; phrase: string }>): string {
  const lines = body.split("\n");
  let offset = 0;

  for (const demo of demos) {
    const headingIndex = findHeadingIndex(lines, demo.phrase);
    if (headingIndex < 0) {
      continue;
    }

    const insertionIndex = headingIndex + 1 + offset;
    const linkLine = `> [${buildJumpLinkLabel(demo.phrase)}](#${demo.anchorId})`;

    if ((lines[insertionIndex] ?? "").includes(`#${demo.anchorId}`)) {
      continue;
    }

    lines.splice(insertionIndex, 0, "", linkLine, "");
    offset += 3;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildEmbeddedDemoBlock(demo: InteractiveDemoDescriptor): string {
  return [
    `### ${demo.titleZh}`,
    "",
    `<div id="${demo.anchorId}" class="interactive-demo-embed" data-demo-key="${demo.key}"></div>`,
  ].join("\n");
}

function buildGeneratedDesignBlock(spec: InteractiveDesignSpec): string {
  return [
    `### ${spec.titleZh}`,
    "",
    `<div id="${spec.anchorId}" class="interactive-demo-design" data-demo-spec="${encodeSpec(spec)}"></div>`,
  ].join("\n");
}

function buildDemoSection(demos: InteractiveDemoDescriptor[], specs: InteractiveDesignSpec[]): string {
  const blocks = [
    ...demos.map((demo) => buildEmbeddedDemoBlock(demo)),
    ...specs.map((spec) => buildGeneratedDesignBlock(spec)),
  ];

  return ["## 交互 Demo", "", ...blocks].join("\n\n").trim();
}

function removeExistingInteractiveDemoSection(body: string): string {
  const lines = body.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const current = lines[index] ?? "";
    const headingMatch = current.trim().match(/^(#{2,6})\s+(.+)$/);
    if (!headingMatch) {
      output.push(current);
      index += 1;
      continue;
    }

    const level = headingMatch[1].length;
    const title = stripMarkdown(headingMatch[2]).toLowerCase();
    const isInteractiveHeading =
      title.includes("交互 demo") ||
      title.includes("互动 demo") ||
      title.includes("interactive demo") ||
      /(?:^|\s)demo(?:\s|$)/i.test(title);

    if (!isInteractiveHeading) {
      output.push(current);
      index += 1;
      continue;
    }

    let end = index + 1;
    const blockLines: string[] = [];
    while (end < lines.length) {
      const next = lines[end] ?? "";
      const nextHeadingMatch = next.trim().match(/^(#{2,6})\s+(.+)$/);
      if (nextHeadingMatch && nextHeadingMatch[1].length <= level) {
        break;
      }
      blockLines.push(next);
      end += 1;
    }

    const blockText = blockLines.join("\n");
    const looksLikeGeneratedDemoText = [
      "可调输入",
      "可观察输出",
      "关键状态变化",
      "对比情形",
      "学习者任务",
      "Adjustable inputs",
      "Observable outputs",
      "Key state changes",
      "Comparison case",
      "Learner task",
    ].filter((keyword) => blockText.includes(keyword)).length >= 2;

    if (looksLikeGeneratedDemoText || title.includes("交互 demo") || title.includes("interactive demo")) {
      index = end;
      while (index < lines.length && !lines[index]?.trim()) {
        index += 1;
      }
      continue;
    }

    output.push(current, ...blockLines);
    index = end;
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function insertSectionBeforeSummary(body: string, demos: InteractiveDemoDescriptor[], specs: InteractiveDesignSpec[]): string {
  if (!demos.length && !specs.length) {
    return body;
  }

  const sanitizedBody = removeExistingInteractiveDemoSection(body);
  const section = buildDemoSection(demos, specs);
  const match = sanitizedBody.match(/^#{2,3}\s+(?:小结(?:\s+.*)?|Summary(?:\s+.*)?)\s*$/mi);

  if (!match || match.index === undefined) {
    return `${sanitizedBody.trim()}\n\n${section}`.trim();
  }

  return `${sanitizedBody.slice(0, match.index).trimEnd()}\n\n${section}\n\n${sanitizedBody.slice(match.index).trimStart()}`.trim();
}

export function selectInteractiveDemos(input: {
  title: string;
  topic: string;
  tags: string[];
  sourceText: string;
  generatedContent: string;
  limit?: number;
}): InteractiveDemoDescriptor[] {
  const limit = Math.max(0, Math.min(input.limit ?? 3, INTERACTIVE_DEMO_REGISTRY.length));
  if (limit === 0) {
    return [];
  }

  const haystack = normalizeText(
    [input.title, input.topic, input.tags.join(" "), input.sourceText, input.generatedContent].join("\n"),
  );

  return INTERACTIVE_DEMO_REGISTRY.map((demo) => {
    const normalizedKeywords = demo.keywords.map((keyword) => normalizeText(keyword)).filter(Boolean);
    const score = normalizedKeywords.reduce((total, keyword) => {
      const matches = haystack.match(new RegExp(escapeRegExp(keyword), "g"));
      return total + (matches?.length ?? 0);
    }, 0);

    return { demo, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.demo.key.localeCompare(b.demo.key))
    .slice(0, limit)
    .map((item) => item.demo);
}

export function injectInteractiveDemosIntoNoteContent(
  source: string,
  demos: InteractiveDemoDescriptor[],
  options?: {
    title?: string;
    topic?: string;
    generatedSpecs?: InteractiveDesignSpec[];
  },
): string {
  const sections = splitBilingualNoteSections(source);
  const generatedSpecs =
    options?.generatedSpecs && options.generatedSpecs.length
      ? options.generatedSpecs
      : demos.length
        ? []
        : buildDesignSpecs(options?.title ?? "", options?.topic ?? "", sections.hasStructuredSections ? sections.zhBody : source);
  const jumpTargets = [
    ...demos.map((demo) => ({ anchorId: demo.anchorId, phrase: demo.titleZh })),
    ...generatedSpecs.map((spec) => ({ anchorId: spec.anchorId, phrase: spec.titleZh.replace(/\s*交互设计$/, "") })),
  ];

  if (!sections.hasStructuredSections) {
    const withLinks = insertConceptJumpLinks(source, jumpTargets);
    return insertSectionBeforeSummary(withLinks, demos, generatedSpecs);
  }

  const zhWithLinks = insertConceptJumpLinks(sections.zhBody, jumpTargets);
  const zhFinal = insertSectionBeforeSummary(zhWithLinks, demos, generatedSpecs);

  return [
    "## 中文版笔记",
    "",
    zhFinal.trim(),
    "",
    "---",
    "",
    "## English Version",
    "",
    sections.enBody.trim(),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildInteractiveDesignSpecsFromNote(input: {
  title: string;
  topic: string;
  source: string;
}): InteractiveDesignSpec[] {
  const sections = splitBilingualNoteSections(input.source);
  return buildDesignSpecs(input.title, input.topic, sections.hasStructuredSections ? sections.zhBody : input.source);
}
