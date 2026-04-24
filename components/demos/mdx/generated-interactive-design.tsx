"use client";

import { useMemo, useState } from "react";
import type { InteractiveDesignControl, InteractiveDesignSpec } from "@/lib/interactive-demos";

type GeneratedInteractiveDesignProps = {
  encodedSpec: string;
  anchorId?: string;
};

function decodeSpec(encodedSpec: string): InteractiveDesignSpec | null {
  try {
    const decoded = decodeURIComponent(encodedSpec);
    const parsed = JSON.parse(decoded) as InteractiveDesignSpec;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function renderValue(control: InteractiveDesignControl, value: string | number | boolean) {
  if (control.type === "select") {
    return control.optionsZh[Number(value) || 0] ?? control.optionsZh[0] ?? "";
  }

  if (control.type === "slider") {
    const unit = control.unitZh ? ` ${control.unitZh}` : "";
    return `${value}${unit}`;
  }

  return value ? "开启" : "关闭";
}

export function GeneratedInteractiveDesign({ encodedSpec, anchorId }: GeneratedInteractiveDesignProps) {
  const spec = useMemo(() => decodeSpec(encodedSpec), [encodedSpec]);
  const initialState = useMemo(() => {
    if (!spec) {
      return {};
    }

    return Object.fromEntries(
      spec.controls.map((control) => {
        if (control.type === "select") {
          return [control.id, control.initialIndex ?? 0];
        }

        if (control.type === "slider") {
          return [control.id, control.initialValue ?? control.min];
        }

        return [control.id, control.initialValue ?? false];
      }),
    ) as Record<string, string | number | boolean>;
  }, [spec]);

  const [values, setValues] = useState<Record<string, string | number | boolean>>(initialState);

  if (!spec) {
    return null;
  }

  return (
    <section id={anchorId} className="my-6 rounded-apple border border-border bg-card px-5 py-5 shadow-card">
      <p className="font-text text-[15px] leading-[1.6] text-muted-foreground">
        {spec.summaryZh}
        <span className="ui-en ml-1">{spec.summaryEn}</span>
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          {spec.controls.map((control) => {
            if (control.type === "select") {
              const currentIndex = Number(values[control.id] ?? control.initialIndex ?? 0);
              return (
                <label key={control.id} className="block space-y-2">
                  <span className="font-text text-[13px] font-semibold tracking-tightCaption text-foreground">
                    {control.labelZh}
                    <span className="ui-en ml-1 font-normal text-muted-foreground">{control.labelEn}</span>
                  </span>
                  <select
                    value={currentIndex}
                    onChange={(event) => setValues((state) => ({ ...state, [control.id]: Number(event.target.value) }))}
                    className="w-full rounded-apple border border-input bg-background px-3 py-2 font-text text-[14px] text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
                  >
                    {control.optionsZh.map((option, index) => (
                      <option key={`${control.id}-${option}`} value={index}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            if (control.type === "slider") {
              const currentValue = Number(values[control.id] ?? control.initialValue ?? control.min);
              return (
                <label key={control.id} className="block space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-text text-[13px] font-semibold tracking-tightCaption text-foreground">
                      {control.labelZh}
                      <span className="ui-en ml-1 font-normal text-muted-foreground">{control.labelEn}</span>
                    </span>
                    <span className="font-text text-[13px] text-muted-foreground">{renderValue(control, currentValue)}</span>
                  </div>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step ?? 1}
                    value={currentValue}
                    onChange={(event) => setValues((state) => ({ ...state, [control.id]: Number(event.target.value) }))}
                    className="w-full accent-primary"
                  />
                </label>
              );
            }

            const currentValue = Boolean(values[control.id] ?? control.initialValue ?? false);
            return (
              <label key={control.id} className="flex items-center gap-3 rounded-apple border border-border bg-muted/30 px-3 py-3">
                <input
                  type="checkbox"
                  checked={currentValue}
                  onChange={(event) => setValues((state) => ({ ...state, [control.id]: event.target.checked }))}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="font-text text-[13px] text-foreground">
                  {control.labelZh}
                  <span className="ui-en ml-1 text-muted-foreground">{control.labelEn}</span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="space-y-4">
          <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              当前配置
              <span className="ui-en ml-1">Current Setup</span>
            </p>
            <ul className="mt-3 space-y-2 font-text text-[14px] leading-[1.55] text-foreground">
              {spec.controls.map((control) => (
                <li key={`current-${control.id}`}>
                  {control.labelZh}：{renderValue(control, values[control.id] ?? initialState[control.id])}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              观察提示
              <span className="ui-en ml-1">What To Observe</span>
            </p>
            <ul className="mt-3 space-y-2 font-text text-[14px] leading-[1.55] text-muted-foreground">
              {spec.observationsZh.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-apple border border-border bg-background/70 px-4 py-4">
            <p className="font-text text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              建议操作
              <span className="ui-en ml-1">Suggested Steps</span>
            </p>
            <ol className="mt-3 space-y-2 font-text text-[14px] leading-[1.55] text-muted-foreground">
              {spec.tasksZh.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </section>
  );
}
