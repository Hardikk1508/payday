export function inr(n) {
  return "\u20B9" + Math.round(n).toLocaleString("en-IN");
}

export function pct(n, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

export function signedPct(n, digits = 0) {
  const v = n * 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
