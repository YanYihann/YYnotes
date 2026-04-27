"use client";

import { useMemo, useState } from "react";
import type { DynamicInteractiveDemoSpec } from "@/lib/dynamic-demo-components";
import { cn } from "@/lib/utils";

type AutoInteractiveDemoRendererProps = {
  spec: DynamicInteractiveDemoSpec;
  anchorId?: string;
};

function parseSetInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[，,、\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formatSet(values: string[]): string {
  return values.length ? `{ ${values.join(", ")} }` : "{ }";
}

function computeSetOperation(left: string[], right: string[], operation: string): string[] {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  switch (operation) {
    case "intersection":
      return left.filter((item) => rightSet.has(item));
    case "difference":
      return left.filter((item) => !rightSet.has(item));
    case "symmetric_difference":
      return [...left.filter((item) => !rightSet.has(item)), ...right.filter((item) => !leftSet.has(item))];
    case "union":
    default:
      return Array.from(new Set([...left, ...right]));
  }
}

function operationLabel(value: string): string {
  switch (value) {
    case "intersection":
      return "交集";
    case "difference":
      return "差集";
    case "symmetric_difference":
      return "对称差集";
    case "union":
    default:
      return "并集";
  }
}

function GenericRuntime({ spec, anchorId }: AutoInteractiveDemoRendererProps) {
  return (
    <section id={anchorId} className="my-6 rounded-apple border border-border bg-card px-5 py-5 shadow-card">
      <h3 className="font-display text-[30px] font-semibold tracking-tight text-foreground">{spec.title}</h3>
      {spec.description ? <p className="mt-3 font-text text-[15px] leading-[1.6] text-muted-foreground">{spec.description}</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">输入项</p>
          <ul className="mt-3 space-y-2 font-text text-[14px] leading-[1.55] text-foreground">
            {spec.inputs.map((input) => (
              <li key={input.name}>{input.label}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">可观察输出</p>
          <ul className="mt-3 space-y-2 font-text text-[14px] leading-[1.55] text-foreground">
            {spec.outputs.map((output) => (
              <li key={output.name}>{output.label}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">可点击操作</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {spec.buttons.map((button) => (
              <span key={button.action} className="rounded-full border border-border px-3 py-1 text-[13px] text-foreground">
                {button.label}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
          <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">学习任务</p>
          <p className="mt-3 font-text text-[14px] leading-[1.65] text-foreground">{spec.learnerTask || "修改输入并观察输出变化。"}</p>
        </section>
      </div>
    </section>
  );
}

function SetOperationsRuntime({ spec, anchorId }: AutoInteractiveDemoRendererProps) {
  const operationInput = spec.inputs.find((input) => input.name === "operation");
  const operations = operationInput?.options?.length
    ? operationInput.options
    : ["union", "intersection", "difference", "symmetric_difference"];
  const [setA, setSetA] = useState((spec.initialSetA ?? []).map(String).join(", "));
  const [setB, setSetB] = useState((spec.initialSetB ?? []).map(String).join(", "));
  const [operation, setOperation] = useState(spec.defaultOperation ?? operations[0] ?? "union");

  const parsedA = useMemo(() => parseSetInput(setA), [setA]);
  const parsedB = useMemo(() => parseSetInput(setB), [setB]);
  const result = useMemo(() => computeSetOperation(parsedA, parsedB, operation), [operation, parsedA, parsedB]);

  return (
    <section id={anchorId} className="my-6 rounded-apple border border-border bg-card px-5 py-5 shadow-card">
      <div className="space-y-2">
        <h3 className="font-display text-[30px] font-semibold tracking-tight text-foreground">{spec.title}</h3>
        {spec.description ? <p className="font-text text-[15px] leading-[1.6] text-muted-foreground">{spec.description}</p> : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="font-text text-[13px] font-semibold text-foreground">集合 A</span>
            <input
              value={setA}
              onChange={(event) => setSetA(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              placeholder="例如：1, 2, 3, 4"
            />
          </label>

          <label className="block space-y-2">
            <span className="font-text text-[13px] font-semibold text-foreground">集合 B</span>
            <input
              value={setB}
              onChange={(event) => setSetB(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
              placeholder="例如：3, 4, 5, 6"
            />
          </label>

          <label className="block space-y-2">
            <span className="font-text text-[13px] font-semibold text-foreground">运算方式</span>
            <select
              value={operation}
              onChange={(event) => setOperation(event.target.value)}
              className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
            >
              {operations.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            {operations.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setOperation(item)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  operation === item
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                运行 {item}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">当前结果</p>
            <p className="mt-3 font-display text-[28px] font-semibold tracking-tight text-foreground">{operationLabel(operation)}</p>
            <p className="mt-3 font-mono text-[18px] text-foreground">{formatSet(result)}</p>
          </section>

          <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">当前配置</p>
            <ul className="mt-3 space-y-2 font-text text-[14px] leading-[1.6] text-foreground">
              <li>集合 A：{formatSet(parsedA)}</li>
              <li>集合 B：{formatSet(parsedB)}</li>
              <li>运算：{operation}</li>
            </ul>
          </section>

          {spec.compareCases.length ? (
            <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
              <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">对比情形</p>
              <ul className="mt-3 space-y-2 font-text text-[14px] leading-[1.6] text-muted-foreground">
                {spec.compareCases.map((item) => (
                  <li key={item.label}>
                    <span className="font-semibold text-foreground">{item.label}</span>
                    {item.expected ? `：${item.expected}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {spec.learnerTask ? (
            <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
              <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">学习任务</p>
              <p className="mt-3 font-text text-[14px] leading-[1.65] text-foreground">{spec.learnerTask}</p>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function AutoInteractiveDemoRenderer(props: AutoInteractiveDemoRendererProps) {
  if (props.spec.kind === "set-operations") {
    return <SetOperationsRuntime {...props} />;
  }

  return <GenericRuntime {...props} />;
}
