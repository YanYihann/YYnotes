export function formatNumber(value: number, digits = 8): string {
  if (!Number.isFinite(value)) {
    return "NaN";
  }

  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    return value.toExponential(Math.min(6, digits));
  }

  return value.toFixed(Math.min(10, digits));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
