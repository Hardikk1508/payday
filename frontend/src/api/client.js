const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} on ${path}`);
  }
  return res.json();
}

export function fetchSimulation({ customers = 5000, seed = 42 } = {}) {
  return get("/simulate", { customers, seed });
}

export function fetchDecisions({ failureCode, limit = 50 } = {}) {
  return get("/decisions", failureCode ? { failure_code: failureCode, limit } : { limit });
}

export function fetchFailureCodes() {
  return get("/failure-codes");
}
