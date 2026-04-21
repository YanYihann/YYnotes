"use client";

import { useMemo, useState } from "react";
import {
  ApproximationPlot,
  DemoControlPanel,
  DemoFormulaPanel,
  DemoResultTable,
  ErrorBadge,
  FunctionSelector,
  StepExplanationCard,
} from "@/components/demos";
import { buildFunctionModel } from "@/lib/numerical/evaluator";
import { formatNumber } from "@/lib/numerical/format";
import { computeIntegrationMethod, type IntegrationMethod } from "@/lib/numerical/integration";

const methodLabels: Record<IntegrationMethod, { zh: string; en: string }> = {
  "right-endpoint": { zh: "右端点法", en: "Right Endpoint" },
  trapezoidal: { zh: "梯形公式", en: "Trapezoidal Rule" },
  simpson: { zh: "辛普森 1/3", en: "Simpson 1/3" },
};

export function IntegrationDemo() {
  const [presetId, setPresetId] = useState("inv-one-plus-square");
  const [customExpression, setCustomExpression] = useState("");
  const [aValue, setAValue] = useState("0");
  const [bValue, setBValue] = useState("1");
  const [nValue, setNValue] = useState("4");
  const [method, setMethod] = useState<IntegrationMethod>("trapezoidal");

  const a = Number(aValue);
  const b = Number(bValue);
  const n = Number(nValue);

  const { model, computation, errorMessage } = useMemo(() => {
    try {
      const fnModel = buildFunctionModel({ presetId, customExpression });
      const result = computeIntegrationMethod(
        fnModel,
        Number.isFinite(a) ? a : 0,
        Number.isFinite(b) ? b : 1,
        Number.isFinite(n) ? n : 4,
        method,
      );
      return { model: fnModel, computation: result, errorMessage: "" };
    } catch (error) {
      return {
        model: null,
        computation: null,
        errorMessage: error instanceof Error ? error.message : "Invalid input",
      };
    }
  }, [a, b, customExpression, method, n, presetId]);

  return (
    <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
      <DemoControlPanel titleZh="积分参数" titleEn="Integration Controls">
        <FunctionSelector
          presetId={presetId}
          setPresetId={setPresetId}
          customExpression={customExpression}
          setCustomExpression={setCustomExpression}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
              区间起点 a
              <span className="ui-en ml-1 font-normal text-muted-foreground">Interval Start</span>
            </span>
            <input
              value={aValue}
              onChange={(event) => setAValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
              区间终点 b
              <span className="ui-en ml-1 font-normal text-muted-foreground">Interval End</span>
            </span>
            <input
              value={bValue}
              onChange={(event) => setBValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
              子区间数 n
              <span className="ui-en ml-1 font-normal text-muted-foreground">Subinterval Count</span>
            </span>
            <input
              value={nValue}
              onChange={(event) => setNValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>

          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
              方法
              <span className="ui-en ml-1 font-normal text-muted-foreground">Method</span>
            </span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as IntegrationMethod)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            >
              <option value="right-endpoint">Right Endpoint / 右端点</option>
              <option value="trapezoidal">Trapezoidal / 梯形</option>
              <option value="simpson">Simpson 1/3 / 辛普森 1/3</option>
            </select>
          </label>
        </div>

        {errorMessage ? (
          <p className="rounded-apple bg-[#f5d9dc] px-3 py-2 font-text text-[14px] tracking-tightCaption text-[#8c1d26] dark:bg-[#4a2126] dark:text-[#ff9aa5]">
            输入错误：{errorMessage}
            <span className="ui-en ml-1">Input error: {errorMessage}</span>
          </p>
        ) : null}

        <StepExplanationCard titleZh="学习提示" titleEn="Study Hint">
          <p>
            试着用 f(x)=1/(1+x^2) 在 [0,1] 上比较不同方法，观察是否靠近 π/4。
            <span className="ui-en ml-1">Try f(x)=1/(1+x^2) on [0,1] and compare against π/4.</span>
          </p>
        </StepExplanationCard>
      </DemoControlPanel>

      <div className="space-y-5">
        {model && computation ? (
          <>
            <ApproximationPlot fn={model.fn} a={a} b={b} n={computation.n} method={method} />

            <DemoFormulaPanel
              titleZh="积分公式"
              titleEn="Quadrature Formulas"
              items={[
                {
                  zh: "右端点法",
                  en: "Right Endpoint",
                  latex: "\\mathrm{REA}(f,[a,b],n)=h\\sum_{i=1}^{n} f(x_i)",
                },
                {
                  zh: "梯形公式",
                  en: "Trapezoidal Rule",
                  latex: "T_n=h\\left[\\dfrac{1}{2}f(x_0)+\\sum_{i=1}^{n-1}f(x_i)+\\dfrac{1}{2}f(x_n)\\right]",
                },
                {
                  zh: "辛普森 1/3",
                  en: "Simpson 1/3",
                  latex:
                    "S_n=\\dfrac{h}{3}\\left[f(x_0)+4\\sum_{\\substack{i=1 \\\\ i\\text{ odd}}}^{n-1}f(x_i)+2\\sum_{\\substack{i=2 \\\\ i\\text{ even}}}^{n-2}f(x_i)+f(x_n)\\right]",
                },
              ]}
            />

            <DemoResultTable
              captionZh={`结果 (${methodLabels[method].zh})`}
              captionEn={`Result (${methodLabels[method].en})`}
              rows={[computation]}
              columns={[
                { key: "n", title: "n", render: (row) => row.n },
                { key: "h", title: "h", render: (row) => formatNumber(row.h, 8) },
                {
                  key: "approx",
                  title: "Approximation / 近似",
                  render: (row) => formatNumber(row.approximation, 10),
                },
                {
                  key: "reference",
                  title: "Reference / 参考值",
                  render: (row) => (row.reference !== undefined ? formatNumber(row.reference, 10) : "--"),
                },
                {
                  key: "error",
                  title: "Error / 误差",
                  render: (row) => <ErrorBadge error={row.error} />,
                },
              ]}
            />

            <DemoResultTable
              captionZh="分项贡献表"
              captionEn="Step Contribution Table"
              rows={computation.steps}
              columns={[
                { key: "i", title: "i", render: (row) => row.index },
                { key: "xSample", title: "x sample", render: (row) => formatNumber(row.xSample, 8) },
                { key: "weight", title: "weight", render: (row) => formatNumber(row.weight, 5) },
                { key: "fx", title: "f(x)", render: (row) => formatNumber(row.fxSample, 10) },
                {
                  key: "contribution",
                  title: "contribution",
                  render: (row) => formatNumber(row.contribution, 10),
                },
              ]}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
