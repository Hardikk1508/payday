import { useEffect, useState } from "react";
import { fetchSimulation, fetchOutreachCopy } from "../api/client.js";
import { INK, PANEL, LINE, TEXT, MUTE, GOLD, VIOLET, RUST, FONT_SANS, FONT_MONO } from "../lib/theme.js";

const SEED = 42;
const CUSTOMERS = 5000;

const KIND_LABEL = {
  outreach: "Outreach email",
  send_card_update_link: "Card-update request",
};

// Outreach/card-update actions almost never land on the day a charge
// clears (per outcome_model.py they nudge a *later* retry, they don't
// themselves succeed) so they don't surface in the race's per-charge
// ticker. Scan every logged attempt directly instead, one example per
// charge, to find real ones to demo.
function pickOutreachTargets(sim, limit = 6) {
  const seen = new Set();
  const targets = [];
  for (const charge of sim.stream.agent) {
    if (targets.length >= limit) break;
    const attempt = charge.attempts.find(
      (a) => a.action === "outreach" || a.action === "send_card_update_link"
    );
    if (!attempt || seen.has(charge.charge_id)) continue;
    seen.add(charge.charge_id);
    targets.push({
      chargeId: charge.charge_id,
      name: charge.customer_name,
      day: attempt.day,
      kind: attempt.action,
      reason: attempt.reason,
    });
  }
  return targets;
}

function OutreachRow({ target }) {
  const [copy, setCopy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOutreachCopy({
        chargeId: target.chargeId, day: target.day, kind: target.kind,
        customers: CUSTOMERS, seed: SEED,
      });
      setCopy(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ borderBottom: `1px solid ${LINE}`, padding: "14px 0" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div style={{ fontSize: 13, color: TEXT }}>{target.name}</div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>
            {KIND_LABEL[target.kind] ?? target.kind} &middot; day {target.day} &middot; {target.reason}
          </div>
        </div>
        {!copy && (
          <button
            className="ctl"
            onClick={generate}
            disabled={loading}
            style={{
              background: "transparent", border: `1px solid ${VIOLET}`, color: VIOLET,
              fontSize: 12, padding: "6px 14px", cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1, flexShrink: 0,
            }}
          >
            {loading ? "Generating…" : "Generate message"}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: RUST, marginTop: 8 }}>{error}</div>}
      {copy && (
        <div style={{ marginTop: 10, background: PANEL, border: `1px solid ${LINE}`, padding: "12px 14px" }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: TEXT, fontWeight: 500 }}>
              {copy.subject}
            </div>
            <span
              style={{
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
                color: copy.source === "llm" ? GOLD : MUTE,
                border: `1px solid ${copy.source === "llm" ? GOLD : LINE}`, padding: "2px 8px", flexShrink: 0,
              }}
            >
              {copy.source === "llm" ? "groq" : "template"}
            </span>
          </div>
          <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: 0 }}>{copy.body}</p>
        </div>
      )}
    </div>
  );
}

export default function OutreachPanel() {
  const [targets, setTargets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSimulation({ customers: CUSTOMERS, seed: SEED, streamLimit: 400 })
      .then((sim) => setTargets(pickOutreachTargets(sim)))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ background: INK, borderTop: `1px solid ${LINE}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }} className="px-5 sm:px-7 py-10">
        <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTE, marginBottom: 10 }}>
          Live copy &middot; GET /outreach-copy
        </div>
        <h2 style={{ fontFamily: FONT_SANS, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, color: TEXT, margin: "0 0 8px" }}>
          What Payday actually says to the customer
        </h2>
        <p style={{ fontSize: 13, color: MUTE, maxWidth: 640, lineHeight: 1.6, margin: "0 0 20px" }}>
          The <code>reason</code> string on a logged decision is for the audit trail, not the
          inbox. These are real outreach and card-update actions from the cohort above
          (seed {SEED}) &mdash; generate the actual message Groq would send for each one.
        </p>

        {error && <div style={{ fontSize: 12, color: RUST }}>{error}</div>}
        {!error && targets.length === 0 && (
          <div style={{ fontSize: 12, color: MUTE }}>Loading&hellip;</div>
        )}
        <div>
          {targets.map((t) => (
            <OutreachRow key={t.chargeId} target={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
