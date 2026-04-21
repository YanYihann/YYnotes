"use client";

import { useMemo, useState } from "react";
import {
  DemoControlPanel,
  DemoFormulaPanel,
  MathFormula,
  DemoResultTable,
  ErrorBadge,
  FunctionPlot,
  FunctionSelector,
  StepExplanationCard,
} from "@/components/demos";
import { computeDifferentiation } from "@/lib/numerical/differentiation";
import { buildFunctionModel } from "@/lib/numerical/evaluator";
import { formatNumber } from "@/lib/numerical/format";

export function DifferentiationDemo() {
  const [presetId, setPresetId] = useState("square");
  const [customExpression, setCustomExpression] = useState("");
  const [xValue, setXValue] = useState("1");
  const [hValue, setHValue] = useState("0.1");

  const parsedX = Number(xValue);
  const parsedH = Number(hValue);

  const { model, computation, errorMessage } = useMemo(() => {
    try {
      const fnModel = buildFunctionModel({ presetId, customExpression });
      const result = computeDifferentiation(fnModel, Number.isFinite(parsedX) ? parsedX : 0, Number.isFinite(parsedH) ? parsedH : 0.1);
      return { model: fnModel, computation: result, errorMessage: "" };
    } catch (error) {
      return {
        model: null,
        computation: null,
        errorMessage: error instanceof Error ? error.message : "Invalid input",
      };
    }
  }, [customExpression, parsedH, parsedX, presetId]);

  const points =
    computation?.samples.map((item, index) => ({
      x: item.x,
      y: item.fx,
      labelZh: index === 0 ? "x-h" : index === 1 ? "x" : "x+h",
      labelEn: index === 0 ? "x-h" : index === 1 ? "x" : "x+h",
      color: index === 1 ? "#0071e3" : "#b4232f",
    })) ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
      <DemoControlPanel titleZh="参数输入" titleEn="Input Parameters">
        <FunctionSelector
          presetId={presetId}
          setPresetId={setPresetId}
          customExpression={customExpression}
          setCustomExpression={setCustomExpression}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
              评估点 x
              <span className="ui-en ml-1 font-normal text-muted-foreground">Evaluation Point</span>
            </span>
            <input
              value={xValue}
              onChange={(event) => setXValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>

          <label className="space-y-1.5">
            <span className="font-text text-[14px] font-semibold tracking-tightCaption text-muted-foreground">
              步长 h
              <span className="ui-en ml-1 font-normal text-muted-foreground">Step Size</span>
            </span>
            <input
              value={hValue}
              onChange={(event) => setHValue(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[15px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
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
            先固定同一个 x，再逐步减小 h，观察 Forward/Backward/Central 的误差如何变化。
            <span className="ui-en ml-1">Keep x fixed and decrease h to inspect each method error behavior.</span>
          </p>
        </StepExplanationCard>
      </DemoControlPanel>

      <div className="space-y-5">
        {model && computation ? (
          <>
            <FunctionPlot
              titleZh="采样点与函数曲线"
              titleEn="Sampled Points on the Curve"
              fn={model.fn}
              domain={[computation.x - 4 * computation.h, computation.x + 4 * computation.h]}
              points={points}
            />

            <DemoFormulaPanel
              titleZh="本页使用公式"
              titleEn="Formulas Used"
              items={[
                { zh: "前向差分", en: "Forward Difference", latex: "D^{+}f(x)=\\dfrac{f(x+h)-f(x)}{h}" },
                { zh: "后向差分", en: "Backward Difference", latex: "D^{-}f(x)=\\dfrac{f(x)-f(x-h)}{h}" },
                { zh: "中心差分", en: "Central Difference", latex: "f'(x)\\approx\\dfrac{f(x+h)-f(x-h)}{2h}" },
                {
                  zh: "三点二阶导",
                  en: "3-point Second Derivative",
                  latex: "f''(x)\\approx\\dfrac{f(x+h)-2f(x)+f(x-h)}{h^2}",
                },
              ]}
            />

            <DemoResultTable
              captionZh={`方法结果：f(x)=${model.expression}`}
              captionEn={`Results for f(x)=${model.expression}`}
              rows={computation.results}
              columns={[
                { key: "method", title: "Method / 方法", render: (row) => row.label },
                { key: "formula", title: "Formula", render: (row) => <MathFormula latex={row.formula} className="text-[12px]" /> },
                { key: "value", title: "Approximation / 近似", render: (row) => formatNumber(row.value, 10) },
                {
                  key: "reference",
                  title: "Reference / 参考值",
                  render: (row) => (row.reference !== undefined ? formatNumber(row.reference, 10) : "--"),
                },
                { key: "error", title: "Error / 误差", render: (row) => <ErrorBadge error={row.error} /> },
              ]}
            />

            <DemoResultTable
              captionZh="采样表"
              captionEn="Sample Table"
              rows={computation.samples}
              columns={[
                { key: "x", title: "x", render: (row) => formatNumber(row.x, 8) },
                { key: "fx", title: "f(x)", render: (row) => formatNumber(row.fx, 10) },
              ]}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

