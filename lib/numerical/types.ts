export type BilingualText = {
  zh: string;
  en: string;
};

export type FunctionModel = {
  id: string;
  label: BilingualText;
  expression: string;
  fn: (x: number) => number;
  derivative?: (x: number) => number;
  secondDerivative?: (x: number) => number;
  integral?: (a: number, b: number) => number;
  isCustom?: boolean;
};

export type FunctionBuildInput = {
  presetId?: string;
  customExpression?: string;
};

export type MethodError = {
  absolute: number;
  relative: number;
};

export type MethodResult = {
  value: number;
  error?: MethodError;
};
