import type { FunctionModel, MethodError } from "@/lib/numerical/types";

export type IntegrationMethod = "right-endpoint" | "trapezoidal" | "simpson";

export type IntegrationSample = {
  x: number;
  fx: number;
};

export type IntegrationStep = {
  index: number;
  xLeft: number;
  xRight: number;
  xSample: number;
  weight: number;
  fxSample: number;
  contribution: number;
};

export type IntegrationComputation = {
  method: IntegrationMethod;
  n: number;
  h: number;
  approximation: number;
  reference?: number;
  error?: MethodError;
  samples: IntegrationSample[];
  steps: IntegrationStep[];
};

export type IntegrationComparisonRow = {
  method: IntegrationMethod;
  label: string;
  approximation: number;
  reference?: number;
  error?: MethodError;
  n: number;
};

export type RombergBaseRow = {
  level: number;
  n: number;
  trapezoid: number;
  error?: MethodError;
};

export type RombergComputation = {
  levels: number;
  table: number[][];
  baseRows: RombergBaseRow[];
  reference?: number;
  finalEstimate: number;
  finalError?: MethodError;
};

function toError(value: number, reference?: number): MethodError | undefined {
  if (reference === undefined || !Number.isFinite(reference)) {
    return undefined;
  }

  const absolute = Math.abs(value - reference);
  const relative = Math.abs(reference) > 1e-12 ? absolute / Math.abs(reference) : absolute;

  return { absolute, relative };
}

function normalizeBounds(a: number, b: number): { left: number; right: number; sign: 1 | -1 } {
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

export function computeIntegrationMethod(
  model: FunctionModel,
  a: number,
  b: number,
  nInput: number,
  method: IntegrationMethod,
): IntegrationComputation {
  const fn = model.fn;
  const bounds = normalizeBounds(a, b);
  const n = ensureN(method, nInput);
  const h = (bounds.right - bounds.left) / n;
  const samples: IntegrationSample[] = [];

  for (let i = 0; i <= n; i += 1) {
    const x = bounds.left + i * h;
    samples.push({ x, fx: fn(x) });
  }

  const steps: IntegrationStep[] = [];
  let rawApproximation = 0;

  if (method === "right-endpoint") {
    for (let i = 1; i <= n; i += 1) {
      const xLeft = bounds.left + (i - 1) * h;
      const xRight = bounds.left + i * h;
      const xSample = xRight;
      const fxSample = fn(xSample);
      const contribution = h * fxSample;

      steps.push({
        index: i,
        xLeft,
        xRight,
        xSample,
        weight: 1,
        fxSample,
        contribution,
      });

      rawApproximation += contribution;
    }
  }

  if (method === "trapezoidal") {
    rawApproximation = 0;

    for (let i = 0; i <= n; i += 1) {
      const x = bounds.left + i * h;
      const fx = fn(x);
      const weight = i === 0 || i === n ? 0.5 : 1;
      const contribution = h * weight * fx;

      steps.push({
        index: i,
        xLeft: Math.max(bounds.left, x - h),
        xRight: Math.min(bounds.right, x + h),
        xSample: x,
        weight,
        fxSample: fx,
        contribution,
      });

      rawApproximation += contribution;
    }
  }

  if (method === "simpson") {
    rawApproximation = 0;

    for (let i = 0; i <= n; i += 1) {
      const x = bounds.left + i * h;
      const fx = fn(x);
      const weight = i === 0 || i === n ? 1 : i % 2 === 0 ? 2 : 4;
      const contribution = (h / 3) * weight * fx;

      steps.push({
        index: i,
        xLeft: Math.max(bounds.left, x - h),
        xRight: Math.min(bounds.right, x + h),
        xSample: x,
        weight,
        fxSample: fx,
        contribution,
      });

      rawApproximation += contribution;
    }
  }

  const approximation = bounds.sign * rawApproximation;
  const reference = model.integral?.(a, b);

  return {
    method,
    n,
    h,
    approximation,
    reference,
    error: toError(approximation, reference),
    samples,
    steps,
  };
}

export function compareIntegrationMethods(
  model: FunctionModel,
  a: number,
  b: number,
  nInput: number,
): IntegrationComparisonRow[] {
  const right = computeIntegrationMethod(model, a, b, nInput, "right-endpoint");
  const trap = computeIntegrationMethod(model, a, b, nInput, "trapezoidal");
  const simpson = computeIntegrationMethod(model, a, b, nInput, "simpson");

  return [
    {
      method: "right-endpoint",
      label: "Right Endpoint / 右端点",
      approximation: right.approximation,
      reference: right.reference,
      error: right.error,
      n: right.n,
    },
    {
      method: "trapezoidal",
      label: "Trapezoidal / 梯形公式",
      approximation: trap.approximation,
      reference: trap.reference,
      error: trap.error,
      n: trap.n,
    },
    {
      method: "simpson",
      label: "Simpson 1/3 / 辛普森 1/3",
      approximation: simpson.approximation,
      reference: simpson.reference,
      error: simpson.error,
      n: simpson.n,
    },
  ];
}

export function buildComparisonSeries(
  model: FunctionModel,
  a: number,
  b: number,
  maxPower: number,
): Array<{ n: number; right?: number; trap?: number; simpson?: number }> {
  const rows: Array<{ n: number; right?: number; trap?: number; simpson?: number }> = [];
  const reference = model.integral?.(a, b);

  for (let p = 1; p <= Math.max(1, maxPower); p += 1) {
    const n = 2 ** p;
    const compared = compareIntegrationMethods(model, a, b, n);

    const right = compared.find((item) => item.method === "right-endpoint");
    const trap = compared.find((item) => item.method === "trapezoidal");
    const simpson = compared.find((item) => item.method === "simpson");

    rows.push({
      n,
      right: right?.error?.absolute ?? (reference !== undefined ? Math.abs(right!.approximation - reference) : undefined),
      trap: trap?.error?.absolute ?? (reference !== undefined ? Math.abs(trap!.approximation - reference) : undefined),
      simpson: simpson?.error?.absolute ?? (reference !== undefined ? Math.abs(simpson!.approximation - reference) : undefined),
    });
  }

  return rows;
}

export function computeRomberg(
  model: FunctionModel,
  a: number,
  b: number,
  levelsInput: number,
): RombergComputation {
  const levels = Math.max(2, Math.floor(levelsInput));
  const table: number[][] = Array.from({ length: levels }, () => []);
  const baseRows: RombergBaseRow[] = [];

  for (let k = 0; k < levels; k += 1) {
    const n = 2 ** k;
    const trap = computeIntegrationMethod(model, a, b, n, "trapezoidal");
    table[k][0] = trap.approximation;
    baseRows.push({
      level: k,
      n: trap.n,
      trapezoid: trap.approximation,
      error: trap.error,
    });

    for (let j = 1; j <= k; j += 1) {
      const factor = 4 ** j;
      table[k][j] = table[k][j - 1] + (table[k][j - 1] - table[k - 1][j - 1]) / (factor - 1);
    }
  }

  const finalEstimate = table[levels - 1][levels - 1];
  const reference = model.integral?.(a, b);

  return {
    levels,
    table,
    baseRows,
    reference,
    finalEstimate,
    finalError: toError(finalEstimate, reference),
  };
}
