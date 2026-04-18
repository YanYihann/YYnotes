export type DemoEntry = {
  id: string;
  href: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  topics: string[];
  linkedWeeks: string[];
};

export const DEMO_CATALOG: DemoEntry[] = [
  {
    id: "numerical-differentiation",
    href: "/demos/numerical-differentiation",
    titleZh: "数值微分交互演示",
    titleEn: "Numerical Differentiation Demo",
    descriptionZh: "覆盖前向、后向、中心差分与三点二阶导，展示采样点、公式和误差。",
    descriptionEn: "Explore forward/backward/central differences and 3-point second derivative with tables and errors.",
    topics: ["Forward Difference", "Backward Difference", "Central Difference", "3-point Formula", "Second Derivative"],
    linkedWeeks: ["week-5", "week-7"],
  },
  {
    id: "numerical-integration",
    href: "/demos/numerical-integration",
    titleZh: "数值积分交互演示",
    titleEn: "Numerical Integration Demo",
    descriptionZh: "右端点、梯形、辛普森 1/3 规则可视化，支持面积近似与误差分析。",
    descriptionEn: "Interactive area approximations for right-endpoint, trapezoid, and Simpson 1/3 rules.",
    topics: ["Right Endpoint", "Trapezoidal Rule", "Simpson's 1/3 Rule"],
    linkedWeeks: ["week-6", "week-7"],
  },
  {
    id: "integration-comparison",
    href: "/demos/integration-comparison",
    titleZh: "积分方法对比实验",
    titleEn: "Integration Method Comparison",
    descriptionZh: "并排比较三种积分方法的近似值与误差，并观察 n 增加时的收敛趋势。",
    descriptionEn: "Compare approximation and error side-by-side and inspect convergence as n grows.",
    topics: ["Error Comparison", "Refinement Trend"],
    linkedWeeks: ["week-6", "week-7"],
  },
  {
    id: "romberg",
    href: "/demos/romberg",
    titleZh: "Romberg 外推演示",
    titleEn: "Romberg Extrapolation Demo",
    descriptionZh: "从梯形粗细网格估计出发，逐级构建 Romberg 表并展示误差消去过程。",
    descriptionEn: "Build Romberg table from refined trapezoid estimates and inspect extrapolation gains.",
    topics: ["Romberg", "Coarse vs Fine Grid", "Extrapolation"],
    linkedWeeks: ["week-7"],
  },
];

export function getRelatedDemosForWeek(slug: string): DemoEntry[] {
  return DEMO_CATALOG.filter((demo) => demo.linkedWeeks.includes(slug));
}
