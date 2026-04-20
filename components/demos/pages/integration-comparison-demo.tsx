"use client";

import { useMemo, useState } from "react";
import {
  DemoControlPanel,
  DemoResultTable,
  FunctionSelector,
  MethodComparisonTable,
  StepExplanationCard,
} from "@/components/demos";
import { buildFunctionModel } from "@/lib/numerical/evaluator";
import { formatNumber } from "@/lib/numerical/format";
import { buildComparisonSeries, compareIntegrationMethods } from "@/lib/numerical/integration";

type TrendPoint = {
  n: number;
  right?: number;
  trap?: number;
  simpson?: number;
};

function ErrorTrendChart({ rows }: { rows: TrendPoint[] }) {
  const width = 920;
  const height = 260;
  const margin = { top: 18, right: 24, bottom: 30, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xValues = rows.map((row) => row.n);
  const yValues = rows.flatMap((row) => [row.right, row.trap, row.simpson]).filter((value): value is number => value !== undefined);

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const safeMinY = Math.max(1e-12, minY * 0.8);
  const safeMaxY = Math.max(safeMinY * 1.2, maxY * 1.2);

  const mapX = (x: number) => margin.left + ((x - minX) / Math.max(1e-9, maxX - minX)) * innerWidth;
  const mapY = (y: number) => {
    const logMin = Math.log10(safeMinY);
    const logMax = Math.log10(safeMaxY);
    const logValue = Math.log10(Math.max(1e-12, y));
    const ratio = (logValue - logMin) / Math.max(1e-9, logMax - logMin);
    return margin.top + (1 - ratio) * innerHeight;
  };

  const pathFor = (key: "right" | "trap" | "simpson") => {
    const points = rows.filter((row) => row[key] !== undefined).map((row) => ({ x: row.n, y: row[key] as number }));
    if (!points.length) {
      return "";
    }

    const [first, ...rest] = points;
    return rest.reduce((acc, point) => `${acc} L ${mapX(point.x)} ${mapY(point.y)}`, `M ${mapX(first.x)} ${mapY(first.y)}`);
  };

  return (
    <section className="rounded-apple bg-card px-4 py-4 text-card-foreground shadow-card sm:px-5">
      <h3 className="mb-3 font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
        ����� n �ı仯����
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-muted-foreground">Error Trend vs n (log scale)</span>
      </h3>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <rect x={margin.left} y={margin.top} width={innerWidth} height={innerHeight} rx={6} fill="rgba(0,0,0,0.03)" className="dark:fill-white/[0.05]" />

        <path d={pathFor("right")} stroke="#b4232f" fill="none" strokeWidth={2.2} />
        <path d={pathFor("trap")} stroke="#0066cc" fill="none" strokeWidth={2.2} />
        <path d={pathFor("simpson")} stroke="#0071e3" fill="none" strokeWidth={2.2} strokeDasharray="6 4" />

        {rows.map((row) => (
          <text key={row.n} x={mapX(row.n)} y={height - 8} textAnchor="middle" fontSize="11" fill="currentColor">
            {row.n}
          </text>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-muted-foreground">
        <span>�� Right Endpoint</span>
        <span>�� Trapezoidal</span>
        <span>�� Simpson (dashed)</span>
      </div>
    </section>
  );
}

export function IntegrationComparisonDemo() {
  const [presetId, setPresetId] = useState("inv-one-plus-square");
  const [customExpression, setCustomExpression] = useState("");
  const [aValue, setAValue] = useState("0");
  const [bValue, setBValue] = useState("1");
  const [nValue, setNValue] = useState("8");
  const [maxPower, setMaxPower] = useState("6");

  const a = Number(aValue);
  const b = Number(bValue);
  const n = Number(nValue);
  const power = Number(maxPower);

  const { rows, trendRows, reference, errorMessage } = useMemo(() => {
    try {
      const model = buildFunctionModel({ presetId, customExpression });
      const compared = compareIntegrationMethods(
        model,
        Number.isFinite(a) ? a : 0,
        Number.isFinite(b) ? b : 1,
        Number.isFinite(n) ? n : 8,
      );
      const trend = buildComparisonSeries(model, Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 1, Number.isFinite(power) ? power : 6);
      return {
        rows: compared,
        trendRows: trend,
        reference: model.integral?.(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 1),
        errorMessage: "",
      };
    } catch (error) {
      return {
        rows: [],
        trendRows: [],
        reference: undefined,
        errorMessage: error instanceof Error ? error.message : "Invalid input",
      };
    }
  }, [a, b, customExpression, n, power, presetId]);

  return (
    <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
      <DemoControlPanel titleZh="�ԱȲ���" titleEn="Comparison Controls">
        <FunctionSelector
          presetId={presetId}
          setPresetId={setPresetId}
          customExpression={customExpression}
          setCustomExpression={setCustomExpression}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">���� [a,b]</span>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={aValue}
                onChange={(event) => setAValue(event.target.value)}
                className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
              <input
                value={bValue}
                onChange={(event) => setBValue(event.target.value)}
                className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">��ǰ n</span>
            <input
              value={nValue}
              onChange={(event) => setNValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
        </div>

        <label className="space-y-1.5">
          <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
            ������ȣ�2^k��
            <span className="ui-en ml-1 font-normal text-muted-foreground">Trend Depth</span>
          </span>
          <input
            value={maxPower}
            onChange={(event) => setMaxPower(event.target.value)}
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
          />
        </label>

        {errorMessage ? (
          <p className="rounded-apple bg-[#f5d9dc] px-3 py-2 font-text text-[14px] tracking-tightCaption text-[#8c1d26] dark:bg-[#4a2126] dark:text-[#ff9aa5]">
            �������{errorMessage}
            <span className="ui-en ml-1">Input error: {errorMessage}</span>
          </p>
        ) : null}

        <StepExplanationCard titleZh="ѧϰ��ʾ" titleEn="Study Hint">
          <p>
            ����ο�ֵ���ڣ����ȹ۲�����к�����ͼ��ͨ�� Simpson �������졣
            <span className="ui-en ml-1">When a reference value exists, inspect the error columns and trend plot; Simpson usually converges faster.</span>
          </p>
        </StepExplanationCard>
      </DemoControlPanel>

      <div className="space-y-5">
        {rows.length ? <MethodComparisonTable rows={rows} /> : null}

        {reference !== undefined ? (
          <DemoResultTable
            captionZh="�ο�����ֵ"
            captionEn="Reference Integral"
            rows={[{ reference }]}
            columns={[
              {
                key: "reference",
                title: "I = ��f(x)dx",
                render: (row) => formatNumber(row.reference, 12),
              },
            ]}
          />
        ) : null}

        {trendRows.length ? <ErrorTrendChart rows={trendRows} /> : null}

        {trendRows.length ? (
          <DemoResultTable
            captionZh="�������ݱ�"
            captionEn="Convergence Data"
            rows={trendRows}
            columns={[
              { key: "n", title: "n", render: (row) => row.n },
              {
                key: "right",
                title: "|e| Right",
                render: (row) => (row.right !== undefined ? formatNumber(row.right, 8) : "--"),
              },
              {
                key: "trap",
                title: "|e| Trapezoid",
                render: (row) => (row.trap !== undefined ? formatNumber(row.trap, 8) : "--"),
              },
              {
                key: "simpson",
                title: "|e| Simpson",
                render: (row) => (row.simpson !== undefined ? formatNumber(row.simpson, 8) : "--"),
              },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}
