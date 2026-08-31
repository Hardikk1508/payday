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

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} on ${path}`);
  }
  return res.json();
}

export function fetchSimulation({ customers = 5000, seed = 42, streamLimit } = {}) {
  const params = { customers, seed };
  if (streamLimit !== undefined) params.stream_limit = streamLimit;
  return get("/simulate", params);
}

export function fetchDecisions({ failureCode, limit = 50, customers, seed } = {}) {
  const params = { limit };
  if (failureCode) params.failure_code = failureCode;
  if (customers) params.customers = customers;
  if (seed) params.seed = seed;
  return get("/decisions", params);
}

export function fetchFailureCodes() {
  return get("/failure-codes");
}

export function diagnoseDecline(rawText) {
  return post("/diagnose", { raw_text: rawText });
}

export function fetchDiagnoseExamples() {
  return get("/diagnose/examples");
}

export function fetchOutreachCopy({ chargeId, day, kind, customers = 5000, seed = 42 }) {
  return get("/outreach-copy", { charge_id: chargeId, day, kind, customers, seed });
}

export function fetchLedger({ limit = 20, kind } = {}) {
  const params = { limit };
  if (kind) params.kind = kind;
  return get("/ledger", params);
}
