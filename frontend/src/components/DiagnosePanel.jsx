import { useEffect, useState } from "react";
import { diagnoseDecline, fetchDiagnoseExamples } from "../api/client.js";
import { INK, PANEL, LINE, TEXT, MUTE, GOLD, VIOLET, RUST, FONT_SANS, FONT_MONO } from "../lib/theme.js";
import Reveal from "./Reveal.jsx";

const ACTION_LABELS = {
  retry: "Retry charge",
  send_card_update_link: "Send card-update link",
  switch_method: "Switch payment method",
  outreach: "Send outreach",
};

function ExampleChip({ text, onClick }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="ctl chip"
      style={{
        background: PANEL, border: `1px solid ${LINE}`, color: TEXT,
        fontSize: 11, padding: "6px 12px 6px 10px", cursor: "pointer", textAlign: "left",
        fontFamily: FONT_MONO, borderRadius: 3, display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      <span style={{ color: VIOLET }}>&#9656;</span>
      {text}
    </button>
  );
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

export default function DiagnosePanel() {
  const [examples, setExamples] = useState({});
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDiagnoseExamples().then(setExamples).catch(() => {});
  }, []);

  const runDiagnosis = async (raw) => {
    const input = raw ?? text;
    if (!input.trim()) return;
    setText(input);
    setLoading(true);
    setError(null);
    try {
      const res = await diagnoseDecline(input);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const flatExamples = Object.values(examples).flat().slice(0, 6);

  return (
    <div id="diagnose" style={{ background: INK, borderTop: `1px solid ${LINE}`, scrollMarginTop: 16 }}>
      <style>{`
        .think-dot {
          width: 5px; height: 5px; border-radius: 50%; background: ${VIOLET};
          animation: thinkPulse 900ms ease-in-out infinite both;
        }
        @keyframes thinkPulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .result-in { animation: resultIn 480ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes resultIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .plan-row { animation: planRowIn 380ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes planRowIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .chip:hover { border-color: ${VIOLET} !important; color: ${TEXT} !important; }
        .diagnose-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px -8px ${VIOLET}; }
        .diagnose-btn { transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .result-in, .plan-row, .think-dot { animation: none !important; }
        }
      `}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }} className="px-5 sm:px-7 py-10">
        <Reveal>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTE, marginBottom: 10 }}>
            Live diagnosis &middot; POST /diagnose
          </div>
          <h2 style={{ fontFamily: FONT_SANS, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, color: TEXT, margin: "0 0 8px" }}>
            Classify a raw decline, right now
          </h2>
          <p style={{ fontSize: 13, color: MUTE, maxWidth: 640, lineHeight: 1.6, margin: "0 0 20px" }}>
            Every charge in the race above already carries a clean failure code because the
            simulator wrote it. A real processor doesn't do that &mdash; it hands you a raw
            string. Paste one below (or pick an example) and this calls Groq to classify it
            into Payday's taxonomy and generate the plan, live.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Decline code 05: Do not honor"
                rows={3}
                className="ctl"
                style={{
                  width: "100%", background: PANEL, border: `1px solid ${LINE}`, color: TEXT,
                  fontSize: 13, padding: "10px 12px", fontFamily: FONT_MONO, resize: "vertical",
                }}
              />
              <div
                style={{
                  fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: MUTE, margin: "12px 0 8px",
                }}
              >
                Click one to try it &darr;
              </div>
              <div className="flex flex-wrap gap-2">
                {flatExamples.map((ex) => (
                  <ExampleChip key={ex} text={ex} onClick={runDiagnosis} />
                ))}
              </div>
              <button
                className="ctl diagnose-btn"
                onClick={() => runDiagnosis()}
                disabled={loading || !text.trim()}
                style={{
                  marginTop: 14, background: VIOLET, color: INK, border: "none",
                  padding: "9px 20px", fontSize: 13, fontWeight: 500,
                  cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
                  display: "inline-flex", alignItems: "center", gap: 10,
                }}
              >
                {loading ? (
                  <>
                    Classifying <Thinking />
                  </>
                ) : (
                  "Diagnose"
                )}
              </button>
              {error && (
                <div style={{ marginTop: 10, fontSize: 12, color: RUST }}>{error}</div>
              )}
            </div>

            <div style={{ background: PANEL, border: `1px solid ${LINE}`, minHeight: 200, padding: "18px 20px" }}>
              {!result ? (
                <div style={{ fontSize: 12, color: MUTE }}>
                  {loading ? <>Reasoning about it <Thinking /></> : "Result appears here."}
                </div>
              ) : (
                <div key={result.diagnosis.reasoning + result.diagnosis.code} className="result-in">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div style={{ fontFamily: FONT_SANS, fontSize: 16, fontWeight: 500, color: TEXT }}>
                      {result.diagnosis.label}
                    </div>
                    <span
                      style={{
                        fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.08em",
                        textTransform: "uppercase", color: result.diagnosis.source === "llm" ? GOLD : MUTE,
                        border: `1px solid ${result.diagnosis.source === "llm" ? GOLD : LINE}`,
                        padding: "2px 8px",
                      }}
                    >
                      {result.diagnosis.source === "llm" ? "groq" : "heuristic fallback"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>
                    confidence {(result.diagnosis.confidence * 100).toFixed(0)}%
                  </div>
                  <p style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, margin: "6px 0 16px" }}>
                    {result.diagnosis.reasoning}
                  </p>

                  <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginBottom: 8 }}>
                    Payday's plan for this family
                  </div>
                  <div>
                    {result.recommended_plan.map((a, i) => (
                      <div
                        key={i}
                        className="plan-row flex items-baseline gap-3 py-1.5"
                        style={{
                          borderBottom: i < result.recommended_plan.length - 1 ? `1px solid ${LINE}` : "none",
                          animationDelay: `${i * 70}ms`,
                        }}
                      >
                        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTE, minWidth: 40 }}>
                          d+{a.day}
                        </span>
                        <span style={{ fontSize: 12, color: VIOLET, minWidth: 150 }}>
                          {ACTION_LABELS[a.kind] ?? a.kind}
                        </span>
                        <span style={{ fontSize: 12, color: TEXT, flex: 1 }}>{a.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
