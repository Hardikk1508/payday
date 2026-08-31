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

export function timeAgo(isoString) {
  const seconds = Math.max(0, (Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
