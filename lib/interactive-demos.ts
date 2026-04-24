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
    keywords: ["方法比较", "误差比较", "收敛趋势", "compare integration", "error trend", "comparison"],
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

function buildJumpLinkLabel(demo: InteractiveDemoDescriptor): string {
  return `跳转到交互 Demo：${demo.titleZh}`;
}

function findHeadingIndex(lines: string[], demo: InteractiveDemoDescriptor): number {
  const keywords = demo.keywords.map((item) => normalizeText(item)).filter(Boolean);
  if (!keywords.length) {
    return -1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!/^#{2,4}\s+/.test(trimmed)) {
      continue;
    }

    const headingText = normalizeText(trimmed.replace(/^#{2,4}\s+/, ""));
    if (keywords.some((keyword) => headingText.includes(keyword))) {
      return index;
    }
  }

  return -1;
}

function insertConceptJumpLinks(body: string, demos: InteractiveDemoDescriptor[]): string {
  const lines = body.split("\n");
  let offset = 0;

  for (const demo of demos) {
    const headingIndex = findHeadingIndex(lines, demo);
    if (headingIndex < 0) {
      continue;
    }

    const insertionIndex = headingIndex + 1 + offset;
    const linkLine = `> [${buildJumpLinkLabel(demo)}](#${demo.anchorId})`;

    if ((lines[insertionIndex] ?? "").includes(`#${demo.anchorId}`)) {
      continue;
    }

    lines.splice(insertionIndex, 0, "", linkLine, "");
    offset += 3;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildDemoEmbedBlock(demo: InteractiveDemoDescriptor): string {
  return [
    `### ${demo.titleZh}`,
    "",
    `<div id="${demo.anchorId}" class="interactive-demo-embed" data-demo-key="${demo.key}"></div>`,
  ].join("\n");
}

function buildDemoSection(demos: InteractiveDemoDescriptor[]): string {
  return [
    "## 交互 Demo",
    "",
    ...demos.map((demo) => buildDemoEmbedBlock(demo)),
  ]
    .join("\n\n")
    .trim();
}

function insertSectionBeforeSummary(body: string, demos: InteractiveDemoDescriptor[]): string {
  if (!demos.length) {
    return body;
  }

  const section = buildDemoSection(demos);
  const match = body.match(/^#{2,3}\s+小结\s*$/m);

  if (!match || match.index === undefined) {
    return `${body.trim()}\n\n${section}`.trim();
  }

  return `${body.slice(0, match.index).trimEnd()}\n\n${section}\n\n${body.slice(match.index).trimStart()}`.trim();
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
): string {
  if (!demos.length) {
    return source;
  }

  const sections = splitBilingualNoteSections(source);
  if (!sections.hasStructuredSections) {
    return source;
  }

  const zhWithLinks = insertConceptJumpLinks(sections.zhBody, demos);
  const zhFinal = insertSectionBeforeSummary(zhWithLinks, demos);

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
