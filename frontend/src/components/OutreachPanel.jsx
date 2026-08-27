import { useEffect, useState } from "react";
import { fetchSimulation, fetchOutreachCopy } from "../api/client.js";
import { INK, PANEL, LINE, TEXT, MUTE, GOLD, VIOLET, RUST, FONT_SANS, FONT_MONO } from "../lib/theme.js";
import Reveal from "./Reveal.jsx";

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

function Thinking() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }} aria-hidden="true">
      <span className="think-dot" style={{ animationDelay: "0ms" }} />
      <span className="think-dot" style={{ animationDelay: "140ms" }} />
      <span className="think-dot" style={{ animationDelay: "280ms" }} />
    </span>
  );
}

function OutreachRow({ target, index }) {
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
    <div
      className="outreach-row"
      style={{ borderBottom: `1px solid ${LINE}`, padding: "14px 0", animationDelay: `${index * 90}ms` }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div style={{ fontSize: 13, color: TEXT }}>{target.name}</div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>
            {KIND_LABEL[target.kind] ?? target.kind} &middot; day {target.day} &middot; {target.reason}
          </div>
        </div>
        {!copy && (
          <button
            className="ctl gen-btn"
            onClick={generate}
            disabled={loading}
            style={{
              background: "transparent", border: `1px solid ${VIOLET}`, color: VIOLET,
              fontSize: 12, padding: "6px 14px", cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.75 : 1, flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            {loading ? (
              <>
                Generating <Thinking />
              </>
            ) : (
              "Generate message"
            )}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: RUST, marginTop: 8 }}>{error}</div>}
      {copy && (
        <div
          className="copy-in"
          style={{ marginTop: 10, background: PANEL, border: `1px solid ${LINE}`, padding: "12px 14px" }}
        >
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
      <style>{`
        .think-dot {
          width: 5px; height: 5px; border-radius: 50%; background: ${VIOLET};
          animation: thinkPulse 900ms ease-in-out infinite both;
        }
        @keyframes thinkPulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .outreach-row { animation: rowIn 500ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .copy-in { animation: copyIn 420ms cubic-bezier(0.16, 1, 0.3, 1) both; transform-origin: top; }
        @keyframes copyIn {
          from { opacity: 0; transform: translateY(-6px) scaleY(0.96); }
          to { opacity: 1; transform: translateY(0) scaleY(1); }
        }
        .gen-btn:hover:not(:disabled) { background: ${VIOLET}22; transform: translateY(-1px); }
        .gen-btn { transition: transform 180ms ease, background 180ms ease, opacity 180ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .outreach-row, .copy-in, .think-dot { animation: none !important; }
        }
      `}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }} className="px-5 sm:px-7 py-10">
        <Reveal>
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
        </Reveal>

        {error && <div style={{ fontSize: 12, color: RUST }}>{error}</div>}
        {!error && targets.length === 0 && (
          <div style={{ fontSize: 12, color: MUTE }}>Loading&hellip;</div>
        )}
        <div>
          {targets.map((t, i) => (
            <OutreachRow key={t.chargeId} target={t} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
