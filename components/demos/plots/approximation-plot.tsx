import type { IntegrationMethod } from "@/lib/numerical/integration";
import { FunctionPlot } from "@/components/demos/plots/function-plot";

type ApproximationPlotProps = {
  fn: (x: number) => number;
  a: number;
  b: number;
  n: number;
  method: IntegrationMethod;
};

type Point = { x: number; y: number };

function toQuadraticPoints(x0: number, x1: number, x2: number, y0: number, y1: number, y2: number, count = 26): Point[] {
  const points: Point[] = [];

  for (let i = 0; i <= count; i += 1) {
    const x = x0 + ((x2 - x0) * i) / count;
    const l0 = ((x - x1) * (x - x2)) / ((x0 - x1) * (x0 - x2));
    const l1 = ((x - x0) * (x - x2)) / ((x1 - x0) * (x1 - x2));
    const l2 = ((x - x0) * (x - x1)) / ((x2 - x0) * (x2 - x1));
    const y = y0 * l0 + y1 * l1 + y2 * l2;
    points.push({ x, y });
  }

  return points;
}

function normalize(a: number, b: number): { left: number; right: number; sign: 1 | -1 } {
  if (a <= b) {
    return { left: a, right: b, sign: 1 };
  }

  return { left: b, right: a, sign: -1 };
}

function ensureN(method: IntegrationMethod, nInput: number): number {
  let n = Math.max(1, Math.floor(Math.abs(nInput)));

  if (method === "simpson") {
    if (n < 2) {
      n = 2;
    }
    if (n % 2 !== 0) {
      n += 1;
    }
  }

  return n;
}

export function ApproximationPlot({ fn, a, b, n: nInput, method }: ApproximationPlotProps) {
  const bounds = normalize(a, b);
  const n = ensureN(method, nInput);
  const h = (bounds.right - bounds.left) / n;

  const polygons: Array<{ points: Point[]; fill: string; stroke: string }> = [];
  const overlayPaths: Array<{ points: Point[]; color: string; dashed?: boolean; width?: number }> = [];

  if (method === "right-endpoint") {
    for (let i = 1; i <= n; i += 1) {
      const xLeft = bounds.left + (i - 1) * h;
      const xRight = bounds.left + i * h;
      const y = fn(xRight);

      polygons.push({
        points: [
          { x: xLeft, y: 0 },
          { x: xLeft, y },
          { x: xRight, y },
          { x: xRight, y: 0 },
        ],
        fill: "rgba(0, 113, 227, 0.15)",
        stroke: "rgba(0, 102, 204, 0.65)",
      });
    }
  }

  if (method === "trapezoidal") {
    for (let i = 1; i <= n; i += 1) {
      const xLeft = bounds.left + (i - 1) * h;
      const xRight = bounds.left + i * h;
      const yLeft = fn(xLeft);
      const yRight = fn(xRight);

      polygons.push({
        points: [
          { x: xLeft, y: 0 },
          { x: xLeft, y: yLeft },
          { x: xRight, y: yRight },
          { x: xRight, y: 0 },
        ],
        fill: "rgba(0, 113, 227, 0.12)",
        stroke: "rgba(0, 102, 204, 0.7)",
      });

      overlayPaths.push({
        points: [
          { x: xLeft, y: yLeft },
          { x: xRight, y: yRight },
        ],
        color: "#0066cc",
        width: 1.8,
      });
    }
  }

  if (method === "simpson") {
    for (let i = 0; i < n; i += 2) {
      const x0 = bounds.left + i * h;
      const x1 = x0 + h;
      const x2 = x0 + 2 * h;
      const y0 = fn(x0);
      const y1 = fn(x1);
      const y2 = fn(x2);

      const panelCurve = toQuadraticPoints(x0, x1, x2, y0, y1, y2);
      polygons.push({
        points: [{ x: x0, y: 0 }, ...panelCurve, { x: x2, y: 0 }],
        fill: "rgba(0, 113, 227, 0.13)",
        stroke: "rgba(0, 102, 204, 0.5)",
      });

      overlayPaths.push({
        points: panelCurve,
        color: "#0066cc",
        width: 2,
        dashed: true,
      });
    }
  }

  const titleZh =
    method === "right-endpoint"
      ? "右端点矩形可视化"
      : method === "trapezoidal"
        ? "梯形近似可视化"
        : "辛普森抛物线近似可视化";
  const titleEn =
    method === "right-endpoint"
      ? "Right-Endpoint Rectangles"
      : method === "trapezoidal"
        ? "Trapezoidal Approximation"
        : "Simpson Parabolic Approximation";

  return (
    <FunctionPlot
      titleZh={titleZh}
      titleEn={titleEn}
      fn={(x) => bounds.sign * fn(x)}
      domain={[bounds.left, bounds.right]}
      polygons={polygons}
      overlayPaths={overlayPaths}
    />
  );
}
