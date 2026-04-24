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

const DEMO_REGISTRY: InteractiveDemoDescriptor[] = [
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

function buildJumpLinkLabel(demo: InteractiveDemoDescriptor, language: "zh" | "en"): string {
  return language === "zh"
    ? `查看交互 Demo：${demo.titleZh}`
    : `Jump to interactive demo: ${demo.titleEn}`;
}

function buildOpenDemoLabel(language: "zh" | "en"): string {
  return language === "zh" ? "打开演示页面" : "Open the demo page";
}

function findHeadingIndex(lines: string[], demo: InteractiveDemoDescriptor): number {
  const keywords = demo.keywords.map((item) => normalizeText(item));
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!/^#{3,4}\s+/.test(trimmed)) {
      continue;
    }

    const headingText = normalizeText(trimmed.replace(/^#{3,4}\s+/, ""));
    if (keywords.some((keyword) => headingText.includes(keyword))) {
      return index;
    }
  }

  return -1;
}

function insertConceptJumpLinks(body: string, demos: InteractiveDemoDescriptor[], language: "zh" | "en"): string {
  const lines = body.split("\n");
  let offset = 0;

  for (const demo of demos) {
    const headingIndex = findHeadingIndex(lines, demo);
    if (headingIndex < 0) {
      continue;
    }

    const insertionIndex = headingIndex + 1 + offset;
    const linkLine = `> [${buildJumpLinkLabel(demo, language)}](#${demo.anchorId})`;

    if ((lines[insertionIndex] ?? "").includes(`#${demo.anchorId}`)) {
      continue;
    }

    lines.splice(insertionIndex, 0, "", linkLine, "");
    offset += 3;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildDemoSection(demos: InteractiveDemoDescriptor[], language: "zh" | "en"): string {
  const heading = language === "zh" ? "### 交互 Demo" : "### Interactive Demos";
  const blocks = demos.map((demo) => {
    const title = language === "zh" ? demo.titleZh : demo.titleEn;
    const description = language === "zh" ? demo.descriptionZh : demo.descriptionEn;
    return [
      `<div id="${demo.anchorId}"></div>`,
      `#### ${title}`,
      "",
      `- [${buildOpenDemoLabel(language)}](${demo.href})`,
      `- ${description}`,
    ].join("\n");
  });

  return [heading, "---", ...blocks].join("\n\n").trim();
}

function insertSectionBeforeSummary(body: string, demos: InteractiveDemoDescriptor[], language: "zh" | "en"): string {
  if (!demos.length) {
    return body;
  }

  const summaryHeading = language === "zh" ? /^###\s+小结\s*$/m : /^###\s+Summary\s*$/m;
  const section = buildDemoSection(demos, language);
  const match = body.match(summaryHeading);

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
  const limit = Math.max(0, Math.min(input.limit ?? 3, DEMO_REGISTRY.length));
  if (limit === 0) {
    return [];
  }

  const haystack = normalizeText(
    [input.title, input.topic, input.tags.join(" "), input.sourceText, input.generatedContent].join("\n"),
  );

  return DEMO_REGISTRY.map((demo) => {
    const score = demo.keywords.reduce((total, keyword) => {
      const matches = haystack.match(new RegExp(escapeRegExp(normalizeText(keyword)), "g"));
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

  const zhWithLinks = insertConceptJumpLinks(sections.zhBody, demos, "zh");
  const enWithLinks = insertConceptJumpLinks(sections.enBody, demos, "en");
  const zhFinal = insertSectionBeforeSummary(zhWithLinks, demos, "zh");
  const enFinal = insertSectionBeforeSummary(enWithLinks, demos, "en");

  return [
    "## 中文版笔记",
    "",
    zhFinal.trim(),
    "",
    "---",
    "",
    "## English Version",
    "",
    enFinal.trim(),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
