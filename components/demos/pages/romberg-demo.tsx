"use client";

import { useMemo, useState } from "react";
import {
  DemoControlPanel,
  DemoFormulaPanel,
  DemoResultTable,
  ErrorBadge,
  FunctionSelector,
  RombergTable,
  StepExplanationCard,
} from "@/components/demos";
import { buildFunctionModel } from "@/lib/numerical/evaluator";
import { formatNumber } from "@/lib/numerical/format";
import { computeRomberg } from "@/lib/numerical/integration";

function GridRefinementStrip({ a, b, levels }: { a: number; b: number; levels: number }) {
  const width = 900;
  const height = 140;
  const margin = { left: 36, right: 24, top: 22, bottom: 24 };
  const innerWidth = width - margin.left - margin.right;

  const left = Math.min(a, b);
  const right = Math.max(a, b);

  const mapX = (x: number) => margin.left + ((x - left) / Math.max(1e-9, right - left)) * innerWidth;

  const coarseNodes = Array.from({ length: 2 + 1 }, (_, i) => left + ((right - left) * i) / 2);
  const fineN = 2 ** Math.max(1, levels - 1);
  const fineNodes = Array.from({ length: fineN + 1 }, (_, i) => left + ((right - left) * i) / fineN);

  return (
    <section className="rounded-apple bg-card px-4 py-4 text-card-foreground shadow-card sm:px-5">
      <h3 className="mb-2 font-display text-[21px] font-semibold leading-[1.19] tracking-[0.231px] text-foreground">
        粗网格 vs 细网格
        <span className="ui-en ml-1 font-text text-[15px] font-normal tracking-tightCaption text-muted-foreground">Coarse vs Fine Grid</span>
      </h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line x1={margin.left} y1={48} x2={width - margin.right} y2={48} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
        <line x1={margin.left} y1={98} x2={width - margin.right} y2={98} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />

        {coarseNodes.map((x, index) => (
          <g key={`coarse-${index}`}>
            <circle cx={mapX(x)} cy={48} r={4.5} fill="#b4232f" />
            <text x={mapX(x)} y={40} textAnchor="middle" fontSize="10" fill="currentColor">
              {index}
            </text>
          </g>
        ))}

        {fineNodes.map((x, index) => (
          <circle key={`fine-${index}`} cx={mapX(x)} cy={98} r={3.2} fill="#0071e3" />
        ))}

        <text x={margin.left} y={20} fontSize="11" fill="currentColor">
          Coarse (n=2)
        </text>
        <text x={margin.left} y={124} fontSize="11" fill="currentColor">
          Fine (n={fineN})
        </text>
      </svg>
    </section>
  );
}

export function RombergDemo() {
  const [presetId, setPresetId] = useState("inv-one-plus-square");
  const [customExpression, setCustomExpression] = useState("");
  const [aValue, setAValue] = useState("0");
  const [bValue, setBValue] = useState("1");
  const [levelsValue, setLevelsValue] = useState("5");

  const a = Number(aValue);
  const b = Number(bValue);
  const levels = Number(levelsValue);

  const { computation, errorMessage } = useMemo(() => {
    try {
      const model = buildFunctionModel({ presetId, customExpression });
      const result = computeRomberg(
        model,
        Number.isFinite(a) ? a : 0,
        Number.isFinite(b) ? b : 1,
        Number.isFinite(levels) ? levels : 5,
      );
      return { computation: result, errorMessage: "" };
    } catch (error) {
      return {
        computation: null,
        errorMessage: error instanceof Error ? error.message : "Invalid input",
      };
    }
  }, [a, b, customExpression, levels, presetId]);

  return (
    <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
      <DemoControlPanel titleZh="Romberg 参数" titleEn="Romberg Controls">
        <FunctionSelector
          presetId={presetId}
          setPresetId={setPresetId}
          customExpression={customExpression}
          setCustomExpression={setCustomExpression}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-black/75 dark:text-white/78">区间起点 a</span>
            <input
              value={aValue}
              onChange={(event) => setAValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-black/75 dark:text-white/78">区间终点 b</span>
            <input
              value={bValue}
              onChange={(event) => setBValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
        </div>

        <label className="space-y-1.5">
          <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
            Romberg 层数
            <span className="ui-en ml-1 font-normal text-muted-foreground">Refinement Levels</span>
          </span>
          <input
            value={levelsValue}
            onChange={(event) => setLevelsValue(event.target.value)}
            className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
          />
        </label>

        {errorMessage ? (
          <p className="rounded-apple bg-[#f5d9dc] px-3 py-2 font-text text-[14px] tracking-tightCaption text-[#8c1d26] dark:bg-[#4a2126] dark:text-[#ff9aa5]">
            输入错误：{errorMessage}
            <span className="ui-en ml-1">Input error: {errorMessage}</span>
          </p>
        ) : null}

        <StepExplanationCard titleZh="学习提示" titleEn="Study Hint">
          <p>
            先看第一列梯形估计，再看右上角外推值，体会“误差主项被抵消”的过程。
            <span className="ui-en ml-1">Observe base trapezoid estimates first, then follow the extrapolated upper-right values.</span>
          </p>
        </StepExplanationCard>
      </DemoControlPanel>

      <div className="space-y-5">
        {computation ? (
          <>
            <GridRefinementStrip a={a} b={b} levels={computation.levels} />

            <DemoFormulaPanel
              titleZh="Romberg 外推核心"
              titleEn="Romberg Extrapolation Core"
              items={[
                {
                  zh: "梯形基线",
                  en: "Trapezoid Base",
                  latex: "R_{k,0}=T_{2^k}",
                },
                {
                  zh: "外推更新",
                  en: "Extrapolation Update",
                  latex: "R_{k,j}=R_{k,j-1}+\\dfrac{R_{k,j-1}-R_{k-1,j-1}}{4^j-1}",
                },
              ]}
            />

            <DemoResultTable
              captionZh="梯形基线估计"
              captionEn="Base Trapezoid Estimates"
              rows={computation.baseRows}
              columns={[
                { key: "level", title: "level", render: (row) => row.level },
                { key: "n", title: "n", render: (row) => row.n },
                { key: "value", title: "T_n", render: (row) => formatNumber(row.trapezoid, 10) },
                { key: "error", title: "Error", render: (row) => <ErrorBadge error={row.error} /> },
              ]}
            />

            <RombergTable table={computation.table} />

            <DemoResultTable
              captionZh="最终外推结果"
              captionEn="Final Extrapolated Estimate"
              rows={[computation]}
              columns={[
                { key: "final", title: "R(final)", render: (row) => formatNumber(row.finalEstimate, 12) },
                {
                  key: "reference",
                  title: "Reference",
                  render: (row) => (row.reference !== undefined ? formatNumber(row.reference, 12) : "--"),
                },
                { key: "error", title: "Error", render: (row) => <ErrorBadge error={row.finalError} /> },
              ]}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
