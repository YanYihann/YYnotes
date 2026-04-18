import type { FunctionModel, MethodError } from "@/lib/numerical/types";

export type DifferentiationResult = {
  method: "forward" | "backward" | "central" | "second-derivative";
  label: string;
  formula: string;
  value: number;
  reference?: number;
  error?: MethodError;
};

export type DifferentiationTableRow = {
  x: number;
  fx: number;
};

export type DifferentiationComputation = {
  x: number;
  h: number;
  samples: DifferentiationTableRow[];
  results: DifferentiationResult[];
};

function toError(value: number, reference?: number): MethodError | undefined {
  if (reference === undefined || !Number.isFinite(reference)) {
    return undefined;
  }

  const absolute = Math.abs(value - reference);
  const relative = Math.abs(reference) > 1e-12 ? absolute / Math.abs(reference) : absolute;

  return { absolute, relative };
}

export function forwardDifference(fn: (x: number) => number, x: number, h: number): number {
  return (fn(x + h) - fn(x)) / h;
}

export function backwardDifference(fn: (x: number) => number, x: number, h: number): number {
  return (fn(x) - fn(x - h)) / h;
}

export function centralDifference(fn: (x: number) => number, x: number, h: number): number {
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

export function centralSecondDerivative(fn: (x: number) => number, x: number, h: number): number {
  return (fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h);
}

export function computeDifferentiation(
  model: FunctionModel,
  x: number,
  h: number,
): DifferentiationComputation {
  const safeH = Math.abs(h) > 1e-12 ? h : 1e-3;
  const fn = model.fn;

  const sampleValues: DifferentiationTableRow[] = [
    { x: x - safeH, fx: fn(x - safeH) },
    { x, fx: fn(x) },
    { x: x + safeH, fx: fn(x + safeH) },
  ];

  const forward = forwardDifference(fn, x, safeH);
  const backward = backwardDifference(fn, x, safeH);
  const central = centralDifference(fn, x, safeH);
  const second = centralSecondDerivative(fn, x, safeH);

  const firstRef = model.derivative?.(x);
  const secondRef = model.secondDerivative?.(x);

  const results: DifferentiationResult[] = [
    {
      method: "forward",
      label: "Forward Difference / 前向差分",
      formula: "D^{+}f(x)=\\dfrac{f(x+h)-f(x)}{h}",
      value: forward,
      reference: firstRef,
      error: toError(forward, firstRef),
    },
    {
      method: "backward",
      label: "Backward Difference / 后向差分",
      formula: "D^{-}f(x)=\\dfrac{f(x)-f(x-h)}{h}",
      value: backward,
      reference: firstRef,
      error: toError(backward, firstRef),
    },
    {
      method: "central",
      label: "Central Difference / 中心差分",
      formula: "f'(x)\\approx\\dfrac{f(x+h)-f(x-h)}{2h}",
      value: central,
      reference: firstRef,
      error: toError(central, firstRef),
    },
    {
      method: "second-derivative",
      label: "3-point 2nd Derivative / 三点二阶导",
      formula: "f''(x)\\approx\\dfrac{f(x+h)-2f(x)+f(x-h)}{h^2}",
      value: second,
      reference: secondRef,
      error: toError(second, secondRef),
    },
  ];

  return {
    x,
    h: safeH,
    samples: sampleValues,
    results,
  };
}
