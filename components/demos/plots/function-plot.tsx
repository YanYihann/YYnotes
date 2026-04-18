"use client";

import { useMemo } from "react";
import { clamp } from "@/lib/numerical/format";

type Point = { x: number; y: number };

type HighlightPoint = {
  x: number;
  y?: number;
  labelZh: string;
  labelEn: string;
  color?: string;
};

type PlotPath = {
  points: Point[];
  color: string;
  width?: number;
  dashed?: boolean;
  fill?: string;
};

type PlotPolygon = {
  points: Point[];
  fill: string;
  stroke: string;
};

type FunctionPlotProps = {
  titleZh: string;
  titleEn: string;
  fn: (x: number) => number;
  domain: [number, number];
  height?: number;
  sampleCount?: number;
  points?: HighlightPoint[];
  overlayPaths?: PlotPath[];
  polygons?: PlotPolygon[];
};

function toPath(points: Point[], mapX: (x: number) => number, mapY: (y: number) => number): string {
  if (!points.length) {
    return "";
  }

  const [first, ...rest] = points;
  const start = `M ${mapX(first.x)} ${mapY(first.y)}`;
  return rest.reduce((acc, point) => `${acc} L ${mapX(point.x)} ${mapY(point.y)}`, start);
}

export function FunctionPlot({
  titleZh,
  titleEn,
  fn,
  domain,
  height = 280,
  sampleCount = 220,
  points = [],
  overlayPaths = [],
  polygons = [],
}: FunctionPlotProps) {
  const width = 920;
  const margin = { top: 20, right: 20, bottom: 28, left: 44 };

  const { basePoints, minY, maxY } = useMemo(() => {
    const [rawMinX, rawMaxX] = domain;
    const minX = Math.min(rawMinX, rawMaxX);
    const maxX = Math.max(rawMinX, rawMaxX);
    const step = (maxX - minX) / Math.max(2, sampleCount - 1);

    const sampled: Point[] = [];
    for (let i = 0; i < sampleCount; i += 1) {
      const x = minX + i * step;
      const y = fn(x);
      if (Number.isFinite(y)) {
        sampled.push({ x, y });
      }
    }

    const pool: number[] = sampled.map((point) => point.y);
    points.forEach((point) => {
      const y = point.y ?? fn(point.x);
      if (Number.isFinite(y)) {
        pool.push(y);
      }
    });
    polygons.forEach((poly) => poly.points.forEach((point) => pool.push(point.y)));
    overlayPaths.forEach((path) => path.points.forEach((point) => pool.push(point.y)));

    const minimum = pool.length ? Math.min(...pool) : -1;
    const maximum = pool.length ? Math.max(...pool) : 1;
    const span = Math.max(1e-6, maximum - minimum);

    return {
      basePoints: sampled,
      minY: minimum - 0.1 * span,
      maxY: maximum + 0.1 * span,
    };
  }, [domain, fn, overlayPaths, points, polygons, sampleCount]);

  const [rawMinX, rawMaxX] = domain;
  const minX = Math.min(rawMinX, rawMaxX);
  const maxX = Math.max(rawMinX, rawMaxX);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const mapX = (x: number) => margin.left + ((x - minX) / Math.max(1e-9, maxX - minX)) * innerWidth;
  const mapY = (y: number) => margin.top + (1 - (y - minY) / Math.max(1e-9, maxY - minY)) * innerHeight;

  const axisY = mapY(clamp(0, minY, maxY));
  const axisX = mapX(clamp(0, minX, maxX));

  const basePath = toPath(basePoints, mapX, mapY);

  return (
    <section className="rounded-apple bg-white px-4 py-4 shadow-card dark:bg-[#272729] sm:px-5">
      <h3 className="mb-3 font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-[#1d1d1f] dark:text-white">
        {titleZh}
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-black/58 dark:text-white/66">{titleEn}</span>
      </h3>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <rect x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} rx={6} fill="rgba(0,0,0,0.03)" className="dark:fill-white/[0.05]" />

        <line x1={margin.left} y1={axisY} x2={width - margin.right} y2={axisY} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
        <line x1={axisX} y1={margin.top} x2={axisX} y2={height - margin.bottom} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />

        {polygons.map((poly, index) => (
          <path
            key={index}
            d={`${toPath(poly.points, mapX, mapY)} Z`}
            fill={poly.fill}
            stroke={poly.stroke}
            strokeWidth={1}
          />
        ))}

        {overlayPaths.map((path, index) => (
          <path
            key={index}
            d={toPath(path.points, mapX, mapY)}
            fill={path.fill ?? "none"}
            stroke={path.color}
            strokeWidth={path.width ?? 2}
            strokeDasharray={path.dashed ? "6 4" : undefined}
          />
        ))}

        <path d={basePath} fill="none" stroke="#0071e3" strokeWidth={2.5} />

        {points.map((point, index) => {
          const y = point.y ?? fn(point.x);
          return (
            <g key={`${point.labelZh}-${index}`}>
              <circle cx={mapX(point.x)} cy={mapY(y)} r={4.2} fill={point.color ?? "#b4232f"} />
              <text x={mapX(point.x) + 6} y={mapY(y) - 8} fontSize="11" fill="currentColor">
                {point.labelZh}
              </text>
            </g>
          );
        })}

        <text x={margin.left} y={height - 6} fontSize="11" fill="currentColor">
          x in [{minX.toFixed(2)}, {maxX.toFixed(2)}]
        </text>
      </svg>
    </section>
  );
}
