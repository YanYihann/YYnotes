import type { FunctionBuildInput, FunctionModel } from "@/lib/numerical/types";

const SUPPORTED_IDENTIFIERS = new Set([
  "x",
  "PI",
  "E",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "log",
  "sqrt",
  "abs",
  "floor",
  "ceil",
  "pow",
  "min",
  "max",
]);

const EXPR_ALLOWED_CHARS = /^[0-9A-Za-z_+\-*/().,^\s]*$/;

function normalizeExpression(source: string): string {
  return source
    .replace(/\^/g, "**")
    .replace(/\bln\s*\(/gi, "log(")
    .replace(/\bpi\b/gi, "PI")
    .replace(/\be\b/g, "E")
    .trim();
}

function compileExpression(expression: string): (x: number) => number {
  const normalized = normalizeExpression(expression);

  if (!normalized) {
    throw new Error("Please provide a function expression.");
  }

  if (!EXPR_ALLOWED_CHARS.test(normalized)) {
    throw new Error("Expression contains unsupported characters.");
  }

  const identifiers = normalized.match(/[A-Za-z_]+/g) ?? [];
  for (const identifier of identifiers) {
    if (!SUPPORTED_IDENTIFIERS.has(identifier)) {
      throw new Error(`Unsupported identifier: ${identifier}`);
    }
  }

  const evaluator = new Function(
    "x",
    "const { sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, log, sqrt, abs, floor, ceil, pow, min, max, PI, E } = Math; return (" +
      normalized +
      ");",
  ) as (x: number) => number;

  const tested = evaluator(0);
  if (!Number.isFinite(tested)) {
    throw new Error("Expression produced an invalid value at x = 0.");
  }

  return (x: number) => {
    const value = evaluator(x);
    if (!Number.isFinite(value)) {
      throw new Error("Function evaluation returned a non-finite value.");
    }
    return value;
  };
}

function firstDerivativeReference(fn: (x: number) => number, x: number): number {
  const h = 1e-5;
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

function secondDerivativeReference(fn: (x: number) => number, x: number): number {
  const h = 1e-4;
  return (fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h);
}

function simpsonPanel(fn: (x: number) => number, a: number, b: number): number {
  const mid = (a + b) / 2;
  return ((b - a) / 6) * (fn(a) + 4 * fn(mid) + fn(b));
}

function adaptiveSimpson(
  fn: (x: number) => number,
  a: number,
  b: number,
  eps: number,
  whole: number,
  depth: number,
): number {
  const mid = (a + b) / 2;
  const left = simpsonPanel(fn, a, mid);
  const right = simpsonPanel(fn, mid, b);
  const correction = left + right - whole;

  if (depth <= 0 || Math.abs(correction) < 15 * eps) {
    return left + right + correction / 15;
  }

  return (
    adaptiveSimpson(fn, a, mid, eps / 2, left, depth - 1) +
    adaptiveSimpson(fn, mid, b, eps / 2, right, depth - 1)
  );
}

function integralReference(fn: (x: number) => number, a: number, b: number): number {
  if (a === b) {
    return 0;
  }

  const sign = a < b ? 1 : -1;
  const left = sign === 1 ? a : b;
  const right = sign === 1 ? b : a;
  const whole = simpsonPanel(fn, left, right);
  return sign * adaptiveSimpson(fn, left, right, 1e-8, whole, 14);
}

const PRESET_FUNCTIONS: FunctionModel[] = [
  {
    id: "square",
    label: { zh: "二次函数 f(x)=x^2", en: "Quadratic f(x)=x^2" },
    expression: "x^2",
    fn: (x) => x * x,
    derivative: (x) => 2 * x,
    secondDerivative: () => 2,
    integral: (a, b) => (b ** 3 - a ** 3) / 3,
  },
  {
    id: "exp",
    label: { zh: "指数函数 f(x)=exp(x)", en: "Exponential f(x)=exp(x)" },
    expression: "exp(x)",
    fn: (x) => Math.exp(x),
    derivative: (x) => Math.exp(x),
    secondDerivative: (x) => Math.exp(x),
    integral: (a, b) => Math.exp(b) - Math.exp(a),
  },
  {
    id: "inv-one-plus-square",
    label: { zh: "f(x)=1/(1+x^2)", en: "f(x)=1/(1+x^2)" },
    expression: "1/(1+x^2)",
    fn: (x) => 1 / (1 + x * x),
    derivative: (x) => (-2 * x) / (1 + x * x) ** 2,
    secondDerivative: (x) => (2 * (3 * x * x - 1)) / (1 + x * x) ** 3,
    integral: (a, b) => Math.atan(b) - Math.atan(a),
  },
  {
    id: "sin",
    label: { zh: "三角函数 f(x)=sin(x)", en: "Trigonometric f(x)=sin(x)" },
    expression: "sin(x)",
    fn: (x) => Math.sin(x),
    derivative: (x) => Math.cos(x),
    secondDerivative: (x) => -Math.sin(x),
    integral: (a, b) => -Math.cos(b) + Math.cos(a),
  },
];

export function getFunctionPresets(): FunctionModel[] {
  return PRESET_FUNCTIONS;
}

export function getFunctionPresetById(id: string): FunctionModel | undefined {
  return PRESET_FUNCTIONS.find((preset) => preset.id === id);
}

export function buildFunctionModel(input: FunctionBuildInput): FunctionModel {
  const customExpression = input.customExpression?.trim();

  if (customExpression) {
    const compiled = compileExpression(customExpression);

    return {
      id: "custom",
      label: {
        zh: `自定义函数 f(x)=${customExpression}`,
        en: `Custom function f(x)=${customExpression}`,
      },
      expression: customExpression,
      fn: compiled,
      derivative: (x) => firstDerivativeReference(compiled, x),
      secondDerivative: (x) => secondDerivativeReference(compiled, x),
      integral: (a, b) => integralReference(compiled, a, b),
      isCustom: true,
    };
  }

  return getFunctionPresetById(input.presetId ?? "") ?? PRESET_FUNCTIONS[0];
}
